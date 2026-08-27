import React from "react";
import { render, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { api } from "../lib/api-client";

// Mock next/navigation
const mockPush = jest.fn();
const mockPathname = { value: "/" };

jest.mock("next/navigation", () => ({
  useRouter() {
    return {
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
    };
  },
  usePathname() {
    return mockPathname.value;
  },
  useSearchParams() {
    return {
      get: () => null,
    };
  },
}));

// Mock API responses
jest.mock("../lib/api-client", () => {
  const actual = jest.requireActual("../lib/api-client");
  return {
    ...actual,
    api: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
});

// A test component to expose AuthContext state
const TestConsumer = ({ onExpose }: { onExpose: (auth: ReturnType<typeof useAuth>) => void }) => {
  const auth = useAuth();
  onExpose(auth);
  return <div>Test Consumer</div>;
};

// Helper to generate a fake JWT token
function makeFakeJWT(role: string, sub: string): string {
  // A standard JWT has three dot-separated base64url-encoded parts
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub, role, session_id: "fake-sess-123", exp: Date.now() / 1000 + 3600 }));
  const signature = "signature";
  return `${header}.${payload}.${signature}`;
}

describe("Portal-Specific sessionStorage Authentication Tokens", () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.resetAllMocks();
    mockPush.mockReset();
    mockPathname.value = "/";
  });

  test("Recruiter login stores recruiter token and email separately", async () => {
    const recruiterToken = makeFakeJWT("RECRUITER", "rec-user-id");
    (api.post as jest.Mock).mockResolvedValueOnce({
      access_token: recruiterToken,
      token_type: "bearer",
      role: "RECRUITER",
    });

    let exposedAuth: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <TestConsumer onExpose={(auth) => { exposedAuth = auth; }} />
      </AuthProvider>
    );

    // Call login
    await act(async () => {
      if (exposedAuth) {
        await exposedAuth.login("recruiter@test.com", "Password123!", "recruiter");
      }
    });

    expect(sessionStorage.getItem("vms_recruiter_access_token")).toBe(recruiterToken);
    expect(sessionStorage.getItem("vms_recruiter_user_email")).toBe("recruiter@test.com");
    expect(sessionStorage.getItem("vms_vendor_access_token")).toBeNull();
    expect(sessionStorage.getItem("vms_vendor_user_email")).toBeNull();
  });

  test("Vendor login stores vendor token and email separately", async () => {
    const vendorToken = makeFakeJWT("VENDOR_USER", "vendor-user-id");
    (api.post as jest.Mock).mockResolvedValueOnce({
      access_token: vendorToken,
      token_type: "bearer",
      role: "VENDOR_USER",
    });
    (api.get as jest.Mock).mockResolvedValueOnce({
      vendor_user_id: "vendor-user-id",
      email: "vendor@test.com",
      name: "Vendor User",
      role: "VENDOR_USER",
      memberships: [{ vendor_id: "v-1", company_name: "Vendor Corp", status: "ACTIVE" }],
    });

    let exposedAuth: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <TestConsumer onExpose={(auth) => { exposedAuth = auth; }} />
      </AuthProvider>
    );

    await act(async () => {
      if (exposedAuth) {
        await exposedAuth.login("vendor@test.com", "Password123!", "vendor");
      }
    });

    expect(sessionStorage.getItem("vms_vendor_access_token")).toBe(vendorToken);
    expect(sessionStorage.getItem("vms_vendor_user_email")).toBe("vendor@test.com");
    expect(sessionStorage.getItem("vms_recruiter_access_token")).toBeNull();
    expect(sessionStorage.getItem("vms_recruiter_user_email")).toBeNull();
  });

  test("Vendor login does not overwrite recruiter token and vice versa", async () => {
    const recruiterToken = makeFakeJWT("RECRUITER", "rec-user-id");
    const vendorToken = makeFakeJWT("VENDOR_USER", "vendor-user-id");

    sessionStorage.setItem("vms_recruiter_access_token", recruiterToken);
    sessionStorage.setItem("vms_recruiter_user_email", "recruiter@test.com");

    (api.post as jest.Mock).mockResolvedValueOnce({
      access_token: vendorToken,
      token_type: "bearer",
      role: "VENDOR_USER",
    });
    (api.get as jest.Mock).mockResolvedValueOnce({
      vendor_user_id: "vendor-user-id",
      email: "vendor@test.com",
      name: "Vendor User",
      role: "VENDOR_USER",
      memberships: [{ vendor_id: "v-1", company_name: "Vendor Corp", status: "ACTIVE" }],
    });

    let exposedAuth: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <TestConsumer onExpose={(auth) => { exposedAuth = auth; }} />
      </AuthProvider>
    );

    await act(async () => {
      if (exposedAuth) {
        await exposedAuth.login("vendor@test.com", "Password123!", "vendor");
      }
    });

    // Both should be present now!
    expect(sessionStorage.getItem("vms_recruiter_access_token")).toBe(recruiterToken);
    expect(sessionStorage.getItem("vms_recruiter_user_email")).toBe("recruiter@test.com");
    expect(sessionStorage.getItem("vms_vendor_access_token")).toBe(vendorToken);
    expect(sessionStorage.getItem("vms_vendor_user_email")).toBe("vendor@test.com");
  });

  test("Logout removes only the token/email of the active portal", async () => {
    const recruiterToken = makeFakeJWT("RECRUITER", "rec-user-id");
    const vendorToken = makeFakeJWT("VENDOR_USER", "vendor-user-id");

    sessionStorage.setItem("vms_recruiter_access_token", recruiterToken);
    sessionStorage.setItem("vms_recruiter_user_email", "recruiter@test.com");
    sessionStorage.setItem("vms_vendor_access_token", vendorToken);
    sessionStorage.setItem("vms_vendor_user_email", "vendor@test.com");
    sessionStorage.setItem("vms_active_vendor_id", "v-1");

    (api.post as jest.Mock).mockResolvedValueOnce({}); // logout endpoint mock

    // Set path using window.history.pushState
    window.history.pushState({}, "", "/recruiter/dashboard");

    // 1. Recruiter portal logout
    mockPathname.value = "/recruiter/dashboard";
    let exposedAuth: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <TestConsumer onExpose={(auth) => { exposedAuth = auth; }} />
      </AuthProvider>
    );

    await act(async () => {
      if (exposedAuth) {
        await exposedAuth.logout();
      }
    });

    expect(sessionStorage.getItem("vms_recruiter_access_token")).toBeNull();
    expect(sessionStorage.getItem("vms_recruiter_user_email")).toBeNull();
    
    // Vendor session must remain untouched!
    expect(sessionStorage.getItem("vms_vendor_access_token")).toBe(vendorToken);
    expect(sessionStorage.getItem("vms_vendor_user_email")).toBe("vendor@test.com");
    expect(sessionStorage.getItem("vms_active_vendor_id")).toBe("v-1");

    // Clean up path
    window.history.pushState({}, "", "/");
  });

  test("api-client route selection determines the token sent in requests", () => {
    const recruiterToken = makeFakeJWT("RECRUITER", "rec-user-id");
    const vendorToken = makeFakeJWT("VENDOR_USER", "vendor-user-id");

    sessionStorage.setItem("vms_recruiter_access_token", recruiterToken);
    sessionStorage.setItem("vms_vendor_access_token", vendorToken);

    // Set path using window.history.pushState
    window.history.pushState({}, "", "/recruiter/dashboard");

    // Test recruiter path token resolution
    const apiModule = jest.requireActual("../lib/api-client") as {
      api: { getAuthToken: () => string | null };
    };
    
    let token = apiModule.api.getAuthToken();
    expect(token).toBe(recruiterToken);

    // Test vendor path token resolution
    window.history.pushState({}, "", "/vendor/dashboard");
    token = apiModule.api.getAuthToken();
    expect(token).toBe(vendorToken);

    // Clean up path
    window.history.pushState({}, "", "/");
  });

  test("Expired recruiter token causes session restoration to fail and re-throws 401/403 instead of falling back to dummy", async () => {
    const expiredToken = makeFakeJWT("RECRUITER", "rec-user-id");
    sessionStorage.setItem("vms_recruiter_access_token", expiredToken);
    sessionStorage.setItem("vms_recruiter_user_email", "recruiter@test.com");

    mockPathname.value = "/recruiter/candidates";
    window.history.pushState({}, "", "/recruiter/candidates");

    // Mock resolveRecruiterDetails API call to fail with 401
    const apiError = new Error("Session expired or invalid login.") as Error & { status?: number };
    apiError.status = 401;
    (api.get as jest.Mock).mockRejectedValueOnce(apiError);

    let exposedAuth: ReturnType<typeof useAuth> | null = null;
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onExpose={(auth) => { exposedAuth = auth; }} />
        </AuthProvider>
      );
    });

    // User should be null (session restoration failed)
    expect(exposedAuth!.user).toBeNull();
    // The expired token should be removed from sessionStorage due to 401/403 propagation
    expect(sessionStorage.getItem("vms_recruiter_access_token")).toBeNull();
    expect(sessionStorage.getItem("vms_recruiter_user_email")).toBeNull();

    // Verify fallback dummy recruiter was not set (user is null, not { access_level: "STANDARD", name: "Recruiter", ... })
    expect(exposedAuth!.user).not.toEqual(expect.objectContaining({
      name: "Recruiter"
    }));

    // Clean up path
    window.history.pushState({}, "", "/");
  });
});
