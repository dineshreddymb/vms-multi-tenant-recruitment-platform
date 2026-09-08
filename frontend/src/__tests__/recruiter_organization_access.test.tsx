import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecruiterProfile from "@/app/recruiter/profile/page";
import { api } from "@/lib/api-client";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/recruiter/profile",
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock API Client
jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

let mockAuth = {
  user: {
    id: "admin-1",
    name: "Admin Self",
    email: "admin_self@corp.com",
    recruiter_reference: "RU001",
    access_level: "ADMIN",
    role: "RECRUITER",
  },
  loading: false,
  logout: jest.fn(),
  refreshProfile: jest.fn(),
  login: jest.fn(),
  isAdmin: true,
  isVendor: false,
  isRecruiter: true,
};

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

describe("Recruiter Organization Access UI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("fetches tenant-only companies with is_tenant=true and allows assigning access", async () => {
    const mockAdmins = [
      {
        id: "admin-1",
        recruiter_reference: "RU001",
        email: "admin_self@corp.com",
        full_name: "Admin Self",
        mobile: "9234567890",
        status: "ACTIVE",
        created_at: "2026-08-17T10:00:00Z",
      },
    ];

    const mockRecruiters = [
      {
        id: "rec-1",
        name: "Standard Recruiter",
        email: "rec1@corp.com",
        recruiter_reference: "RU002",
        access_level: "STANDARD",
      },
    ];

    const mockTenantCompanies = [
      { id: "comp-iosys-id", name: "IOSYS" },
      { id: "comp-volantis-id", name: "Volantis" },
    ];

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/admins") {
        return Promise.resolve(mockAdmins);
      }
      if (url === "/api/v1/recruiter/users") {
        return Promise.resolve(mockRecruiters);
      }
      if (url === "/api/v1/auth/companies?is_tenant=true") {
        return Promise.resolve(mockTenantCompanies);
      }
      if (url === "/api/v1/recruiter/users/rec-1/companies") {
        return Promise.resolve(["comp-iosys-id"]);
      }
      return Promise.resolve([]);
    });

    (api.post as jest.Mock).mockResolvedValue({ detail: "Recruiter company access updated successfully." });

    render(<RecruiterProfile />);

    // Verify /api/v1/auth/companies?is_tenant=true was called
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/auth/companies?is_tenant=true");
    });

    // Select recruiter
    const recruiterSelect = screen.getByLabelText(/Select Recruiter/i);
    fireEvent.change(recruiterSelect, { target: { value: "rec-1" } });

    // Wait for company access checkboxes to render
    await waitFor(() => {
      expect(screen.getByText("IOSYS")).toBeInTheDocument();
      expect(screen.getByText("Volantis")).toBeInTheDocument();
    });

    // Toggle Volantis checkbox
    const volantisCheckbox = screen.getByLabelText("Volantis");
    fireEvent.click(volantisCheckbox);

    // Save access changes
    const saveButton = screen.getByRole("button", { name: /Save Access Changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/v1/recruiter/users/rec-1/companies",
        ["comp-iosys-id", "comp-volantis-id"]
      );
    });

    expect(await screen.findByText(/Recruiter company access updated successfully/i)).toBeInTheDocument();
  });
});
