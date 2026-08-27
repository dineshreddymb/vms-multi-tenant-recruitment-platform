import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CandidatesDashboard from "@/app/recruiter/candidates/page";
import CandidateDetail from "@/app/recruiter/submissions/[id]/page";
import { api } from "@/lib/api-client";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "sub-12345" }),
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

// Mock Auth Context
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Recruiter Admin",
      email: "admin@corp.com",
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

describe("Recruiter Candidate Status Management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders candidates table with Manage Status action linking to submission detail", async () => {
    const mockCandidates = {
      items: [
        {
          id: "sub-12345",
          status: "SUBMITTED",
          cv_sent_date: "2026-08-15",
          employment_mode: "Perm",
          created_at: new Date().toISOString(),
          role: { id: "r1", department_id: "d1", title: "Backend Lead", status: "ACTIVE" },
          candidate: {
            id: "c1",
            name: "John Doe",
            email: "john@example.com",
            contact_number: "+919876543210",
            current_company: "Tech Corp",
            total_experience: 6,
            relevant_experience: 4,
            notice_period: "30",
            ctc: 18,
            ectc: 24,
            current_location: "Bangalore",
            preferred_location: "Bangalore",
            pan_masked: "******1234",
            linkedin_url: "https://linkedin.com/in/johndoe",
            education: "B.Tech",
            about: "Experienced backend engineer",
            created_at: new Date().toISOString(),
          },
          vendor_name: "Prime Staffing",
          resume_id: "res-1",
        },
        {
          id: "sub-67890",
          status: "SCREENING",
          cv_sent_date: "2026-08-14",
          employment_mode: "C2H",
          created_at: new Date().toISOString(),
          role: { id: "r2", department_id: "d1", title: "Frontend Architect", status: "ACTIVE" },
          candidate: {
            id: "c2",
            name: "Jane Smith",
            email: "jane@example.com",
            contact_number: "+919876543211",
            current_company: "Alpha Inc",
            total_experience: 8,
            relevant_experience: 6,
            notice_period: "Immediate",
            ctc: 25,
            ectc: 32,
            current_location: "Hyderabad",
            preferred_location: "Hyderabad",
            pan_masked: "******5678",
            linkedin_url: "https://linkedin.com/in/janesmith",
            education: "M.Tech",
            about: "Frontend specialist",
            created_at: new Date().toISOString(),
          },
          vendor_name: "Apex Talent",
          resume_id: "res-2",
        }
      ],
      total_items: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    };

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/recruiter/job-roles")) return Promise.resolve([]);
      if (url.startsWith("/api/v1/recruiter/candidates")) return Promise.resolve(mockCandidates);
      return Promise.reject(new Error("Unknown route"));
    });

    render(<CandidatesDashboard />);

    // 1. Confirm candidates load (displays company name in the first column)
    await waitFor(() => {
      expect(screen.getByText("Prime Staffing")).toBeInTheDocument();
      expect(screen.getByText("Apex Talent")).toBeInTheDocument();
      // Candidate names are now visible in the Candidate Name column
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    });

    // 2. Confirm Status / Actions column header exists
    expect(screen.getByText("Status / Actions")).toBeInTheDocument();

    // 3. Confirm Status badges are displayed
    expect(screen.getByText("SUBMITTED")).toBeInTheDocument();
    expect(screen.getByText("SCREENING")).toBeInTheDocument();

    // 4. Confirm Manage Status links are rendered with correct href
    const manageLinks = screen.getAllByText(/Manage Status/i);
    expect(manageLinks).toHaveLength(2);
    expect(manageLinks[0].closest("a")).toHaveAttribute("href", "/recruiter/submissions/sub-12345");
    expect(manageLinks[1].closest("a")).toHaveAttribute("href", "/recruiter/submissions/sub-67890");
  });

  it("allows recruiter to progress candidate status from SUBMITTED to SCREENING on submission detail page", async () => {
    const mockDetail = {
      id: "sub-12345",
      status: "SUBMITTED",
      cv_sent_date: "2026-08-15",
      employment_mode: "Perm",
      created_at: new Date().toISOString(),
      role: { id: "r1", department_id: "d1", title: "Backend Lead", status: "ACTIVE" },
      candidate: {
        id: "c1",
        name: "John Doe",
        email: "john@example.com",
        contact_number: "+919876543210",
        current_company: "Tech Corp",
        total_experience: "6",
        relevant_experience: "4",
        notice_period: "30",
        ctc: "18",
        ectc: "24",
        current_location: "Bangalore",
        preferred_location: "Bangalore",
        pan_masked: "******1234",
        linkedin_url: "https://linkedin.com/in/johndoe",
        education: "B.Tech",
        about: "Experienced backend engineer",
        created_at: new Date().toISOString(),
      },
      vendor_name: "Prime Staffing",
      resume_id: "res-1",
    };

    const mockHistory = [
      { id: "h1", status: "SUBMITTED", reason: "Initial candidate submission", changed_by_name: "System", changed_at: new Date().toISOString() }
    ];

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/submissions/sub-12345") return Promise.resolve(mockDetail);
      if (url === "/api/v1/recruiter/submissions/sub-12345/history") return Promise.resolve(mockHistory);
      return Promise.reject(new Error("Unknown route"));
    });

    (api.patch as jest.Mock).mockImplementation((url: string, body: unknown) => {
      if (url === "/api/v1/recruiter/submissions/sub-12345/status") {
        const payload = body as { status: string };
        return Promise.resolve({
          ...mockDetail,
          status: payload.status,
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<CandidateDetail />);

    // 1. Confirm detail page loads with SUBMITTED status
    await waitFor(() => {
      expect(screen.getByText("Progress to SCREENING")).toBeInTheDocument();
      expect(screen.getByText("Reject Candidate")).toBeInTheDocument();
    });

    // 2. Click "Progress to SCREENING"
    fireEvent.click(screen.getByText("Progress to SCREENING"));

    // 3. Confirm API call with correct status
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/api/v1/recruiter/submissions/sub-12345/status",
        { status: "SCREENING", reason: undefined }
      );
    });
  });
});
