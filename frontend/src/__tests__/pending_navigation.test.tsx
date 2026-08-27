import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PendingApproval from "@/app/auth/pending/page";
import RecruiterSignup from "@/app/auth/recruiter/signup/page";
import VendorSignup from "@/app/auth/vendor/signup/page";
import { api } from "@/lib/api-client";

// Mock next/navigation
const mockSearchParams = new Map<string, string>();
const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) || null,
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

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

describe("Pending Approval Navigation & Context Preservation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.clear();
    (api.get as jest.Mock).mockResolvedValue([{ id: "iosys-id", name: "IOSYS" }]);
  });

  describe("Pending Page Link Destinations", () => {
    it("points 'Go to Login' to /auth/recruiter/login when type=recruiter", () => {
      mockSearchParams.set("type", "recruiter");

      render(<PendingApproval />);

      const loginLink = screen.getByRole("link", { name: "Go to Login" });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink).toHaveAttribute("href", "/auth/recruiter/login");
    });

    it("points 'Go to Login' to /auth/vendor/login when type=vendor", () => {
      mockSearchParams.set("type", "vendor");

      render(<PendingApproval />);

      const loginLink = screen.getByRole("link", { name: "Go to Login" });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink).toHaveAttribute("href", "/auth/vendor/login");
    });

    it("defaults 'Go to Login' to /auth/recruiter/login when no type query param is present", () => {
      mockSearchParams.delete("type");

      render(<PendingApproval />);

      const loginLink = screen.getByRole("link", { name: "Go to Login" });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink).toHaveAttribute("href", "/auth/recruiter/login");
    });

    it("always preserves 'Return to Homepage' link pointing to /", () => {
      render(<PendingApproval />);

      const homeLink = screen.getByRole("link", { name: /Return to Homepage/i });
      expect(homeLink).toBeInTheDocument();
      expect(homeLink).toHaveAttribute("href", "/");
    });
  });

  describe("Signup Redirections with Query Parameter Context", () => {
    it("Recruiter signup redirects to /auth/pending?type=recruiter on success", async () => {
      (api.post as jest.Mock).mockResolvedValueOnce({
        request_id: "rec-req-1",
        email: "new_rec@vms.com",
        status: "PENDING",
      });

      render(<RecruiterSignup />);

      // Wait for company list to load and select IOSYS
      await screen.findByLabelText("IOSYS");
      fireEvent.click(screen.getByLabelText("IOSYS"));

      fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "Recruiter Alice" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "new_rec@vms.com" } });
      fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543210" } });
      fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "RecruiterPass123!" } });
      fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), { target: { value: "RecruiterPass123!" } });

      fireEvent.click(screen.getByRole("button", { name: "Request Access" }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/auth/recruiter/signup",
          {
            full_name: "Recruiter Alice",
            email: "new_rec@vms.com",
            mobile: "+919876543210",
            password: "RecruiterPass123!",
            confirm_password: "RecruiterPass123!",
            companies: ["iosys-id"],
          },
          { skipAuth: true }
        );
        expect(mockPush).toHaveBeenCalledWith("/auth/pending?type=recruiter");
      });
    });

    it("Vendor signup redirects to /auth/pending?type=vendor on success", async () => {
      (api.post as jest.Mock).mockResolvedValueOnce({
        request_id: "ven-req-1",
        companies: ["IOSYS"],
        company_name: "IOSYS",
        email: "new_vendor@vms.com",
        status: "PENDING",
      });

      render(<VendorSignup />);

      fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "Vendor Bob" } });
      fireEvent.change(screen.getByLabelText(/Vendor Company Name/i), { target: { value: "Bob Company" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "new_vendor@vms.com" } });
      fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543211" } });
      fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "VendorPass123!" } });
      fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), { target: { value: "VendorPass123!" } });

      fireEvent.click(screen.getByRole("button", { name: "Submit Signup Request" }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/auth/vendor/signup",
          {
            companies: [],
            company_name: "Bob Company",
            user_name: "Vendor Bob",
            email: "new_vendor@vms.com",
            mobile: "+919876543211",
            password: "VendorPass123!",
            confirm_password: "VendorPass123!",
          },
          { skipAuth: true }
        );
        expect(mockPush).toHaveBeenCalledWith("/auth/pending?type=vendor");
      });
    });
  });
});
