import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import RecruiterSignup from "@/app/auth/recruiter/signup/page";
import VendorSignup from "@/app/auth/vendor/signup/page";
import { api } from "@/lib/api-client";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
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
    },
  };
});

describe("Recruiter Signup Terminology & Options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.get as jest.Mock).mockResolvedValue([
      { id: "iosys-id", name: "IOSYS" },
      { id: "volantis-id", name: "Volantis" },
    ]);
  });

  test("Recruiter Signup screen displays 'Select Organizations You Work For *' with IOSYS and Volantis", async () => {
    render(<RecruiterSignup />);

    // Label check
    expect(await screen.findByText(/Select Organizations You Work For/i)).toBeInTheDocument();
    expect(screen.queryByText(/Select Vendor Companies/i)).not.toBeInTheDocument();

    // Options check
    expect(await screen.findByLabelText("IOSYS")).toBeInTheDocument();
    expect(await screen.findByLabelText("Volantis")).toBeInTheDocument();
  });

  test("Recruiter Signup displays updated validation error when no organization is selected", async () => {
    render(<RecruiterSignup />);

    await screen.findByText(/Select Organizations You Work For/i);

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "Test Recruiter" } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "test@company.com" } });
    fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543210" } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "Password123!" } });
    fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), { target: { value: "Password123!" } });

    fireEvent.click(screen.getByRole("button", { name: /Request Access/i }));

    expect(
      await screen.findByText("Select Organizations You Work For: Please select at least one organization.")
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("Recruiter Signup submits successfully with selected organizations", async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({
      request_id: "req-1",
      status: "PENDING",
    });

    render(<RecruiterSignup />);

    const iosysCheckbox = await screen.findByLabelText("IOSYS");
    fireEvent.click(iosysCheckbox);

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "Test Recruiter" } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "test@company.com" } });
    fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543210" } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "Password123!" } });
    fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), { target: { value: "Password123!" } });

    fireEvent.click(screen.getByRole("button", { name: /Request Access/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/v1/auth/recruiter/signup",
        {
          full_name: "Test Recruiter",
          email: "test@company.com",
          mobile: "+919876543210",
          password: "Password123!",
          confirm_password: "Password123!",
          companies: ["iosys-id"],
        },
        { skipAuth: true }
      );
      expect(mockPush).toHaveBeenCalledWith("/auth/pending?type=recruiter");
    });
  });

  test("Vendor Signup terminology remains unaffected", async () => {
    render(<VendorSignup />);

    expect(await screen.findByText(/Select Organizations \/ Clients You Work With/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Vendor Company Name/i)).toBeInTheDocument();
  });
});
