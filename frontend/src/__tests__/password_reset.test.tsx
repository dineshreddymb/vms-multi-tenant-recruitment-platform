import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ForgotPassword from "@/app/auth/forgot-password/page";
import ResetPassword from "@/app/auth/reset-password/page";
import { api, APIError } from "@/lib/api-client";

// Mock next/navigation
const mockSearchParams = new Map<string, string>();
jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) || null,
  }),
  useRouter: () => ({
    push: jest.fn(),
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

describe("Forgot Password & Reset Password Frontend Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.clear();
  });

  describe("Forgot Password Page", () => {
    it("renders Forgot Password form", () => {
      render(<ForgotPassword />);

      expect(screen.getByRole("heading", { name: "Reset Password" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeInTheDocument();
    });

    it("submits email and displays success confirmation message", async () => {
      (api.post as jest.Mock).mockResolvedValueOnce({
        detail: "If the email address is registered, a password reset link has been sent."
      });

      render(<ForgotPassword />);

      const emailInput = screen.getByLabelText(/Email Address/i);
      const submitBtn = screen.getByRole("button", { name: "Send Reset Link" });

      fireEvent.change(emailInput, { target: { value: "recruiter@vms.com" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/auth/forgot-password",
          { email: "recruiter@vms.com" },
          { skipAuth: true }
        );
      });

      expect(
        screen.getByText("If the email address is registered, a password reset link has been sent.")
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to Recruiter Login" })).toHaveAttribute("href", "/auth/recruiter/login");
      expect(screen.getByRole("link", { name: "Go to Vendor Login" })).toHaveAttribute("href", "/auth/vendor/login");
    });
  });

  describe("Reset Password Page", () => {
    it("displays error message when token is missing from URL parameters", () => {
      mockSearchParams.delete("token");

      render(<ResetPassword />);

      expect(screen.getByText("Invalid or missing reset token.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Back to Selection/i })).toBeInTheDocument();
    });

    it("renders form when token is present", () => {
      mockSearchParams.set("token", "valid_test_token_123");

      render(<ResetPassword />);

      expect(screen.getByLabelText(/^New Password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Confirm New Password$/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reset Password" })).toBeInTheDocument();
    });

    it("validates that passwords match before submitting", async () => {
      mockSearchParams.set("token", "valid_test_token_123");

      render(<ResetPassword />);

      const passwordInput = screen.getByLabelText(/^New Password$/i);
      const confirmInput = screen.getByLabelText(/^Confirm New Password$/i);
      const submitBtn = screen.getByRole("button", { name: "Reset Password" });

      fireEvent.change(passwordInput, { target: { value: "NewPassword123!" } });
      fireEvent.change(confirmInput, { target: { value: "DifferentPassword123!" } });
      fireEvent.click(submitBtn);

      expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("validates password length (minimum 8 characters)", async () => {
      mockSearchParams.set("token", "valid_test_token_123");

      render(<ResetPassword />);

      const passwordInput = screen.getByLabelText(/^New Password$/i);
      const confirmInput = screen.getByLabelText(/^Confirm New Password$/i);
      const submitBtn = screen.getByRole("button", { name: "Reset Password" });

      fireEvent.change(passwordInput, { target: { value: "short" } });
      fireEvent.change(confirmInput, { target: { value: "short" } });
      fireEvent.click(submitBtn);

      expect(screen.getByText("Password must be between 8 and 50 characters.")).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("submits valid reset password and shows success state with login links", async () => {
      mockSearchParams.set("token", "valid_test_token_123");
      (api.post as jest.Mock).mockResolvedValueOnce({
        detail: "Password has been reset successfully."
      });

      render(<ResetPassword />);

      const passwordInput = screen.getByLabelText(/^New Password$/i);
      const confirmInput = screen.getByLabelText(/^Confirm New Password$/i);
      const submitBtn = screen.getByRole("button", { name: "Reset Password" });

      fireEvent.change(passwordInput, { target: { value: "BrandNewPassword123!" } });
      fireEvent.change(confirmInput, { target: { value: "BrandNewPassword123!" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/auth/reset-password",
          {
            token: "valid_test_token_123",
            password: "BrandNewPassword123!",
            confirm_password: "BrandNewPassword123!"
          },
          { skipAuth: true }
        );
      });

      expect(screen.getByText("Password has been reset successfully.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to Recruiter Login" })).toHaveAttribute("href", "/auth/recruiter/login");
      expect(screen.getByRole("link", { name: "Go to Vendor Login" })).toHaveAttribute("href", "/auth/vendor/login");
    });

    it("displays error message when backend returns invalid/expired token error", async () => {
      mockSearchParams.set("token", "expired_token_123");
      (api.post as jest.Mock).mockRejectedValueOnce(
        new APIError(400, "Invalid or expired reset token.")
      );

      render(<ResetPassword />);

      const passwordInput = screen.getByLabelText(/^New Password$/i);
      const confirmInput = screen.getByLabelText(/^Confirm New Password$/i);
      const submitBtn = screen.getByRole("button", { name: "Reset Password" });

      fireEvent.change(passwordInput, { target: { value: "BrandNewPassword123!" } });
      fireEvent.change(confirmInput, { target: { value: "BrandNewPassword123!" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Invalid or expired reset token.")).toBeInTheDocument();
      });
    });
  });
});
