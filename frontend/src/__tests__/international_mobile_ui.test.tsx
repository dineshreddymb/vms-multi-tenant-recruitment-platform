import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import RecruiterSignup from "@/app/auth/recruiter/signup/page";
import VendorSignup from "@/app/auth/vendor/signup/page";
import VendorProfile from "@/app/vendor/profile/page";
import RecruiterVendorUsers from "@/app/recruiter/vendor-users/page";
import { api } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe("International Mobile Number UI Fields", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Recruiter Signup displays international label and placeholder", async () => {
    (api.get as jest.Mock).mockResolvedValueOnce([
      { id: "c1", name: "IOSYS" },
      { id: "c2", name: "Volantis" },
    ]);

    await act(async () => {
      render(<RecruiterSignup />);
    });

    const mobileInput = screen.getByLabelText("Mobile Number (with country code)");
    expect(mobileInput).toBeInTheDocument();
    expect(mobileInput).toHaveAttribute("placeholder", "+91 9988776655");
  });

  test("Vendor Signup displays international label and placeholder", async () => {
    (api.get as jest.Mock).mockResolvedValueOnce([
      { id: "c1", name: "IOSYS" },
      { id: "c2", name: "Volantis" },
    ]);

    await act(async () => {
      render(<VendorSignup />);
    });

    const mobileInput = screen.getByLabelText("Mobile Number (with country code)");
    expect(mobileInput).toBeInTheDocument();
    expect(mobileInput).toHaveAttribute("placeholder", "+91 9988776655");
  });

  test("Vendor Profile displays international label and placeholder", async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        id: "vu-1",
        name: "Test Vendor",
        mobile: "+1 2025550123",
        role: "VENDOR_USER",
      },
      refreshProfile: jest.fn(),
    });

    (api.get as jest.Mock).mockResolvedValueOnce({
      id: "vu-1",
      name: "Test Vendor",
      mobile: "+1 2025550123",
      email: "vendor@example.com",
      status: "ACTIVE",
      companies: [],
    });

    await act(async () => {
      render(<VendorProfile />);
    });

    const mobileInput = screen.getByLabelText("Mobile Number (with country code)");
    expect(mobileInput).toBeInTheDocument();
    expect(mobileInput).toHaveAttribute("placeholder", "+91 9988776655");
    expect(mobileInput).toHaveValue("+1 2025550123");
  });

  test("Recruiter Vendor User Provisioning modal displays international label and placeholder", async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: "rec-1", name: "Recruiter Admin", role: "RECRUITER" },
      isAdmin: true,
      isRecruiter: true,
    });

    (api.get as jest.Mock).mockResolvedValueOnce([]);

    await act(async () => {
      render(<RecruiterVendorUsers />);
    });

    const provisionBtn = screen.getByRole("button", { name: /Provision Vendor User/i });
    fireEvent.click(provisionBtn);

    const mobileInput = screen.getByLabelText("Mobile Number (with country code)");
    expect(mobileInput).toBeInTheDocument();
    expect(mobileInput).toHaveAttribute("placeholder", "+91 9988776655");
  });
});
