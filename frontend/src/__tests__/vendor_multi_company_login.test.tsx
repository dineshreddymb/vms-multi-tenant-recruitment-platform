import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import VendorLogin from "@/app/auth/vendor/login/page";
import { AuthProvider } from "@/context/AuthContext";
import { api, APIError } from "@/lib/api-client";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock API Client
jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return {
    ...actual,
    api: {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    },
  };
});

describe("Vendor Login Multi-Company Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it("handles initial Vendor Login and displays Company selector on 409 response", async () => {
    // 1. Mock first login post returning 409
    const errorData = {
      detail: "Company selection required.",
      requires_company_selection: true,
      companies: [
        { id: "iosys-uuid", name: "IOSYS" },
        { id: "volantis-uuid", name: "Volantis" }
      ]
    };
    const apiError = new APIError(409, "Company selection required.", undefined, errorData);
    (api.post as jest.Mock).mockRejectedValueOnce(apiError);

    // 2. Mock second login post returning success
    const fakeToken = "header.payload.signature";
    // Mock token decoding in AuthContext
    const mockPayload = { sub: "vendor-user-id", role: "VENDOR_USER", session_id: "fake-session", company_id: "iosys-uuid", company_name: "IOSYS" };
    // We override window.atob or let it decode if mockJWT helper is used.
    // Actually AuthContext parses JWT via base64 decoding.
    // Let's create a valid base64 payload for our token
    const encodedPayload = btoa(JSON.stringify(mockPayload));
    const token = `header.${encodedPayload}.signature`;

    (api.post as jest.Mock).mockResolvedValueOnce({
      access_token: token,
      token_type: "bearer",
      role: "VENDOR_USER"
    });

    (api.get as jest.Mock).mockResolvedValueOnce({
      id: "vendor-user-id",
      email: "vendor@test.com",
      name: "Vendor User",
      role: "VENDOR_USER",
      companies: [{ vendor_id: "iosys-uuid", company_name: "IOSYS", status: "ACTIVE" }],
    });

    render(
      <AuthProvider>
        <VendorLogin />
      </AuthProvider>
    );

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitBtn = screen.getByRole("button", { name: "Sign In" });

    // Step 1: Submit email + password
    fireEvent.change(emailInput, { target: { value: "vendor@test.com" } });
    fireEvent.change(passwordInput, { target: { value: "Password123!" } });
    fireEvent.click(submitBtn);

    // Step 2: Dropdown should appear
    await waitFor(() => {
      expect(screen.getByLabelText(/Company/i)).toBeInTheDocument();
    });

    const companySelect = screen.getByLabelText(/Company/i);
    expect(screen.getByText("IOSYS")).toBeInTheDocument();
    expect(screen.getByText("Volantis")).toBeInTheDocument();

    // Step 3: Select company and submit again
    fireEvent.change(companySelect, { target: { value: "iosys-uuid" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
      expect(api.post).toHaveBeenNthCalledWith(
        1,
        "/api/v1/auth/vendor/login",
        { email: "vendor@test.com", password: "Password123!", company_id: undefined },
        { skipAuth: true }
      );
      expect(api.post).toHaveBeenNthCalledWith(
        2,
        "/api/v1/auth/vendor/login",
        { email: "vendor@test.com", password: "Password123!", company_id: "iosys-uuid" },
        { skipAuth: true }
      );
      expect(mockPush).toHaveBeenCalledWith("/vendor/dashboard");
      expect(sessionStorage.getItem("vms_active_vendor_id")).toBe("iosys-uuid");
    });
  });
});
