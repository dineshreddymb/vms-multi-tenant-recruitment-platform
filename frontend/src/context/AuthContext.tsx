"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export interface VendorCompanyMembership {
  id: string;
  vendor_id: string;
  company_name: string;
  status: string;
}

export interface User {
  id: string;
  recruiter_reference?: string;
  email: string;
  name: string;
  role: "RECRUITER" | "VENDOR_USER";
  access_level?: "STANDARD" | "ADMIN";
  companies?: VendorCompanyMembership[];
  activeVendorId?: string;
  activeCompanyName?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, portalType: "vendor" | "recruiter", companyId?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setActiveVendorId: (vendorId: string) => void;
  isAdmin: boolean;
  isVendor: boolean;
  isRecruiter: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface DecodedJWT { sub: string; role: string; [key: string]: unknown; }

function decodeJWT(token: string): DecodedJWT | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload) as DecodedJWT;
  } catch {
    return null;
  }
}

function getCurrentPortalType(): "recruiter" | "vendor" | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  if (path.includes("/recruiter") || path.includes("/auth/recruiter")) {
    return "recruiter";
  }
  if (path.includes("/vendor") || path.includes("/auth/vendor")) {
    return "vendor";
  }
  return null;
}

/**
 * Resolves the authenticated recruiter's access_level, name, email, and recruiter_reference
 * by calling the self-profile endpoint. Falls back gracefully if unavailable.
 */
async function resolveRecruiterDetails(userId: string, fallbackEmail: string): Promise<{
  access_level: "STANDARD" | "ADMIN";
  name: string;
  email: string;
  recruiter_reference: string;
  companies: VendorCompanyMembership[];
}> {
  try {
    // Fetch own profile — available to all authenticated recruiters
    const me = await api.get<{
      id: string;
      recruiter_reference: string;
      name: string;
      email: string;
      access_level: string;
      companies?: VendorCompanyMembership[];
    }>("/api/v1/recruiter/me");
    return {
      access_level: me.access_level as "STANDARD" | "ADMIN",
      name: me.name || fallbackEmail,
      email: me.email || fallbackEmail,
      recruiter_reference: me.recruiter_reference || "",
      companies: me.companies || [],
    };
  } catch (err) {
    const errorObj = err as { status?: number };
    if (errorObj?.status === 401 || errorObj?.status === 403) {
      throw err;
    }
    // Fallback: try the admins list (only returns admins, so STANDARD gets empty)
    try {
      const admins = await api.get<{ id: string; recruiter_reference?: string; full_name?: string; email?: string }[]>("/api/v1/recruiter/admins");
      const self = admins.find((a) => a.id === userId);
      if (self) {
        return {
          access_level: "ADMIN",
          name: self.full_name || "Admin Recruiter",
          email: self.email || fallbackEmail,
          recruiter_reference: self.recruiter_reference || "",
          companies: [],
        };
      }
    } catch { /* ignore */ }
    return { access_level: "STANDARD", name: "Recruiter", email: fallbackEmail, recruiter_reference: "", companies: [] };
  }
}

interface VendorProfileResponse {
  id: string;
  name: string;
  email: string;
  active_vendor_id?: string;
  companies?: VendorCompanyMembership[];
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const resolveVendorUser = (profile: VendorProfileResponse): User => {
    const companies = profile.companies || [];
    const activeCompanies = companies.filter((c) => c.status === "ACTIVE");
    const savedActiveId = sessionStorage.getItem("vms_active_vendor_id");
    const matchingActive = activeCompanies.find((c) => c.vendor_id === savedActiveId);

    const activeVendor = matchingActive || activeCompanies[0];
    const activeVendorId = activeVendor?.vendor_id || profile.active_vendor_id;
    const activeCompanyName = activeVendor?.company_name || "";

    if (activeVendorId) {
      sessionStorage.setItem("vms_active_vendor_id", activeVendorId);
    }

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: "VENDOR_USER",
      companies: activeCompanies,
      activeVendorId,
      activeCompanyName,
    };
  };

  const setActiveVendorId = (vendorId: string) => {
    setUser((prev) => {
      if (!prev || prev.role !== "VENDOR_USER") return prev;
      const target = prev.companies?.find((c) => c.vendor_id === vendorId);
      if (!target) return prev;
      sessionStorage.setItem("vms_active_vendor_id", vendorId);
      return {
        ...prev,
        activeVendorId: vendorId,
        activeCompanyName: target.company_name,
      };
    });
  };

  // Re-usable: restore session from stored token on page reload
  const restoreSession = async () => {
    const portalType = getCurrentPortalType();
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("vms_access_token"); // Clean up/ignore legacy
    }

    if (!portalType) {
      setLoading(false);
      return;
    }

    const tokenKey = portalType === "recruiter" ? "vms_recruiter_access_token" : "vms_vendor_access_token";
    const emailKey = portalType === "recruiter" ? "vms_recruiter_user_email" : "vms_vendor_user_email";

    const token = sessionStorage.getItem(tokenKey);
    if (!token) {
      setLoading(false);
      return;
    }

    const decoded = decodeJWT(token);
    if (!decoded) {
      sessionStorage.removeItem(tokenKey);
      sessionStorage.removeItem(emailKey);
      setLoading(false);
      return;
    }

    const role: string = decoded.role;
    const userId: string = decoded.sub;
    const storedEmail = sessionStorage.getItem(emailKey) || "";

    // Security guard: ensure the token role matches the current portal route
    if (portalType === "recruiter" && role !== "RECRUITER") {
      sessionStorage.removeItem(tokenKey);
      sessionStorage.removeItem(emailKey);
      setLoading(false);
      return;
    }
    if (portalType === "vendor" && role !== "VENDOR_USER") {
      sessionStorage.removeItem(tokenKey);
      sessionStorage.removeItem(emailKey);
      setLoading(false);
      return;
    }

    try {
      if (role === "RECRUITER") {
        const companyId = decoded.company_id;
        const companyName = decoded.company_name;
        const details = await resolveRecruiterDetails(userId, storedEmail);
        setUser({
          id: userId,
          recruiter_reference: details.recruiter_reference,
          email: details.email,
          name: details.name,
          role: "RECRUITER",
          access_level: details.access_level,
          companies: details.companies,
          activeVendorId: companyId,
          activeCompanyName: companyName,
        });
      } else {
        const profile = await api.get<VendorProfileResponse>("/api/v1/vendor/profile");
        setUser(resolveVendorUser(profile));
      }
    } catch (err) {
      const errorObj = err as { status?: number; detail?: string };
      sessionStorage.removeItem(tokenKey);
      sessionStorage.removeItem(emailKey);
      setUser(null);
      if (errorObj.status === 403 && typeof errorObj.detail === "string" && errorObj.detail.toLowerCase().includes("deactivated")) {
        router.push("/auth/account-deactivated");
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    const portalType = getCurrentPortalType();
    if (!portalType) return;
    const tokenKey = portalType === "recruiter" ? "vms_recruiter_access_token" : "vms_vendor_access_token";
    const token = sessionStorage.getItem(tokenKey);
    if (!token) return;
    const decoded = decodeJWT(token);
    if (!decoded) return;

    if (user.role === "RECRUITER") {
      const details = await resolveRecruiterDetails(decoded.sub, user.email);
      setUser((prev) => prev ? { ...prev, ...details } : null);
    } else {
      const profile = await api.get<VendorProfileResponse>("/api/v1/vendor/profile");
      setUser(resolveVendorUser(profile));
    }
  };

  useEffect(() => {
    // Listen for global 401 events dispatched by the API client
    const handleUnauthorized = () => {
      setUser(null);
      setLoading(false);
      router.push("/");
    };

    // Listen for global 403 account deactivated events
    const handleDeactivated = () => {
      setUser(null);
      setLoading(false);
      router.push("/auth/account-deactivated");
      if (typeof window !== "undefined" && window.location.pathname !== "/auth/account-deactivated") {
        window.location.href = "/auth/account-deactivated";
      }
    };

    window.addEventListener("vms-unauthorized", handleUnauthorized);
    window.addEventListener("vms-account-deactivated", handleDeactivated);

    restoreSession();

    return () => {
      window.removeEventListener("vms-unauthorized", handleUnauthorized);
      window.removeEventListener("vms-account-deactivated", handleDeactivated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (
    email: string,
    password: string,
    portalType: "vendor" | "recruiter",
    companyId?: string
  ) => {
    setLoading(true);
    try {
      const endpoint =
        portalType === "vendor"
          ? "/api/v1/auth/vendor/login"
          : "/api/v1/auth/recruiter/login";
      const requestBody = portalType === "recruiter" 
        ? { email, password, company_id: companyId }
        : { email, password };

      const response = await api.post<{ access_token: string; token_type: string }>(
        endpoint,
        requestBody,
        { skipAuth: true }
      );

      const tokenKey = portalType === "recruiter" ? "vms_recruiter_access_token" : "vms_vendor_access_token";
      const emailKey = portalType === "recruiter" ? "vms_recruiter_user_email" : "vms_vendor_user_email";

      sessionStorage.setItem(tokenKey, response.access_token);
      sessionStorage.setItem(emailKey, email);
      sessionStorage.removeItem("vms_access_token"); // Clean up/ignore legacy

      const decoded = decodeJWT(response.access_token);
      if (!decoded) throw new Error("Invalid JWT received from backend.");

      const userId: string = decoded.sub;
      const role: string = decoded.role;
      const jwtCompanyId = decoded.company_id as string;
      const jwtCompanyName = decoded.company_name as string;

      if (role === "RECRUITER") {
        const details = await resolveRecruiterDetails(userId, email);
        setUser({
          id: userId,
          recruiter_reference: details.recruiter_reference,
          email: details.email,
          name: details.name,
          role: "RECRUITER",
          access_level: details.access_level,
          companies: details.companies,
          activeVendorId: jwtCompanyId,
          activeCompanyName: jwtCompanyName,
        });
        router.push("/recruiter/candidates");
      } else {
        const profile = await api.get<VendorProfileResponse>("/api/v1/vendor/profile");
        setUser(resolveVendorUser(profile));
        router.push("/vendor/dashboard");
      }
    } catch (e) {
      setUser(null);
      const errObj = e as { status?: number; detail?: string };
      if (errObj.status === 403 && typeof errObj.detail === "string" && errObj.detail.toLowerCase().includes("deactivated")) {
        router.push("/auth/account-deactivated");
        if (typeof window !== "undefined" && window.location.pathname !== "/auth/account-deactivated") {
          window.location.href = "/auth/account-deactivated";
        }
      }
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await api.post("/api/v1/auth/logout").catch(() => {});
    } finally {
      const portalType = getCurrentPortalType();
      if (portalType === "recruiter") {
        sessionStorage.removeItem("vms_recruiter_access_token");
        sessionStorage.removeItem("vms_recruiter_user_email");
      } else if (portalType === "vendor") {
        sessionStorage.removeItem("vms_vendor_access_token");
        sessionStorage.removeItem("vms_vendor_user_email");
        sessionStorage.removeItem("vms_active_vendor_id");
      } else {
        sessionStorage.removeItem("vms_recruiter_access_token");
        sessionStorage.removeItem("vms_recruiter_user_email");
        sessionStorage.removeItem("vms_vendor_access_token");
        sessionStorage.removeItem("vms_vendor_user_email");
        sessionStorage.removeItem("vms_active_vendor_id");
      }
      sessionStorage.removeItem("vms_access_token");
      sessionStorage.removeItem("vms_user_email");
      setUser(null);
      setLoading(false);
      router.push("/");
    }
  };

  const isAdmin = user?.role === "RECRUITER" && user.access_level === "ADMIN";
  const isVendor = user?.role === "VENDOR_USER";
  const isRecruiter = user?.role === "RECRUITER";

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshProfile,
        setActiveVendorId,
        isAdmin,
        isVendor,
        isRecruiter,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return {
      user: null,
      loading: false,
      login: async () => {},
      logout: async () => {},
      refreshProfile: async () => {},
      setActiveVendorId: () => {},
      isAdmin: false,
      isVendor: false,
      isRecruiter: false,
    };
  }
  return context;
};
