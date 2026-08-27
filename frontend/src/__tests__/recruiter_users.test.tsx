import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecruiterUsersManagement from "@/app/recruiter/users/page";
import RecruiterLayout from "@/app/recruiter/layout";
import { api } from "@/lib/api-client";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/recruiter/users",
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

interface MockUser {
  id: string;
  name: string;
  email: string;
  access_level?: "STANDARD" | "ADMIN";
  role: "RECRUITER" | "VENDOR_USER";
}

let mockAuth: {
  user: MockUser | null;
  loading: boolean;
  logout: jest.Mock;
  refreshProfile: jest.Mock;
  login: jest.Mock;
  isAdmin: boolean;
  isVendor: boolean;
  isRecruiter: boolean;
} = {
  user: { id: "admin-1", name: "Admin Self", email: "admin_self@corp.com", access_level: "ADMIN", role: "RECRUITER" },
  loading: false,
  logout: jest.fn(),
  refreshProfile: jest.fn(),
  login: jest.fn(),
  isAdmin: true,
  isVendor: false,
  isRecruiter: true,
};

// Mock Auth Context
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

describe("Recruiter Users Management Authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    mockAuth = {
      user: { id: "admin-1", name: "Admin Self", email: "admin_self@corp.com", access_level: "ADMIN", role: "RECRUITER" },
      loading: false,
      logout: jest.fn(),
      refreshProfile: jest.fn(),
      login: jest.fn(),
      isAdmin: true,
      isVendor: false,
      isRecruiter: true,
    };
  });

  const mockUsers = [
    {
      id: "admin-1",
      name: "Admin Self",
      email: "admin_self@corp.com",
      mobile: "9234567890",
      role: "RECRUITER",
      access_level: "ADMIN",
      status: "ACTIVE",
      created_at: "2026-08-17T10:00:00Z"
    },
    {
      id: "std-1",
      name: "Standard Recruiter Active",
      email: "std_active@corp.com",
      mobile: "07569061194",
      role: "RECRUITER",
      access_level: "STANDARD",
      status: "ACTIVE",
      created_at: "2026-08-17T11:00:00Z"
    },
    {
      id: "std-2",
      name: "Standard Recruiter Disabled",
      email: "std_disabled@corp.com",
      mobile: "07569061195",
      role: "RECRUITER",
      access_level: "STANDARD",
      status: "DISABLED",
      created_at: "2026-08-17T12:00:00Z"
    }
  ];

  it("ADMIN recruiter sees action buttons for standard recruiters but self is protected", async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockUsers);

    render(<RecruiterUsersManagement />);

    // 1. Check title & headers
    expect(screen.getByRole("heading", { name: "Recruiter Users" })).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();

    // 2. Check loaded user rows
    await waitFor(() => {
      expect(screen.getByText("Admin Self")).toBeInTheDocument();
      expect(screen.getByText("Standard Recruiter Active")).toBeInTheDocument();
      expect(screen.getByText("Standard Recruiter Disabled")).toBeInTheDocument();
    });

    // 3. Current user has (Current User) instead of Deactivate
    expect(screen.getByText("(Current User)")).toBeInTheDocument();

    // 4. Standard recruiters have Deactivate / Reactivate buttons
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("handles ADMIN deactivating a standard recruiter", async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockUsers);
    (api.post as jest.Mock).mockResolvedValueOnce({ detail: "Recruiter User Standard Recruiter Active disabled." });

    render(<RecruiterUsersManagement />);

    await waitFor(() => {
      expect(screen.getByText("Standard Recruiter Active")).toBeInTheDocument();
    });

    const deactBtn = screen.getByRole("button", { name: "Deactivate" });
    fireEvent.click(deactBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/v1/recruiter/users/std-1/disable");
    });
  });

  it("handles ADMIN reactivating a disabled standard recruiter", async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(mockUsers);
    (api.post as jest.Mock).mockResolvedValueOnce({ detail: "Recruiter User Standard Recruiter Disabled reactivated." });

    render(<RecruiterUsersManagement />);

    await waitFor(() => {
      expect(screen.getByText("Standard Recruiter Disabled")).toBeInTheDocument();
    });

    const reactBtn = screen.getByRole("button", { name: "Reactivate" });
    fireEvent.click(reactBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/v1/recruiter/users/std-2/reactivate");
    });
  });

  it("STANDARD recruiter UI does NOT render Actions column or action buttons", async () => {
    mockAuth = {
      user: { id: "std-1", name: "Standard Recruiter Active", email: "std_active@corp.com", access_level: "STANDARD", role: "RECRUITER" },
      loading: false,
      logout: jest.fn(),
      refreshProfile: jest.fn(),
      login: jest.fn(),
      isAdmin: false,
      isVendor: false,
      isRecruiter: true,
    };

    (api.get as jest.Mock).mockResolvedValueOnce(mockUsers);

    render(<RecruiterUsersManagement />);

    await waitFor(() => {
      expect(screen.getByText("Admin Self")).toBeInTheDocument();
      expect(screen.getByText("Standard Recruiter Active")).toBeInTheDocument();
    });

    // 1. Actions column header must NOT be present
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();

    // 2. Deactivate and Reactivate buttons must NOT be present
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivate" })).not.toBeInTheDocument();
  });

  it("renders Recruiter Users navigation link in layout ONLY for ADMIN", () => {
    // 1. For ADMIN -> Visible
    mockAuth = {
      user: { id: "admin-1", name: "Admin Self", email: "admin_self@corp.com", access_level: "ADMIN", role: "RECRUITER" },
      loading: false,
      logout: jest.fn(),
      refreshProfile: jest.fn(),
      login: jest.fn(),
      isAdmin: true,
      isVendor: false,
      isRecruiter: true,
    };

    const { rerender } = render(
      <RecruiterLayout>
        <div>Content</div>
      </RecruiterLayout>
    );

    expect(screen.getByRole("link", { name: /Recruiter Users/i })).toBeInTheDocument();

    // 2. For STANDARD -> Hidden
    mockAuth = {
      user: { id: "std-1", name: "Standard Recruiter", email: "std@corp.com", access_level: "STANDARD", role: "RECRUITER" },
      loading: false,
      logout: jest.fn(),
      refreshProfile: jest.fn(),
      login: jest.fn(),
      isAdmin: false,
      isVendor: false,
      isRecruiter: true,
    };

    rerender(
      <RecruiterLayout>
        <div>Content</div>
      </RecruiterLayout>
    );

    expect(screen.queryByRole("link", { name: /Recruiter Users/i })).not.toBeInTheDocument();
  });
});
