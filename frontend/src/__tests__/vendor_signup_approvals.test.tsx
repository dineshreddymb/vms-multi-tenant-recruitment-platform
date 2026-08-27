import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VendorLogin from "@/app/auth/vendor/login/page";
import VendorSignup from "@/app/auth/vendor/signup/page";
import ApprovalsQueue from "@/app/recruiter/approvals/page";
import { api } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: jest.fn(),
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

describe("Vendor User Signup & Approvals Workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
  });

  describe("Vendor Login Page", () => {
    it("renders Sign Up link navigating to /auth/vendor/signup", () => {
      (useAuth as jest.Mock).mockReturnValue({
        login: jest.fn(),
        user: null,
        loading: false,
      });

      render(<VendorLogin />);

      const signupLink = screen.getByRole("link", { name: "Sign Up" });
      expect(signupLink).toBeInTheDocument();
      expect(signupLink).toHaveAttribute("href", "/auth/vendor/signup");
    });
  });

  describe("Vendor Signup Page", () => {
    it("renders all required input fields", () => {
      render(<VendorSignup />);

      expect(screen.getByRole("heading", { name: "Vendor Signup" })).toBeInTheDocument();
      expect(screen.queryByText(/Select Vendor Companies/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText("IOSYS")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Volantis")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Vendor Company Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Mobile Number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Confirm Password$/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Submit Signup Request" })).toBeInTheDocument();
    });

    it("displays error when company name is IOSYS or Volantis", async () => {
      render(<VendorSignup />);

      fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "John Doe" } });
      fireEvent.change(screen.getByLabelText(/Vendor Company Name/i), { target: { value: "IOSYS" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "john@acme.com" } });
      fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543210" } });
      fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "Password123!" } });
      fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), { target: { value: "Password123!" } });

      fireEvent.click(screen.getByRole("button", { name: "Submit Signup Request" }));

      await waitFor(() => {
        expect(screen.getByText("Vendor Company Name cannot be IOSYS or Volantis.")).toBeInTheDocument();
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    it("displays error when passwords do not match", async () => {
      render(<VendorSignup />);

      fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "John Doe" } });
      fireEvent.change(screen.getByLabelText(/Vendor Company Name/i), { target: { value: "ABC Tech" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "john@acme.com" } });
      fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543210" } });
      fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "Password123!" } });
      fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), { target: { value: "Mismatch123!" } });

      fireEvent.click(screen.getByRole("button", { name: "Submit Signup Request" }));

      await waitFor(() => {
        expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    it("submits vendor signup and navigates to pending approval page", async () => {
      (api.post as jest.Mock).mockResolvedValueOnce({
        request_id: "req-123",
        companies: [],
        company_name: "ABC Tech",
        email: "john@acme.com",
        status: "PENDING",
        created_at: new Date().toISOString(),
      });

      render(<VendorSignup />);

      fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "John Doe" } });
      fireEvent.change(screen.getByLabelText(/Vendor Company Name/i), { target: { value: "ABC Tech" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "john@acme.com" } });
      fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543210" } });
      fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "Password123!" } });
      fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), { target: { value: "Password123!" } });

      fireEvent.click(screen.getByRole("button", { name: "Submit Signup Request" }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/auth/vendor/signup",
          {
            companies: [],
            company_name: "ABC Tech",
            user_name: "John Doe",
            email: "john@acme.com",
            mobile: "+919876543210",
            password: "Password123!",
            confirm_password: "Password123!",
          },
          { skipAuth: true }
        );
        expect(mockPush).toHaveBeenCalledWith("/auth/pending?type=vendor");
      });
    });

    it("displays structured backend error message when signup fails", async () => {
      (api.post as jest.Mock).mockRejectedValueOnce({
        status: 400,
        detail: "A pending signup request already exists for this email address.",
      });

      render(<VendorSignup />);

      fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "John Doe" } });
      fireEvent.change(screen.getByLabelText(/Vendor Company Name/i), { target: { value: "ABC Tech" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "john@acme.com" } });
      fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543210" } });
      fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "Password123!" } });
      fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), { target: { value: "Password123!" } });

      fireEvent.click(screen.getByRole("button", { name: "Submit Signup Request" }));

      await waitFor(() => {
        expect(screen.getByText("A pending signup request already exists for this email address.")).toBeInTheDocument();
      });
    });

    it("allows different users to submit signup requests", async () => {
      (api.post as jest.Mock).mockResolvedValueOnce({
        request_id: "req-user2",
        companies: [],
        company_name: "Priya Company",
        email: "priya@yahoo.com",
        status: "PENDING",
      });

      render(<VendorSignup />);

      fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "Priya Sharma" } });
      fireEvent.change(screen.getByLabelText(/Vendor Company Name/i), { target: { value: "Priya Company" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "priya@yahoo.com" } });
      fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543212" } });
      fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "Password123!" } });
      fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), { target: { value: "Password123!" } });

      fireEvent.click(screen.getByRole("button", { name: "Submit Signup Request" }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/auth/vendor/signup",
          {
            companies: [],
            company_name: "Priya Company",
            user_name: "Priya Sharma",
            email: "priya@yahoo.com",
            mobile: "+919876543212",
            password: "Password123!",
            confirm_password: "Password123!",
          },
          { skipAuth: true }
        );
        expect(mockPush).toHaveBeenCalledWith("/auth/pending?type=vendor");
      });
    });
  });

  describe("Admin Approvals Page", () => {
    it("redirects standard recruiter away from approvals page", () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAdmin: false,
        loading: false,
      });

      render(<ApprovalsQueue />);
      expect(mockPush).toHaveBeenCalledWith("/recruiter/candidates");
    });

    it("renders unified recruiter and vendor requests tabs for admin recruiter", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAdmin: true,
        loading: false,
      });

      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url === "/api/v1/recruiter/recruiter-signup-requests") {
          return Promise.resolve([
            {
              id: "rec-1",
              full_name: "Alice Recruiter",
              email: "alice@vms.com",
              mobile: "+919876543201",
              status: "PENDING",
              requested_at: new Date().toISOString(),
            },
          ]);
        }
        if (url === "/api/v1/recruiter/vendor-signup-requests") {
          return Promise.resolve([
            {
              id: "ven-1",
              company_name: "Nova Staffing",
              user_name: "Bob Vendor",
              email: "bob@nova.com",
              mobile: "+919876543202",
              status: "PENDING",
              created_at: new Date().toISOString(),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      render(<ApprovalsQueue />);

      await waitFor(() => {
        expect(screen.getByText("Alice Recruiter")).toBeInTheDocument();
      });

      // Switch to Vendor User Requests tab
      const vendorTab = screen.getByRole("button", { name: /Vendor User Requests/i });
      fireEvent.click(vendorTab);

      await waitFor(() => {
        expect(screen.getByText("Bob Vendor")).toBeInTheDocument();
        expect(screen.getByText("Nova Staffing")).toBeInTheDocument();
        expect(screen.getByText("bob@nova.com")).toBeInTheDocument();
      });
    });

    it("allows admin to approve a vendor signup request", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAdmin: true,
        loading: false,
      });

      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url === "/api/v1/recruiter/recruiter-signup-requests") {
          return Promise.resolve([]);
        }
        if (url === "/api/v1/recruiter/vendor-signup-requests") {
          return Promise.resolve([
            {
              id: "ven-1",
              company_name: "Nova Staffing",
              user_name: "Bob Vendor",
              email: "bob@nova.com",
              mobile: "+919876543202",
              status: "PENDING",
              created_at: new Date().toISOString(),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      (api.post as jest.Mock).mockResolvedValueOnce({
        detail: "Vendor signup request approved successfully.",
        created_user_id: "user-123",
      });

      render(<ApprovalsQueue />);

      // Switch to Vendor tab
      const vendorTab = screen.getByRole("button", { name: /Vendor User Requests/i });
      fireEvent.click(vendorTab);

      await waitFor(() => {
        expect(screen.getByText("Bob Vendor")).toBeInTheDocument();
      });

      const approveBtn = screen.getByRole("button", { name: "Approve" });
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/recruiter/vendor-signup-requests/ven-1/approve",
          {}
        );
        expect(window.alert).toHaveBeenCalledWith("Vendor user request approved successfully.");
      });
    });

    it("allows admin to reject a vendor signup request", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAdmin: true,
        loading: false,
      });

      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url === "/api/v1/recruiter/recruiter-signup-requests") {
          return Promise.resolve([]);
        }
        if (url === "/api/v1/recruiter/vendor-signup-requests") {
          return Promise.resolve([
            {
              id: "ven-1",
              company_name: "Nova Staffing",
              user_name: "Bob Vendor",
              email: "bob@nova.com",
              mobile: "+919876543202",
              status: "PENDING",
              created_at: new Date().toISOString(),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      (api.post as jest.Mock).mockResolvedValueOnce({
        detail: "Vendor signup request rejected successfully.",
      });

      render(<ApprovalsQueue />);

      // Switch to Vendor tab
      const vendorTab = screen.getByRole("button", { name: /Vendor User Requests/i });
      fireEvent.click(vendorTab);

      await waitFor(() => {
        expect(screen.getByText("Bob Vendor")).toBeInTheDocument();
      });

      const rejectBtn = screen.getByRole("button", { name: "Reject" });
      fireEvent.click(rejectBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/recruiter/vendor-signup-requests/ven-1/reject",
          {}
        );
        expect(window.alert).toHaveBeenCalledWith("Vendor user request rejected.");
      });
    });
  });
});
