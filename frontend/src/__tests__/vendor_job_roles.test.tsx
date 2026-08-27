import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VendorActiveJobRolesPage from "@/app/vendor/job-roles/page";
import VendorDashboard from "@/app/vendor/dashboard/page";
import JobRoleManagement from "@/app/recruiter/roles/page";
import { api } from "@/lib/api-client";

// Mock Next.js navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
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

// Mock Auth Context
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Test Vendor User", email: "v@corp.com" },
    loading: false,
    logout: jest.fn(),
    isVendor: true,
    isRecruiter: false,
  }),
}));

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = jest.fn(() => "blob:http://localhost/mock-blob-url");
global.URL.revokeObjectURL = jest.fn();
window.open = jest.fn();

describe("Vendor Active Job Roles & JD View/Download", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders active job roles list with JD actions and No JD indicators", async () => {
    const mockRoles = [
      {
        id: "r1",
        title: "AI/ML Engineer",
        department: "Engineering",
        department_id: "d1",
        job_id: "JOB-001",
        status: "ACTIVE",
        has_jd: true,
        jd_filename: "AI_ML_Engineer_JD.pdf",
        created_at: "2026-08-17T00:00:00Z",
        company: "IOSYS",
        vendor_id: "v1-id",
      },
      {
        id: "r2",
        title: "Python Developer",
        department: "Engineering",
        department_id: "d1",
        job_id: "JOB-002",
        status: "ACTIVE",
        has_jd: false,
        jd_filename: null,
        created_at: "2026-08-17T00:00:00Z",
        company: "Volantis",
        vendor_id: "v2-id",
      },
    ];

    (api.get as jest.Mock).mockResolvedValueOnce(mockRoles);

    render(<VendorActiveJobRolesPage />);

    expect(screen.getByText("Active Job Roles")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("AI/ML Engineer")).toBeInTheDocument();
      expect(screen.getByText("Python Developer")).toBeInTheDocument();
    });

    // Check Company column header and cells are rendered
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("IOSYS")).toBeInTheDocument();
    expect(screen.getByText("Volantis")).toBeInTheDocument();

    // Check JD actions for role 1
    expect(screen.getByText("View JD")).toBeInTheDocument();
    expect(screen.getByText("Download JD")).toBeInTheDocument();
    expect(screen.getByText("(AI_ML_Engineer_JD.pdf)")).toBeInTheDocument();

    // Check No JD indicator for role 2
    expect(screen.getByText("No JD available")).toBeInTheDocument();
  });

  it("handles View JD button click by fetching blob and opening new tab", async () => {
    const mockRoles = [
      {
        id: "r1",
        title: "AI/ML Engineer",
        department: "Engineering",
        department_id: "d1",
        job_id: "JOB-001",
        status: "ACTIVE",
        has_jd: true,
        jd_filename: "AI_ML_Engineer_JD.pdf",
        created_at: "2026-08-17T00:00:00Z",
        company: "IOSYS",
        vendor_id: "v1-id",
      },
    ];

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/vendor/job-roles") {
        return Promise.resolve(mockRoles);
      }
      if (url === "/api/v1/vendor/job-roles/r1/jd") {
        return Promise.resolve(new Blob(["%PDF mock content"], { type: "application/pdf" }));
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<VendorActiveJobRolesPage />);

    await waitFor(() => {
      expect(screen.getByText("View JD")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("View JD"));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/vendor/job-roles/r1/jd");
      expect(window.open).toHaveBeenCalledWith("blob:http://localhost/mock-blob-url", "_blank");
    });
  });

  it("handles Download JD button click by fetching blob and triggering link download", async () => {
    const mockRoles = [
      {
        id: "r1",
        title: "AI/ML Engineer",
        department: "Engineering",
        department_id: "d1",
        job_id: "JOB-001",
        status: "ACTIVE",
        has_jd: true,
        jd_filename: "AI_ML_Engineer_JD.pdf",
        created_at: "2026-08-17T00:00:00Z",
        company: "IOSYS",
        vendor_id: "v1-id",
      },
    ];

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/vendor/job-roles") {
        return Promise.resolve(mockRoles);
      }
      if (url === "/api/v1/vendor/job-roles/r1/jd?download=true") {
        return Promise.resolve(new Blob(["%PDF mock content"], { type: "application/pdf" }));
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<VendorActiveJobRolesPage />);

    await waitFor(() => {
      expect(screen.getByText("Download JD")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Download JD"));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/vendor/job-roles/r1/jd?download=true");
    });
  });

  it("displays empty state when no active job roles are available", async () => {
    (api.get as jest.Mock).mockResolvedValueOnce([]);

    render(<VendorActiveJobRolesPage />);

    await waitFor(() => {
      expect(screen.getByText("No active job roles are currently available.")).toBeInTheDocument();
    });
  });

  it("displays error message when API fails", async () => {
    (api.get as jest.Mock).mockRejectedValueOnce({ detail: "Network error loading roles" });

    render(<VendorActiveJobRolesPage />);

    await waitFor(() => {
      expect(screen.getByText("Network error loading roles")).toBeInTheDocument();
    });
  });
});

describe("Recruiter Job Role Management with JD Upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders recruiter role management and opens create modal with JD file input", async () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles") {
        return Promise.resolve([]);
      }
      if (url === "/api/v1/departments") {
        return Promise.resolve([{ id: "d1", name: "Engineering", status: "ACTIVE" }]);
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<JobRoleManagement />);

    expect(screen.getByText("Job Role Management")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("+ Create Job Role")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Create Job Role"));

    expect(screen.getByText(/Job Description \(JD\)/i)).toBeInTheDocument();
    expect(screen.getByText("Create Role")).toBeInTheDocument();
  });
});

describe("Vendor Dashboard to Active Job Roles Navigation Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("proves clicking '+ Submit Candidate' on Vendor Dashboard navigates to /vendor/job-roles", async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      items: [],
      total_items: 0,
      page: 1,
      page_size: 10,
      total_pages: 0,
    });

    render(<VendorDashboard />);

    // Verify "+ Submit Candidate" button points to /vendor/job-roles
    const submitBtnLink = screen.getByRole("link", { name: /\+ Submit Candidate/i });
    expect(submitBtnLink).toBeInTheDocument();
    expect(submitBtnLink).toHaveAttribute("href", "/vendor/job-roles");
  });

  it("proves submitting a candidate from Active Job Roles cascades selected job context correctly", async () => {
    const mockRoles = [
      {
        id: "role-123",
        title: "Staff DevOps Engineer",
        department: "Operations",
        department_id: "dept-456",
        job_id: "JOB-DEV-007",
        status: "ACTIVE",
        has_jd: false,
        jd_filename: null,
        created_at: "2026-08-17T00:00:00Z",
        company: "Volantis",
        vendor_id: "vendor-xyz",
      },
    ];

    (api.get as jest.Mock).mockResolvedValueOnce(mockRoles);

    render(<VendorActiveJobRolesPage />);

    await waitFor(() => {
      expect(screen.getByText("Staff DevOps Engineer")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /Submit Candidate/i });
    fireEvent.click(submitBtn);

    // Verify the context query parameters are passed in navigation
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining("/vendor/submit?role_id=role-123&job_id=JOB-DEV-007&dept_id=dept-456&title=Staff+DevOps+Engineer&dept=Operations&vendor_id=vendor-xyz&company=Volantis")
      );
    });
  });
});
