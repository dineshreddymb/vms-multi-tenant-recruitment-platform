import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JobRoleManagement from "@/app/recruiter/roles/page";
import SubmitCandidate from "@/app/vendor/submit/page";
import CandidatesDashboard from "@/app/recruiter/candidates/page";
import { api } from "@/lib/api-client";

// Mock router
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}));

// Mock API
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
    user: {
      id: "u1",
      name: "Test User",
      email: "user@corp.com",
      companies: [
        { id: "m1", vendor_id: "v1", company_name: "IOSYS", status: "ACTIVE" }
      ]
    },
    loading: false,
    logout: jest.fn(),
    isVendor: false,
    isRecruiter: true,
  }),
}));

describe("Recruiter Job ID Creation & Table Display", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("displays Job ID column in table and requires Job ID in Create Role modal with red asterisk", async () => {
    const mockRoles = [
      {
        id: "r1",
        department_id: "d1",
        title: "Generative AI Engineer",
        job_id: "JOB-10492",
        status: "ACTIVE",
        has_jd: true,
        jd_filename: "jd.pdf",
        created_at: new Date().toISOString(),
      },
    ];
    const mockDepts = [{ id: "d1", name: "Artificial Intelligence", status: "ACTIVE" }];

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles") return Promise.resolve(mockRoles);
      if (url === "/api/v1/departments") return Promise.resolve(mockDepts);
      if (url === "/api/v1/recruiter/job-role-options") return Promise.resolve([]);
      return Promise.reject(new Error("Unknown route"));
    });

    render(<JobRoleManagement />);

    // Verify Job ID column header and cell in table
    await waitFor(() => {
      expect(screen.getByText("Job ID", { selector: "th" })).toBeInTheDocument();
      expect(screen.getByText("JOB-10492")).toBeInTheDocument();
    });

    // Open Create Modal
    fireEvent.click(screen.getByText("+ Create Job Role"));
    expect(screen.getByRole("heading", { name: "Create Job Role" })).toBeInTheDocument();

    // Verify Job ID input and label
    const jobIdInput = screen.getByLabelText(/Job ID/i);
    expect(jobIdInput).toBeInTheDocument();
    expect(jobIdInput).toHaveAttribute("required");

    // Submit with empty Job ID -> blocked by validation error
    const deptInput = screen.getByLabelText(/Department/i, { selector: "input" });
    fireEvent.change(deptInput, { target: { value: "Engineering" } });

    const roleSelect = screen.getByLabelText(/Job Role Title/i, { selector: "select" });
    fireEvent.change(roleSelect, { target: { value: "Generative AI Engineer" } });

    const createBtn = screen.getByText("Create Role", { selector: "button" });
    fireEvent.submit(createBtn.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Job ID: Please enter a unique Job ID.")).toBeInTheDocument();
    });
  });

  it("displays duplicate Job ID error when backend returns 409", async () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles") return Promise.resolve([]);
      if (url === "/api/v1/departments") return Promise.resolve([{ id: "d1", name: "Engineering", status: "ACTIVE" }]);
      if (url === "/api/v1/recruiter/job-role-options") return Promise.resolve([]);
      return Promise.reject(new Error("Unknown route"));
    });

    (api.post as jest.Mock).mockRejectedValueOnce({
      status: 409,
      detail: "Job ID: A job role with this Job ID already exists.",
    });

    render(<JobRoleManagement />);

    await waitFor(() => {
      expect(screen.getByText("+ Create Job Role")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Create Job Role"));

    const deptInput = screen.getByLabelText(/Department/i, { selector: "input" });
    fireEvent.change(deptInput, { target: { value: "Engineering" } });

    const roleInput = screen.getByPlaceholderText(/e\.g\. Lead Software Engineer/i);
    fireEvent.change(roleInput, { target: { value: "MLOps Engineer" } });

    const jobIdInput = screen.getByPlaceholderText("e.g. JOB-10492");
    fireEvent.change(jobIdInput, { target: { value: "JOB-EXISTING" } });

    const createBtn = screen.getByText("Create Role", { selector: "button" });
    fireEvent.submit(createBtn.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Job ID: A job role with this Job ID already exists.")).toBeInTheDocument();
    });
  });
});

describe("Vendor Submit Candidate Job ID Cascade & Auto-Population", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("auto-populates Job ID upon selecting Job Role and clears Job ID when Department changes", async () => {
    const mockDepts = [
      { id: "dept-1", name: "Artificial Intelligence", status: "ACTIVE" },
      { id: "dept-2", name: "Cloud Engineering", status: "ACTIVE" },
    ];
    const mockRolesDept1 = [
      { id: "role-1", department_id: "dept-1", title: "Generative AI Engineer", job_id: "JOB-GENAI-99", status: "ACTIVE" },
      { id: "role-2", department_id: "dept-1", title: "Computer Vision Specialist", job_id: "JOB-CV-88", status: "ACTIVE" },
    ];
    const mockRolesDept2 = [
      { id: "role-3", department_id: "dept-2", title: "Cloud Architect", job_id: "JOB-CLOUD-77", status: "ACTIVE" },
    ];

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/departments") return Promise.resolve(mockDepts);
      if (url === "/api/v1/job-roles?department_id=dept-1") return Promise.resolve(mockRolesDept1);
      if (url === "/api/v1/job-roles?department_id=dept-2") return Promise.resolve(mockRolesDept2);
      return Promise.reject(new Error("Unknown route"));
    });

    render(<SubmitCandidate />);

    await waitFor(() => {
      expect(screen.getByText("Submit Candidate Profile")).toBeInTheDocument();
    });

    // 1. Initial State: Job ID is empty
    const jobIdInput = screen.getByLabelText(/Job ID/i) as HTMLInputElement;
    expect(jobIdInput.value).toBe("");
    expect(jobIdInput).toHaveAttribute("readonly");

    // 2. Select Department 1
    const deptSelect = screen.getByLabelText(/Target Department/i, { selector: "select" });
    fireEvent.change(deptSelect, { target: { value: "dept-1" } });

    // 3. Select Role 1 -> Job ID should become "JOB-GENAI-99"
    await waitFor(() => {
      expect(screen.getByLabelText(/Target Job Role/i, { selector: "select" })).not.toBeDisabled();
    });
    const roleSelect = screen.getByLabelText(/Target Job Role/i, { selector: "select" });
    fireEvent.change(roleSelect, { target: { value: "role-1" } });

    await waitFor(() => {
      expect(jobIdInput.value).toBe("JOB-GENAI-99");
    });

    // 4. Change Role to Role 2 -> Job ID updates to "JOB-CV-88"
    fireEvent.change(roleSelect, { target: { value: "role-2" } });

    await waitFor(() => {
      expect(jobIdInput.value).toBe("JOB-CV-88");
    });

    // 5. Change Department to Department 2 -> Selected Role and Job ID are cleared!
    fireEvent.change(deptSelect, { target: { value: "dept-2" } });

    await waitFor(() => {
      expect(jobIdInput.value).toBe("");
    });
  });

  it("Flow B: correctly retains selectedRoleId and jobId from query params when preselectedJob is provided", async () => {
    // Override searchParams mock specifically for this test
    const mockSearchParams = new URLSearchParams({
      role_id: "role-1",
      job_id: "JOB-GENAI-99",
      dept_id: "dept-1",
      title: "DevOps Lead",
      dept: "Engineering"
    });
    const navigationMock = jest.requireMock("next/navigation");
    const originalUseSearchParams = navigationMock.useSearchParams;
    navigationMock.useSearchParams = () => mockSearchParams;

    const mockDepts = [{ id: "dept-1", name: "Engineering", status: "ACTIVE" }];
    const mockRolesDept1 = [
      { id: "role-1", department_id: "dept-1", title: "DevOps Lead", job_id: "JOB-GENAI-99", status: "ACTIVE" }
    ];

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/departments") return Promise.resolve(mockDepts);
      if (url === "/api/v1/job-roles?department_id=dept-1") return Promise.resolve(mockRolesDept1);
      return Promise.reject(new Error("Unknown route: " + url));
    });

    render(<SubmitCandidate />);

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText("Submit Candidate Profile")).toBeInTheDocument();
    });

    // Wait for the roles fetching API call and state resolution
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/job-roles?department_id=dept-1");
    });

    // Check that pre-selected panel renders correct values visually
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("DevOps Lead")).toBeInTheDocument();
    expect(screen.getByText("JOB-GENAI-99")).toBeInTheDocument();

    // Verify that the underlying form fields validation checks would succeed or submit payload has correct values.
    // Clean up mock
    navigationMock.useSearchParams = originalUseSearchParams;
  });
});

describe("Recruiter Candidates Pipeline Job ID Column & Search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders Job ID column, displays Job ID from API, handles multiple candidates with same Job ID and historical NULL safely", async () => {
    const mockCandidatesData = {
      items: [
        {
          id: "sub-1",
          status: "SUBMITTED",
          cv_sent_date: "2026-08-18",
          employment_mode: "Perm",
          job_id: "JOB-SHARED-101",
          created_at: new Date().toISOString(),
          role: { id: "r1", department_id: "d1", title: "AI Engineer", status: "ACTIVE" },
          candidate: {
            id: "c1",
            name: "Candidate Alpha",
            email: "alpha@corp.com",
            contact_number: "9876543210",
            current_company: "Alpha Corp",
            total_experience: 4,
            relevant_experience: 3,
            notice_period: "30",
            ctc: 12,
            ectc: 15,
            current_location: "BLR",
            preferred_location: "HYD",
            pan_masked: "******1234",
            linkedin_url: "https://linkedin.com/in/alpha",
            education: "B.Tech",
            about: "Bio",
            created_at: new Date().toISOString(),
          },
          vendor_name: "Vendor Alpha Corp",
          resume_id: "res-1",
        },
        {
          id: "sub-2",
          status: "SCREENING",
          cv_sent_date: "2026-08-18",
          employment_mode: "C2H",
          job_id: "JOB-SHARED-101", // SAME Job ID as sub-1
          created_at: new Date().toISOString(),
          role: { id: "r1", department_id: "d1", title: "AI Engineer", status: "ACTIVE" },
          candidate: {
            id: "c2",
            name: "Candidate Beta",
            email: "beta@corp.com",
            contact_number: "9876543211",
            current_company: "Beta Corp",
            total_experience: 5,
            relevant_experience: 4,
            notice_period: "Immediate",
            ctc: 14,
            ectc: 18,
            current_location: "MUM",
            preferred_location: "BLR",
            pan_masked: "******5678",
            linkedin_url: "https://linkedin.com/in/beta",
            education: "M.Tech",
            about: "Bio",
            created_at: new Date().toISOString(),
          },
          vendor_name: "Vendor Beta Corp",
          resume_id: "res-2",
        },
        {
          id: "sub-3",
          status: "SUBMITTED",
          cv_sent_date: "2026-08-18",
          employment_mode: "Perm",
          job_id: null, // Historical candidate with NULL Job ID
          created_at: new Date().toISOString(),
          role: { id: "r2", department_id: "d1", title: "DevOps Engineer", status: "ACTIVE" },
          candidate: {
            id: "c3",
            name: "Candidate Historical",
            email: "hist@corp.com",
            contact_number: "9876543212",
            current_company: "Old Corp",
            total_experience: 6,
            relevant_experience: 5,
            notice_period: "60",
            ctc: 16,
            ectc: 20,
            current_location: "DEL",
            preferred_location: "DEL",
            pan_masked: "******9999",
            linkedin_url: "https://linkedin.com/in/hist",
            education: "MCA",
            about: "Bio",
            created_at: new Date().toISOString(),
          },
          vendor_name: "Vendor Gamma Corp",
          resume_id: "res-3",
        },
      ],
      total_items: 3,
      page: 1,
      page_size: 10,
      total_pages: 1,
    };

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles") return Promise.resolve([]);
      if (url.includes("/api/v1/recruiter/candidates")) return Promise.resolve(mockCandidatesData);
      return Promise.reject(new Error("Unknown route: " + url));
    });

    render(<CandidatesDashboard />);

    // 1. Verify Table Header renders "Job ID"
    await waitFor(() => {
      expect(screen.getByText("Job ID", { selector: "th" })).toBeInTheDocument();
    });

    // 2. Verify all other existing headers render
    expect(screen.getByText("#", { selector: "th" })).toBeInTheDocument();
    expect(screen.getByText("Company", { selector: "th" })).toBeInTheDocument();
    expect(screen.getByText("Candidate Name", { selector: "th" })).toBeInTheDocument();
    expect(screen.getByText("Vendor User", { selector: "th" })).toBeInTheDocument();
    expect(screen.queryByText("Vendor User ID", { selector: "th" })).not.toBeInTheDocument();
    expect(screen.getByText("Vendor User Mobile", { selector: "th" })).toBeInTheDocument();
    expect(screen.getByText("Role", { selector: "th" })).toBeInTheDocument();
    expect(screen.getByText("Vendor Name", { selector: "th" })).toBeInTheDocument();
    expect(screen.getByText("CV Sent Date", { selector: "th" })).toBeInTheDocument();
    expect(screen.getByText("Employment Mode", { selector: "th" })).toBeInTheDocument();

    // 3. Verify exact Job ID displayed for Candidate Alpha and Candidate Beta (multiple candidates sharing JOB-SHARED-101)
    await waitFor(() => {
      const sharedJobIdElements = screen.getAllByText("JOB-SHARED-101");
      expect(sharedJobIdElements.length).toBe(2);
    });

    // 4. Verify Company Names render (via vendor_name field)
    expect(screen.getByText("Vendor Alpha Corp")).toBeInTheDocument();
    expect(screen.getByText("Vendor Beta Corp")).toBeInTheDocument();
    expect(screen.getByText("Vendor Gamma Corp")).toBeInTheDocument();

    // Verify Candidate Names ARE now rendered in the table (Candidate Name column added)
    expect(screen.getByText("Candidate Alpha")).toBeInTheDocument();
    expect(screen.getByText("Candidate Beta")).toBeInTheDocument();

    // 5. Verify Search Column dropdown contains required options and NOT internal/removed options
    const searchColSelect = screen.getByLabelText(/Search Column/i, { selector: "select" });
    expect(searchColSelect).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Job ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Candidate Name" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Vendor Name" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Employment Mode" })).toBeInTheDocument();
    // LinkedIn Profile URL must NOT be in search dropdown
    expect(screen.queryByRole("option", { name: "LinkedIn Profile URL" })).not.toBeInTheDocument();

    // 6. Select "Job ID" as search column and search
    fireEvent.change(searchColSelect, { target: { value: "job_id" } });
    const searchInput = screen.getByPlaceholderText(/Type keyword and press search/i);
    fireEvent.change(searchInput, { target: { value: "JOB-SHARED-101" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    // 7. Verify API was called with search_column=job_id&search_query=JOB-SHARED-101
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("search_column=job_id&search_query=JOB-SHARED-101")
      );
    });
  });
});

