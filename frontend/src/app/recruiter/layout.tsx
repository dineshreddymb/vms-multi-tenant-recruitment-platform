"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

// Company-specific branding colors
const COMPANY_BRANDING = {
  IOSYS: {
    primaryColor: "#1F4E47",
    secondaryColor: "#2CDBA3",
    lightColor: "rgba(44, 219, 163, 0.15)",
    name: "IOSYS",
  },
  Volantis: {
    primaryColor: "#1E63E9",
    secondaryColor: "#3882F6",
    lightColor: "rgba(30, 99, 233, 0.1)",
    name: "VOLANTIS",
  },
  default: {
    primaryColor: "hsl(var(--primary-hsl))",
    secondaryColor: "hsl(var(--primary-hsl))",
    lightColor: "rgba(37, 99, 235, 0.1)",
    name: "VMS",
  }
};

// Helper to get company branding
const getCompanyBranding = (companyName?: string) => {
  if (!companyName) return COMPANY_BRANDING.default;
  
  const normalizedName = companyName.toLowerCase();
  if (normalizedName.includes("iosys")) {
    return COMPANY_BRANDING.IOSYS;
  } else if (normalizedName.includes("volantis")) {
    return COMPANY_BRANDING.Volantis;
  }
  return COMPANY_BRANDING.default;
};

const IosysLogo = () => {
  return (
    <svg width="54" height="24" viewBox="0 0 54 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <rect width="54" height="24" rx="3" fill="#1F4E47"/>
      {/* 'i' */}
      <rect x="5" y="7.5" width="2.2" height="10" rx="0.5" fill="#2CDBA3"/>
      <circle cx="6.1" cy="4.2" r="1.3" fill="#2CDBA3"/>
      {/* 'o' */}
      <circle cx="16.5" cy="12.5" r="5.5" fill="#2CDBA3"/>
      <path d="M12.5 12.5 C 14 9, 15.5 16, 20.5 12.5" stroke="#1F4E47" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      {/* 'S' */}
      <path d="M31.5 9.5 C30 8.5, 27.5 8.7, 27.5 10.3 C27.5 12.3, 31.5 12, 31.5 14 C31.5 15.7, 29 16.7, 27.5 15.7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* 'Y' */}
      <path d="M34.5 7.5 L37.5 12.5 L40.5 7.5 M37.5 12.5 L37.5 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* 'S' */}
      <path d="M47.5 9.5 C46 8.5, 43.5 8.7, 43.5 10.3 C43.5 12.3, 47.5 12, 47.5 14 C47.5 15.7, 45 16.7, 43.5 15.7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
};

const VolantisLogo = () => {
  return (
    <div style={{
      position: "relative",
      width: "48px",
      height: "48px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }}>
      <img
        alt="Volantis Logo"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzCPDVoQzCghHXcR7aPTPE9wsXukucixGZNIII769_GI8UBXDCosK_W2cKereznCUfB-_t0M9T97SQf3SF_aKuH6XmREmDpB_Zifcq2tEp3KTbLPMj26_1MLVDl_CbWhCIvQGoFOp6raJSkSFfsnlGh2eVQK7jvFYi1VFm5tkLNuOfiFREahPR5GaD9ZIUGpUIJb88I0uqbH20Q_dFSQFtyDlCPEt7grDS4OuN5zdY3eTms2dKvJquKjaRNRzVEdBHFBs"
      />
    </div>
  );
};

const renderCompanyBadge = (companyName: string) => {
  const isIOSYS = companyName.toUpperCase() === "IOSYS";
  const label = isIOSYS ? "IOSYS" : "Volantis";
  
  const textColor = isIOSYS ? "#1a4d44" : "#2563eb";
  const bgColor = isIOSYS ? "#E6F4F1" : "#e0e7ff";
  const borderColor = isIOSYS ? "#b9ede0" : "#bfdbfe";
  const borderRadius = "8px";
  const padding = "0.375rem 1rem";
  const fontSize = "0.95rem";
  const fontFamily = "'Inter', sans-serif";
  const letterSpacing = "normal";
  
  return (
    <span style={{
      display: "inline-block",
      width: "fit-content",
      fontSize: fontSize,
      fontFamily: fontFamily,
      fontWeight: 700,
      padding: padding,
      borderRadius: borderRadius,
      backgroundColor: bgColor,
      color: textColor,
      border: `1px solid ${borderColor}`,
      textTransform: "none",
      letterSpacing: letterSpacing,
      lineHeight: 1.2,
    }}>
      {label}
    </span>
  );
};

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isRecruiter, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  // Get company branding based on active company
  const companyBranding = getCompanyBranding(user?.activeCompanyName);

  useEffect(() => {
    if (!loading && (!user || !isRecruiter)) {
      router.push("/auth/recruiter/login");
    }
  }, [user, loading, isRecruiter, router]);

  if (loading || !user || !isRecruiter) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "hsl(var(--background-hsl))",
        color: "hsl(var(--muted-hsl))",
        fontSize: "1rem"
      }}>
        Verifying session...
      </div>
    );
  }

  const isLinkActive = (path: string) => pathname === path;

  // Derive avatar initial from user name or email
  const avatarInitial = (user.name?.trim() || user.email || "?")
    .charAt(0)
    .toUpperCase();

  const navLinkClass = (path: string) =>
    `sidebar-nav-link${isLinkActive(path) ? " active" : ""}`;

  const companyUpper = user?.activeCompanyName?.toUpperCase();
  const isIOSYS = companyUpper === "IOSYS";
  const isVolantis = companyUpper === "VOLANTIS";

  let themeStyles = "";
  if (isIOSYS) {
    themeStyles = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@500;600;700;800&display=swap');
      
      .font-logo-brand-iosys {
        font-family: 'Manrope', sans-serif !important;
      }

      :root {
        --primary-hsl: 171, 43%, 21% !important;
        --primary-hover-hsl: 171, 43%, 15% !important;
        --secondary-hsl: 162, 29%, 86% !important; /* secondary-container #d1e7df */
        --secondary-foreground-hsl: 171, 43%, 21% !important; /* on-secondary-container #1a4d44 */
        --accent-hsl: 161, 71%, 52% !important;
        --muted-bg-hsl: 171, 43%, 95% !important;
        --card-border-hsl: 171, 15%, 88% !important;
        --background-hsl: 210, 40%, 98% !important;
        
        --secondary-bg-hsl: 0, 0%, 100% !important;
        --secondary-text-hsl: 171, 43%, 21% !important;
        --secondary-border-hsl: 171, 43%, 21% !important;
        --secondary-hover-bg-hsl: 171, 43%, 95% !important;
      }

      .sidebar-nav-link {
        font-family: 'Inter', sans-serif !important;
      }

      .sidebar-nav-link.active {
        font-weight: 700 !important;
      }
    `;
  } else if (isVolantis) {
    themeStyles = `
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@500;600;700;800&display=swap');
      
      .font-logo-brand {
        font-family: 'Nunito', sans-serif !important;
        letter-spacing: 0.05em !important;
      }

      .font-logo-text {
        font-family: 'Inter', sans-serif !important;
      }

      :root {
        --primary-hsl: 220, 82%, 52% !important;
        --primary-hover-hsl: 217, 91%, 59% !important;
        --secondary-hsl: 220, 82%, 95% !important;
        --secondary-foreground-hsl: 220, 82%, 52% !important;
        --accent-hsl: 217, 91%, 59% !important;
        --muted-bg-hsl: 220, 82%, 95% !important;
        --card-border-hsl: 220, 15%, 88% !important;
        --background-hsl: 210, 40%, 98% !important;
        
        --secondary-bg-hsl: 0, 0%, 100% !important;
        --secondary-text-hsl: 220, 82%, 52% !important;
        --secondary-border-hsl: 220, 82%, 52% !important;
        --secondary-hover-bg-hsl: 220, 82%, 95% !important;
      }

      .sidebar-nav-link {
        font-family: 'Inter', sans-serif !important;
      }

      .sidebar-nav-link.active {
        font-weight: 700 !important;
      }
    `;
  }

  const renderBranding = () => {
    if (isIOSYS) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-start", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
            <div style={{
              position: "relative",
              width: "72px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <img
                alt="IOSYS Logo"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9XFHzYFby7fSTSjWz2GxibEOt4H66uMbk0ligHFVt60PEZpozd_nhxelD-Q_BPZXGjLbwWrpDMruv2_dQcTd0nX5EmUvZ0iL4IYwnPm0xkIBeyGuvTb8d2PqW56QqISqOwXofKvbDsAOPMhzcSSVh2KIcPuNNMSl62cXCIAnylWAUv_d_pHV928OrVrHMAaYWXMfQblPCIThBC1fH6gS1mSovnmBwMTw4kd3vS3Qwmtnqdlh7hbw0C4y0tsaNxudcjs"
              />
            </div>
            <span className="font-logo-brand-iosys" style={{
              color: "#111827",
              fontSize: "19px",
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1
            }}>
              Recruiter
            </span>
          </div>
          <div>
            {renderCompanyBadge(companyUpper || "IOSYS")}
          </div>
        </div>
      );
    }
    if (isVolantis) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-start", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", width: "100%" }}>
            <div style={{
              position: "relative",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <img
                alt="Volantis Logo"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzCPDVoQzCghHXcR7aPTPE9wsXukucixGZNIII769_GI8UBXDCosK_W2cKereznCUfB-_t0M9T97SQf3SF_aKuH6XmREmDpB_Zifcq2tEp3KTbLPMj26_1MLVDl_CbWhCIvQGoFOp6raJSkSFfsnlGh2eVQK7jvFYi1VFm5tkLNuOfiFREahPR5GaD9ZIUGpUIJb88I0uqbH20Q_dFSQFtyDlCPEt7grDS4OuN5zdY3eTms2dKvJquKjaRNRzVEdBHFBs"
              />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
              <span className="font-logo-brand" style={{
                color: "#2563eb",
                fontSize: "19px",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                lineHeight: 1
              }}>
                VOLANTIS
              </span>
              <span className="font-logo-text" style={{
                color: "#111827",
                fontSize: "19px",
                fontWeight: 700,
                letterSpacing: "-0.025em",
                lineHeight: 1
              }}>
                Recruiter
              </span>
            </div>
          </div>
          <div>
            {renderCompanyBadge(user.activeCompanyName || "Volantis")}
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
          <span style={{
            fontSize: "1.4rem",
            fontWeight: 700,
            color: "hsl(var(--primary-hsl))",
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}>
            VMS
          </span>
          <span style={{
            fontSize: "1.4rem",
            fontWeight: 700,
            color: "hsl(var(--foreground-hsl))",
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}>
            Recruiter
          </span>
        </div>
        {user.activeCompanyName && (
          <div style={{ marginTop: "0.25rem" }}>
            {renderCompanyBadge(user.activeCompanyName)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {themeStyles && <style dangerouslySetInnerHTML={{ __html: themeStyles }} />}
      {/* Sidebar */}
      <aside style={{
        width: "256px",
        minWidth: "256px",
        backgroundColor: "hsl(var(--card-hsl))",
        borderRight: "1px solid hsl(var(--card-border-hsl))",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "hidden",
      }}>

        {/* Branding */}
        <div style={{ padding: "1.5rem 1.25rem 1rem" }}>
          <Link
            href="/recruiter/candidates"
            style={{
              display: "flex",
              alignItems: "flex-start",
              textDecoration: "none",
              flexDirection: "column",
            }}
            aria-label="VMS Recruiter — go to Candidates"
          >
            {renderBranding()}
          </Link>
        </div>

        {/* Navigation */}
        <nav
          aria-label="Recruiter navigation"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <Link
            href="/recruiter/candidates"
            className={navLinkClass("/recruiter/candidates")}
            aria-current={isLinkActive("/recruiter/candidates") ? "page" : undefined}
          >
            {/* Candidates / Users icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Candidates List
          </Link>

          <Link
            href="/recruiter/roles"
            className={navLinkClass("/recruiter/roles")}
            aria-current={isLinkActive("/recruiter/roles") ? "page" : undefined}
          >
            {/* Briefcase icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Job Roles
          </Link>

          <Link
            href="/recruiter/vendor-users"
            className={navLinkClass("/recruiter/vendor-users")}
            aria-current={isLinkActive("/recruiter/vendor-users") ? "page" : undefined}
          >
            {/* Hexagon icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            Vendor Users
          </Link>

          {isAdmin && (
            <Link
              href="/recruiter/users"
              className={navLinkClass("/recruiter/users")}
              aria-current={isLinkActive("/recruiter/users") ? "page" : undefined}
            >
              {/* Users icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Recruiter Users
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/recruiter/approvals"
              className={navLinkClass("/recruiter/approvals")}
              aria-current={isLinkActive("/recruiter/approvals") ? "page" : undefined}
            >
              {/* Check-circle icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Signup Approvals
            </Link>
          )}

          <Link
            href="/recruiter/profile"
            className={navLinkClass("/recruiter/profile")}
            aria-current={isLinkActive("/recruiter/profile") ? "page" : undefined}
          >
            {/* Settings / gear icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Profile &amp; Admins
          </Link>
        </nav>

        {/* Bottom — User Account Section */}
        <div style={{
          padding: "0.875rem 1.25rem 1.25rem",
          borderTop: "1px solid hsl(var(--card-border-hsl))",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}>

          {/* User info row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem" }}>
            {/* Avatar circle */}
            <div className="sidebar-avatar" aria-hidden="true">
              {avatarInitial}
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{
                fontSize: "0.75rem",
                color: "hsl(var(--muted-hsl))",
                lineHeight: 1.2,
              }}>
                Logged in
              </span>
              <span style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "hsl(var(--foreground-hsl))",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
                title={user.email}
              >
                {user.email}
              </span>
              {user.activeCompanyName && (
                <div style={{ marginTop: "0.15rem", marginBottom: "0.15rem" }}>
                  {renderCompanyBadge(user.activeCompanyName)}
                </div>
              )}
              <span style={{
                display: "inline-block",
                width: "fit-content",
                fontSize: "0.68rem",
                fontWeight: 700,
                padding: "0.1rem 0.4rem",
                borderRadius: "4px",
                backgroundColor: isAdmin ? "rgba(220, 38, 38, 0.1)" : companyBranding.lightColor,
                color: isAdmin ? "hsl(var(--danger-hsl))" : companyBranding.primaryColor,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                lineHeight: 1.6,
                border: isAdmin ? undefined : `1px solid ${companyBranding.primaryColor}20`,
              }}>
                {user.access_level || "STANDARD"}
              </span>
            </div>
          </div>

          {/* Log Out button */}
          <button
            className="sidebar-logout-btn"
            onClick={logout}
            type="button"
            aria-label="Log out of VMS Recruiter"
          >
            {/* Log-out icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "hsl(var(--background-hsl))", minWidth: 0 }}>
        <main style={{ flex: 1, padding: "2.5rem" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
