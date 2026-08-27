import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AccountDeactivated from "@/app/auth/account-deactivated/page";
import VendorLogin from "@/app/auth/vendor/login/page";
import RecruiterLogin from "@/app/auth/recruiter/login/page";
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

describe("Account Deactivated Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    (api.get as jest.Mock).mockResolvedValue([]);
  });

  it("renders dedicated Account Deactivated page with title and Back to Login button", () => {
    render(<AccountDeactivated />);

    expect(screen.getByRole("heading", { name: "Account Deactivated" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your account has been deactivated. Please contact your administrator or recruiter for assistance."
      )
    ).toBeInTheDocument();
    
    const backBtn = screen.getByRole("button", { name: "Back to Login" });
    expect(backBtn).toBeInTheDocument();
    expect(backBtn.closest("a")).toHaveAttribute("href", "/");
  });

  it("redirects deactivated vendor to /auth/account-deactivated upon login", async () => {
    (api.post as jest.Mock).mockRejectedValueOnce(
      new APIError(
        403,
        "Your vendor account has been deactivated. Please contact your administrator or recruiter for assistance."
      )
    );

    render(
      <AuthProvider>
        <VendorLogin />
      </AuthProvider>
    );

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitBtn = screen.getByRole("button", { name: "Sign In" });

    fireEvent.change(emailInput, { target: { value: "disabled@vendor.com" } });
    fireEvent.change(passwordInput, { target: { value: "Password123!" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/auth/account-deactivated");
    });
  });

  it("redirects deactivated recruiter to /auth/account-deactivated upon login", async () => {
    (api.post as jest.Mock).mockRejectedValueOnce(
      new APIError(
        403,
        "Your recruiter account has been deactivated. Please contact your administrator for assistance."
      )
    );

    render(
      <AuthProvider>
        <RecruiterLogin />
      </AuthProvider>
    );

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitBtn = screen.getByRole("button", { name: "Sign In" });

    fireEvent.change(emailInput, { target: { value: "disabled@recruiter.com" } });
    fireEvent.change(passwordInput, { target: { value: "Password123!" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/auth/account-deactivated");
    });
  });

  it("shows invalid credentials error on page for standard 401 login failure without redirecting", async () => {
    (api.post as jest.Mock).mockRejectedValueOnce(
      new APIError(401, "Invalid email or password. Please check your credentials and try again.")
    );

    render(
      <AuthProvider>
        <VendorLogin />
      </AuthProvider>
    );

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitBtn = screen.getByRole("button", { name: "Sign In" });

    fireEvent.change(emailInput, { target: { value: "wrong@vendor.com" } });
    fireEvent.change(passwordInput, { target: { value: "WrongPass" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Invalid email or password. Please check your credentials and try again.")
      ).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalledWith("/auth/account-deactivated");
    });
  });
});
