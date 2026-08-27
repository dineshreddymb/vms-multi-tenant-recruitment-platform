import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import VendorLogin from "../app/auth/vendor/login/page";
import RecruiterLogin from "../app/auth/recruiter/login/page";
import { useAuth } from "../context/AuthContext";
import { api, APIError, formatValidationErrorItem, formatDetailError } from "../lib/api-client";
import VendorDashboard from "../app/vendor/dashboard/page";
import RecruiterCandidates from "../app/recruiter/candidates/page";
import RecruiterLayout from "../app/recruiter/layout";
import RecruiterApprovals from "../app/recruiter/approvals/page";
import SubmitCandidate from "../app/vendor/submit/page";
import RecruiterVendorUsers from "../app/recruiter/vendor-users/page";
import CandidateDetail from "../app/recruiter/submissions/[id]/page";
import ForgotPassword from "../app/auth/forgot-password/page";
import ResetPassword from "../app/auth/reset-password/page";
import JobRoleManagement from "../app/recruiter/roles/page";

// Mock next/navigation
const mockPush = jest.fn();
let mockToken: string | null = null;

jest.mock("next/navigation", () => ({
  useRouter() {
    return {
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
    };
  },
  useSearchParams() {
    return {
      get: (key: string) => (key === "token" ? mockToken : null),
    };
  },
  useParams() {
    return {
      id: "c1",
    };
  },
  usePathname() {
    return "/";
  },
}));

// Mock AuthContext
const mockLogin = jest.fn();
const mockLogout = jest.fn();
let mockIsAdmin = false;
let mockIsRecruiter = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUser: any = null;

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    login: mockLogin,
    logout: mockLogout,
    isAdmin: mockIsAdmin,
    isRecruiter: mockIsRecruiter,
    activeVendorId: mockUser?.active_vendor_id || null,
    setActiveVendorId: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock API Client
jest.mock("../lib/api-client", () => {
  const actual = jest.requireActual("../lib/api-client");
  return {
    ...actual,
    api: {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    },
    APIError: actual.APIError,
  };
});

describe("VMS Frontend Tests", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUser = null;
    mockIsAdmin = false;
    mockIsRecruiter = false;
  });

  // 1. Vendor Login rendering/flow
  test("Vendor Login rendering and flow", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    render(<VendorLogin />);

    // Rendering check
    expect(screen.getByText("Vendor Login")).toBeInTheDocument();
    
    // Self-signup check: verify there IS a link to vendor signup page
    const links = screen.queryAllByRole("link");
    const hasVendorSignup = links.some(link => link.getAttribute("href")?.includes("vendor/signup"));
    expect(hasVendorSignup).toBe(true);

    // Form inputs and submit
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "vendor@company.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("vendor@company.com", "password123", "vendor");
    });
  });

  // 2. Recruiter Login rendering/flow
  test("Recruiter Login rendering and flow", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    render(<RecruiterLogin />);

    expect(screen.getByText("Recruiter Login")).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "recruiter@company.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("recruiter@company.com", "password123", "recruiter");
    });
  });

  // 3. Vendor self-signup does NOT exist
  test("Vendor self-signup routes/elements are absent", () => {
    render(<VendorLogin />);
    expect(screen.queryByText(/sign up as vendor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/register company/i)).not.toBeInTheDocument();
  });

  // 4. Vendor dashboard pagination behavior & Vendor submission API pagination request
  test("Vendor dashboard server-side pagination flow", async () => {
    mockUser = { id: "v1", email: "vendor@company.com", role: "vendor" };
    
    // Set up mock api calls
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/vendor/submissions")) {
        // Parse page from URL
        const match = url.match(/page=(\d+)/);
        const p = match ? parseInt(match[1], 10) : 1;
        if (p === 1) {
          return Promise.resolve({
            items: [
              { id: "s1", submission_reference: "SUB-REF-1", job_id: "JOB-REF-1", role_id: "role-1", cv_sent_date: "2026-08-13", employment_mode: "FULL_TIME", created_at: "2026-08-13T12:00:00Z", status: "SUBMITTED" }
            ],
            total_items: 15,
            page: 1,
            page_size: 10,
            total_pages: 2
          });
        } else {
          return Promise.resolve({
            items: [
              { id: "s2", submission_reference: "SUB-REF-2", job_id: "JOB-REF-2", role_id: "role-2", cv_sent_date: "2026-08-13", employment_mode: "PART_TIME", created_at: "2026-08-13T12:00:00Z", status: "SELECTED" }
            ],
            total_items: 15,
            page: 2,
            page_size: 10,
            total_pages: 2
          });
        }
      }
      return Promise.resolve([]);
    });

    render(<VendorDashboard />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/vendor/submissions?page=1&page_size=10");
    });

    // Check rendering of first item reference and job_id
    expect(screen.getByText("SUB-REF-1")).toBeInTheDocument();
    expect(screen.getByText("JOB-REF-1")).toBeInTheDocument();
    
    // Check page text with narrow custom matcher that targets the SPAN containing the text
    expect(screen.getByText((content, element) => {
      return element?.tagName === "SPAN" && element?.textContent?.trim().replace(/\s+/g, " ").includes("Showing Page 1 of 2");
    })).toBeInTheDocument();

    // Go to next page
    const nextButton = screen.getByRole("button", { name: /Next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/vendor/submissions?page=2&page_size=10");
    });

    expect(screen.getByText("SUB-REF-2")).toBeInTheDocument();
    expect(screen.getByText("JOB-REF-2")).toBeInTheDocument();
  });

  // 5. Recruiter candidate pagination
  test("Recruiter candidate search and pagination page requests", async () => {
    mockUser = {
      id: "r1",
      email: "recruiter@company.com",
      role: "recruiter",
      companies: [
        { id: "m1", vendor_id: "v1", company_name: "IOSYS", status: "ACTIVE" }
      ]
    };
    mockIsRecruiter = true;

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/job-roles")) {
        return Promise.resolve([
          { id: "r-1", title: "Software Engineer", status: "ACTIVE" }
        ]);
      }
      if (url.includes("/candidates")) {
        return Promise.resolve({
          items: [
            {
              id: "c1",
              status: "OFFER_EXTENDED",
              cv_sent_date: "2026-08-13",
              employment_mode: "C2H",
              created_at: "2026-08-13T12:00:00Z",
              role: { id: "r-1", title: "Software Engineer" },
              candidate: {
                name: "Alice Johnson",
                email: "alice@test.com",
                contact_number: "+919876543210",
                current_company: "Test Company",
                total_experience: 5.5,
                relevant_experience: 4.5,
                notice_period: "30",
                ctc: 12,
                ectc: 15,
                current_location: "Mumbai",
                preferred_location: "Pune",
                pan_masked: "******1234",
                linkedin_url: "https://linkedin.com/in/alice",
                education: "M.Tech",
                about: "Experienced Software Developer."
              },
              vendor_name: "Vendor Corp",
              vendor_user_name: "Ravi Kumar",
              vendor_user_ref: "VU001",
              vendor_user_mobile: "9876543210",
              resume_id: "res-1"
            }
          ],
          total_items: 12,
          page: 1,
          page_size: 10,
          total_pages: 2
        });
      }
      return Promise.resolve([]);
    });

    render(<RecruiterCandidates />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/recruiter/candidates?page=1&page_size=10&sort_by=submission_date&sort_order=desc&vendor_id=v1");
    });

    expect(screen.getByText("Vendor Corp")).toBeInTheDocument();
    
    // Verify business headers are in the document
    expect(screen.getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Candidate Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Vendor User" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Vendor User ID" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Vendor User Mobile" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Vendor Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "CV Sent Date" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Employment Mode" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Contact Number" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Email ID" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Current Company" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total Experience" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Relevant Experience" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Notice Period" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "CTC" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "ECTC" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Current Location" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Preferred Location" })).toBeInTheDocument();
    // PAN Card, LinkedIn URL, Education, About the Candidate are removed from the default table view
    expect(screen.queryByRole("columnheader", { name: "PAN Card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "LinkedIn URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Education" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "About the Candidate" })).not.toBeInTheDocument();

    // Verify cell content is displayed properly
    expect(screen.getByText("Alice Johnson", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("Ravi Kumar", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("9876543210", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("+919876543210", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("Test Company", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("5.5 Yrs", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("4.5 Yrs", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("30 Days", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("12 LPA", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("15 LPA", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("Mumbai", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("Pune", { selector: "td" })).toBeInTheDocument();
    // PAN Card, LinkedIn URL, Education, About are removed from the table view
    expect(screen.queryByText("******1234", { selector: "td" })).not.toBeInTheDocument();
    expect(screen.queryByText("LinkedIn", { selector: "a" })).not.toBeInTheDocument();
    expect(screen.getByText("OFFER_EXTENDED", { selector: "span" })).toBeInTheDocument();

    // Check Sl No header and row value
    expect(screen.getByText("#")).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "td" })).toBeInTheDocument();
  });

  // 5b. Recruiter Candidates Resume Column and Actions Tests
  describe("Recruiter Candidates Resume column and actions", () => {
    let originalOpen: typeof window.open;
    let originalCreateObjectURL: typeof window.URL.createObjectURL;
    let originalRevokeObjectURL: typeof window.URL.revokeObjectURL;

    beforeEach(() => {
      mockUser = {
        id: "r1",
        email: "recruiter@company.com",
        role: "recruiter",
        companies: [
          { id: "m1", vendor_id: "v1", company_name: "IOSYS", status: "ACTIVE" }
        ]
      };
      mockIsRecruiter = true;

      originalOpen = window.open;
      originalCreateObjectURL = window.URL.createObjectURL;
      originalRevokeObjectURL = window.URL.revokeObjectURL;

      window.open = jest.fn();
      window.URL.createObjectURL = jest.fn().mockReturnValue("blob:http://localhost/xyz");
      window.URL.revokeObjectURL = jest.fn();
    });

    afterEach(() => {
      window.open = originalOpen;
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    test("TEST 1, 2, 8: Resume column and actions are rendered with existing fields", async () => {
      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/job-roles")) {
          return Promise.resolve([{ id: "r-1", title: "Software Engineer", status: "ACTIVE" }]);
        }
        if (url.includes("/candidates")) {
          return Promise.resolve({
            items: [
              {
                id: "c1",
                status: "OFFER_EXTENDED",
                cv_sent_date: "2026-08-13",
                employment_mode: "C2H",
                created_at: "2026-08-13T12:00:00Z",
                role: { id: "r-1", title: "Software Engineer" },
                candidate: {
                  name: "Alice Johnson",
                  email: "alice@test.com",
                  contact_number: "+919876543210"
                },
                vendor_name: "Vendor Corp",
                resume_id: "res-1"
              }
            ],
            total_items: 1,
            page: 1,
            page_size: 10,
            total_pages: 1
          });
        }
        return Promise.resolve([]);
      });

      render(<RecruiterCandidates />);

      await waitFor(() => {
        expect(screen.getByRole("columnheader", { name: "Resume" })).toBeInTheDocument();
      });

      // Verify View and Download actions are rendered
      expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();

      // TEST 8: Existing candidate fields are unchanged (vendor_name is displayed in Company column)
      expect(screen.getByText("Vendor Corp")).toBeInTheDocument();
      // Alice Johnson is now visible in the Candidate Name column
      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
      expect(screen.getByText("Software Engineer", { selector: "td" })).toBeInTheDocument();
    });

    test("TEST 3, 4: Clicking View Resume uses the existing authenticated download endpoint and opens in a new tab", async () => {
      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/job-roles")) {
          return Promise.resolve([{ id: "r-1", title: "Software Engineer", status: "ACTIVE" }]);
        }
        if (url.includes("/candidates")) {
          return Promise.resolve({
            items: [
              {
                id: "c1",
                status: "OFFER_EXTENDED",
                cv_sent_date: "2026-08-13",
                role: { id: "r-1", title: "Software Engineer" },
                candidate: { name: "Alice Johnson" },
                vendor_name: "Vendor Corp",
                resume_id: "res-1"
              }
            ],
            total_items: 1,
            page: 1,
            page_size: 10,
            total_pages: 1
          });
        }
        if (url.includes("/resumes/res-1/download")) {
          return Promise.resolve(new Blob(["pdf content"], { type: "application/pdf" }));
        }
        return Promise.resolve([]);
      });

      render(<RecruiterCandidates />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "View" }));
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith("/api/v1/resumes/res-1/download");
      });

      expect(window.open).toHaveBeenCalledWith("blob:http://localhost/xyz", "_blank");
    });

    test("TEST 5: Clicking Download uses the existing download endpoint and triggers download", async () => {
      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/job-roles")) {
          return Promise.resolve([]);
        }
        if (url.includes("/candidates")) {
          return Promise.resolve({
            items: [
              {
                id: "c1",
                status: "OFFER_EXTENDED",
                cv_sent_date: "2026-08-13",
                role: { id: "r-1", title: "Software Engineer" },
                candidate: { name: "Alice Johnson" },
                vendor_name: "Vendor Corp",
                resume_id: "res-1"
              }
            ],
            total_items: 1,
            page: 1,
            page_size: 10,
            total_pages: 1
          });
        }
        if (url.includes("/resumes/res-1/download")) {
          return Promise.resolve(new Blob(["pdf content"], { type: "application/pdf" }));
        }
        return Promise.resolve([]);
      });

      render(<RecruiterCandidates />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Download" }));
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith("/api/v1/resumes/res-1/download");
      });

      expect(window.URL.createObjectURL).toHaveBeenCalled();
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/xyz");
    });

    test("TEST 6: Missing resume data is handled gracefully", async () => {
      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/job-roles")) {
          return Promise.resolve([]);
        }
        if (url.includes("/candidates")) {
          return Promise.resolve({
            items: [
              {
                id: "c1",
                status: "OFFER_EXTENDED",
                cv_sent_date: "2026-08-13",
                role: { id: "r-1", title: "Software Engineer" },
                candidate: { name: "Alice Johnson" },
                vendor_name: "Vendor Corp",
                resume_id: null // Missing resume
              }
            ],
            total_items: 1,
            page: 1,
            page_size: 10,
            total_pages: 1
          });
        }
        return Promise.resolve([]);
      });

      render(<RecruiterCandidates />);

      await waitFor(() => {
        expect(screen.getByText("No Resume", { selector: "span" })).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: "View" })).not.toBeInTheDocument();
    });

    test("TEST 7: Resume API failure displays readable error and doesn't crash", async () => {
      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/job-roles")) {
          return Promise.resolve([]);
        }
        if (url.includes("/candidates")) {
          return Promise.resolve({
            items: [
              {
                id: "c1",
                status: "OFFER_EXTENDED",
                cv_sent_date: "2026-08-13",
                role: { id: "r-1", title: "Software Engineer" },
                candidate: { name: "Alice Johnson" },
                vendor_name: "Vendor Corp",
                resume_id: "res-1"
              }
            ],
            total_items: 1,
            page: 1,
            page_size: 10,
            total_pages: 1
          });
        }
        if (url.includes("/resumes/res-1/download")) {
          return Promise.reject(new APIError(403, "Access denied: Resume failed security verification."));
        }
        return Promise.resolve([]);
      });

      render(<RecruiterCandidates />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "View" }));
      });

      await waitFor(() => {
        expect(screen.getByText("Access denied: Resume failed security verification.")).toBeInTheDocument();
      });
    });

    test("TEST 9: Existing 401 behavior remains unchanged", async () => {
      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/candidates")) {
          return Promise.reject(new APIError(401, "Not authenticated"));
        }
        return Promise.resolve([]);
      });

      render(<RecruiterCandidates />);

      await waitFor(() => {
        expect(screen.getByText("Not authenticated")).toBeInTheDocument();
      });
    });
  });

  // 6. Admin-only navigation visibility in Layout
  test("Admin-only navigation visibility standard vs admin", () => {
    // 1. As standard Recruiter
    mockUser = { id: "r1", email: "recruiter@company.com", role: "recruiter" };
    mockIsRecruiter = true;
    mockIsAdmin = false;

    const { rerender } = render(
      <RecruiterLayout>
        <div>Content</div>
      </RecruiterLayout>
    );

    // Standard recruiter should NOT see approvals nav link
    expect(screen.queryByText("Signup Approvals")).not.toBeInTheDocument();

    // 2. As admin Recruiter
    mockIsAdmin = true;
    rerender(
      <RecruiterLayout>
        <div>Content</div>
      </RecruiterLayout>
    );

    // Admin recruiter SHOULD see approvals nav link
    expect(screen.getByText("Signup Approvals")).toBeInTheDocument();
  });

  // 7. Standard Recruiter cannot access Admin-only UI
  test("Standard recruiter is redirected away from Approvals page", async () => {
    mockUser = { id: "r1", email: "recruiter@company.com", role: "recruiter" };
    mockIsRecruiter = true;
    mockIsAdmin = false;

    render(<RecruiterApprovals />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/recruiter/candidates");
    });
  });

  // 7b. Recruiter signup approvals queue tests
  describe("Recruiter signup approvals queue", () => {
    let originalAlert: typeof window.alert;
    let originalConfirm: typeof window.confirm;

    beforeEach(() => {
      mockUser = { id: "r1", email: "admin@company.com", role: "recruiter" };
      mockIsRecruiter = true;
      mockIsAdmin = true;

      originalAlert = window.alert;
      originalConfirm = window.confirm;
      window.alert = jest.fn();
      window.confirm = jest.fn().mockReturnValue(true);
    });

    afterEach(() => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
    });

    test("loads requests on mount and renders requested_at date correctly (no Invalid Date)", async () => {
      const mockReqs = [
        {
          id: "req-1",
          full_name: "John Doe",
          email: "john@test.com",
          mobile: "9876543210",
          status: "PENDING",
          requested_at: "2026-08-15T10:00:00Z"
        }
      ];

      (api.get as jest.Mock).mockResolvedValueOnce(mockReqs);

      render(<RecruiterApprovals />);

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      });
      expect(screen.getByText("john@test.com")).toBeInTheDocument();
      expect(screen.getByText("9876543210")).toBeInTheDocument();

      // Check requested_at is rendered and "Invalid Date" is not displayed
      const dateText = screen.getByText(/2026/); // should contain the year
      expect(dateText).toBeInTheDocument();
      expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();
    });

    test("Approve sends {} as the request body and updates UI", async () => {
      const mockReqs = [
        {
          id: "req-1",
          full_name: "John Doe",
          email: "john@test.com",
          mobile: "9876543210",
          status: "PENDING",
          requested_at: "2026-08-15T10:00:00Z"
        }
      ];

      (api.get as jest.Mock).mockResolvedValueOnce(mockReqs);
      (api.post as jest.Mock).mockResolvedValueOnce({});

      render(<RecruiterApprovals />);

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      });

      const approveBtn = screen.getByRole("button", { name: /Approve/i });
      await act(async () => {
        fireEvent.click(approveBtn);
      });

      expect(api.post).toHaveBeenCalledWith(
        "/api/v1/recruiter/recruiter-signup-requests/req-1/approve",
        {}
      );

      // Verify request is removed from document after approval
      await waitFor(() => {
        expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
      });
      expect(window.alert).toHaveBeenCalledWith("Recruiter request approved successfully.");
    });

    test("Reject sends {} as request body after confirm and updates UI", async () => {
      const mockReqs = [
        {
          id: "req-2",
          full_name: "Jane Smith",
          email: "jane@test.com",
          mobile: "9876543211",
          status: "PENDING",
          requested_at: "2026-08-15T10:00:00Z"
        }
      ];

      (api.get as jest.Mock).mockResolvedValueOnce(mockReqs);
      (api.post as jest.Mock).mockResolvedValueOnce({});

      render(<RecruiterApprovals />);

      await waitFor(() => {
        expect(screen.getByText("Jane Smith")).toBeInTheDocument();
      });

      const rejectBtn = screen.getByRole("button", { name: /Reject/i });
      await act(async () => {
        fireEvent.click(rejectBtn);
      });

      expect(window.confirm).toHaveBeenCalledWith("Are you sure you want to reject this signup request?");
      expect(api.post).toHaveBeenCalledWith(
        "/api/v1/recruiter/recruiter-signup-requests/req-2/reject",
        {}
      );

      // Verify request is removed from document after rejection
      await waitFor(() => {
        expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();
      });
      expect(window.alert).toHaveBeenCalledWith("Recruiter request rejected.");
    });

    test("handles API errors gracefully without crashing React", async () => {
      const mockReqs = [
        {
          id: "req-3",
          full_name: "Bob Jones",
          email: "bob@test.com",
          mobile: "9876543212",
          status: "PENDING",
          requested_at: "2026-08-15T10:00:00Z"
        }
      ];

      (api.get as jest.Mock).mockResolvedValueOnce(mockReqs);
      (api.post as jest.Mock).mockRejectedValueOnce({
        detail: "Validation failed: Field required"
      });

      render(<RecruiterApprovals />);

      await waitFor(() => {
        expect(screen.getByText("Bob Jones")).toBeInTheDocument();
      });

      const approveBtn = screen.getByRole("button", { name: /Approve/i });
      await act(async () => {
        fireEvent.click(approveBtn);
      });

      // Verify alert is triggered with error details, component survives
      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith("Validation failed: Field required");
      });
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });

  // 8. Logout/session clearing behavior
  test("Logout triggers session clearing", async () => {
    mockUser = { id: "v1", email: "vendor@company.com", role: "vendor" };
    mockLogout.mockResolvedValueOnce(undefined);

    const { logout } = useAuth();
    await logout();
    expect(mockLogout).toHaveBeenCalled();
  });

  // 9. Resume eligibility submit-button gate
  test("Resume eligibility submit button gate", async () => {
    mockUser = { id: "v1", email: "vendor@company.com", role: "vendor" };
    
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/departments")) {
        return Promise.resolve([{ id: "d1", name: "Engineering" }]);
      }
      if (url.includes("/vendor/active-roles")) {
        return Promise.resolve([{ id: "r1", title: "Dev" }]);
      }
      return Promise.resolve([]);
    });

    await act(async () => {
      render(<SubmitCandidate />);
    });

    // Since no resume has been uploaded yet, submit button should be disabled
    const submitBtn = screen.getByRole("button", { name: /Submit Candidate/i });
    expect(submitBtn).toBeDisabled();
  });

  // 10. Admin sees "Provision Vendor User" and can open the modal
  test("Admin sees Provision Vendor User action and can open modal", async () => {
    mockUser = { id: "r1", email: "admin@company.com", role: "recruiter" };
    mockIsRecruiter = true;
    mockIsAdmin = true;

    (api.get as jest.Mock).mockResolvedValueOnce([]); // empty list of vendor-users

    await act(async () => {
      render(<RecruiterVendorUsers />);
    });

    const btn = screen.getByRole("button", { name: /Provision Vendor User/i });
    expect(btn).toBeInTheDocument();

    // Click it to open modal
    fireEvent.click(btn);

    expect(screen.getByText(/Select Vendor Companies/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Representative Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mobile Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
  });

  // 11. Standard Recruiter does NOT see "Provision Vendor User"
  test("Standard recruiter does not see Provision Vendor User button", async () => {
    mockUser = { id: "r2", email: "recruiter@company.com", role: "recruiter" };
    mockIsRecruiter = true;
    mockIsAdmin = false;

    (api.get as jest.Mock).mockResolvedValueOnce([]);

    await act(async () => {
      render(<RecruiterVendorUsers />);
    });

    expect(screen.queryByRole("button", { name: /Provision Vendor User/i })).not.toBeInTheDocument();
  });

  // 12. Admin provisions vendor user successfully
  test("Admin provisioning flow success submits form and refreshes list", async () => {
    mockUser = { id: "r1", email: "admin@company.com", role: "recruiter" };
    mockIsRecruiter = true;
    mockIsAdmin = true;

    (api.get as jest.Mock)
      .mockResolvedValueOnce([]) // Initial load: empty
      .mockResolvedValueOnce([{ // After provisioning: updated list
        id: "vu-123",
        name: "John Representative",
        email: "rep@acme.com",
        mobile: "+919876543210",
        status: "ACTIVE",
        created_at: "2026-08-14T12:00:00Z"
      }]);

    (api.post as jest.Mock).mockResolvedValueOnce({
      id: "vu-123",
      name: "John Representative",
      email: "rep@acme.com",
      mobile: "+919876543210",
      status: "ACTIVE",
      created_at: "2026-08-14T12:00:00Z"
    });

    // Mock window.alert
    const originalAlert = window.alert;
    window.alert = jest.fn();

    await act(async () => {
      render(<RecruiterVendorUsers />);
    });

    // Open modal
    fireEvent.click(screen.getByRole("button", { name: /Provision Vendor User/i }));

    // Fill form
    fireEvent.change(screen.getByLabelText(/Representative Name/i), { target: { value: "John Representative" } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "rep@acme.com" } });
    fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543210" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "securepass123" } });

    // Submit
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/Representative Name/i).closest("form")!);
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/v1/recruiter/vendor-users", {
        companies: ["IOSYS"],
        name: "John Representative",
        email: "rep@acme.com",
        mobile: "+919876543210",
        password: "securepass123"
      });
    });

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith("Vendor user provisioned successfully.");
    });

    // Check modal closes (meaning input fields/modal is not visible or dialog is closed)
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();

    // Check list refreshed and contains the newly provisioned user
    expect(screen.getByText("John Representative")).toBeInTheDocument();
    expect(screen.getByText("rep@acme.com")).toBeInTheDocument();

    // Restore alert
    window.alert = originalAlert;
  });

  // 13. Provisioning flow displays validation / Backend conflict error
  test("Admin provisioning flow displays backend validation error", async () => {
    mockUser = { id: "r1", email: "admin@company.com", role: "recruiter" };
    mockIsRecruiter = true;
    mockIsAdmin = true;

    (api.get as jest.Mock).mockResolvedValueOnce([]);
    (api.post as jest.Mock).mockRejectedValueOnce({
      status: 409,
      detail: "Vendor user with this email already exists."
    });

    await act(async () => {
      render(<RecruiterVendorUsers />);
    });

    // Open modal
    fireEvent.click(screen.getByRole("button", { name: /Provision Vendor User/i }));

    // Fill form and submit
    fireEvent.change(screen.getByLabelText(/Representative Name/i), { target: { value: "John" } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "rep@acme.com" } });
    fireEvent.change(screen.getByLabelText(/Mobile Number/i), { target: { value: "+919876543210" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "pass" } });

    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/Representative Name/i).closest("form")!);
    });

    await waitFor(() => {
      expect(screen.getByText("Vendor user with this email already exists.")).toBeInTheDocument();
    });

    // Modal should remain open
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
  });

  // 14. Reactivate and Disable flow uses correct vendor user ID without state corruption
  test("Disable and Reactivate flows send correct user ID and update state locally", async () => {
    mockUser = { id: "r1", email: "admin@company.com", role: "recruiter" };
    mockIsRecruiter = true;
    mockIsAdmin = true;

    // Initial load returns a single active user
    const mockUserRecord = {
      id: "vu-864",
      vendor_id: "v-1",
      name: "John Representative",
      email: "rep@acme.com",
      mobile: "+919876543210",
      status: "ACTIVE",
      created_at: "2026-08-14T12:00:00Z"
    };

    (api.get as jest.Mock).mockResolvedValueOnce([mockUserRecord]);
    
    // Mock the confirm window function
    const originalConfirm = window.confirm;
    window.confirm = jest.fn().mockReturnValue(true);

    (api.post as jest.Mock)
      .mockResolvedValueOnce({ detail: "Vendor User disabled successfully." }) // disable response
      .mockResolvedValueOnce({ detail: "Vendor User reactivated successfully." }); // reactivate response

    await act(async () => {
      render(<RecruiterVendorUsers />);
    });

    // 1. Verify user is active and has "Disable" button
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    const disableBtn = screen.getByRole("button", { name: /Disable/i });
    expect(disableBtn).toBeInTheDocument();

    // 2. Click "Disable"
    await act(async () => {
      fireEvent.click(disableBtn);
    });

    // Verify API is called with correct user ID
    expect(api.post).toHaveBeenCalledWith("/api/v1/recruiter/vendor-users/vu-864/disable");
    
    // Verify state updates locally to DISABLED and button changes to "Reactivate"
    await waitFor(() => {
      expect(screen.getByText("DISABLED")).toBeInTheDocument();
      expect(screen.queryByText("ACTIVE")).not.toBeInTheDocument();
    });

    const reactivateBtn = screen.getByRole("button", { name: /Reactivate/i });
    expect(reactivateBtn).toBeInTheDocument();

    // 3. Click "Reactivate"
    await act(async () => {
      fireEvent.click(reactivateBtn);
    });

    // Verify API is called with correct user ID (no undefined)
    expect(api.post).toHaveBeenCalledWith("/api/v1/recruiter/vendor-users/vu-864/reactivate");
    
    // Verify state updates locally back to ACTIVE and button reverts to "Disable"
    await waitFor(() => {
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      expect(screen.queryByText("DISABLED")).not.toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Disable/i })).toBeInTheDocument();

    // Restore window confirm
    window.confirm = originalConfirm;
  });

  // 15. Candidate Detail rendering tests for CV Sent Date and Notice Period formatting
  test("Candidate Detail page displays CV Sent Date and formats Notice Period correctly", async () => {
    mockUser = { id: "r1", email: "admin@company.com", role: "recruiter" };
    mockIsRecruiter = true;
    mockIsAdmin = true;

    const mockDetail = {
      id: "c1",
      status: "SCREENING",
      cv_sent_date: "2026-08-14",
      employment_mode: "Perm",
      created_at: "2026-08-14T12:00:00Z",
      role: { id: "r-1", title: "Software Engineer", status: "ACTIVE" },
      vendor_name: "Consultancy A",
      resume_id: "res-1",
      candidate: {
        id: "cand-1",
        name: "Bob Builder",
        email: "bob@builder.com",
        contact_number: "+919876543211",
        current_company: "BuildCorp",
        total_experience: "5.50",
        relevant_experience: "4.00",
        notice_period: "Immediate",
        ctc: "12.00",
        ectc: "15.00",
        current_location: "Bangalore",
        preferred_location: "Bangalore",
        pan_masked: "******1234",
        linkedin_url: "https://linkedin.com/in/bob",
        education: "B.Tech",
        about: "Expert builder.",
        created_at: "2026-08-14T12:00:00Z"
      }
    };

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/history")) {
        return Promise.resolve([]);
      }
      if (url.includes("/submissions/")) {
        return Promise.resolve(mockDetail);
      }
      return Promise.resolve([]);
    });

    // 1. Render with Notice Period "Immediate"
    await act(async () => {
      render(<CandidateDetail />);
    });

    // Verify CV Sent Date is displayed in submission details block
    expect(screen.getByText("CV Sent Date:")).toBeInTheDocument();
    expect(screen.getByText("2026-08-14")).toBeInTheDocument();

    // Verify Notice Period is displayed as "Immediate" and does NOT contain "Immediate Days"
    expect(screen.getByText("Immediate")).toBeInTheDocument();
    expect(screen.queryByText("Immediate Days")).not.toBeInTheDocument();
  });

  test("Candidate Detail page formats numeric Notice Period with Days suffix", async () => {
    mockUser = { id: "r1", email: "admin@company.com", role: "recruiter" };
    mockIsRecruiter = true;
    mockIsAdmin = true;

    const mockDetail30 = {
      id: "c1",
      status: "SCREENING",
      cv_sent_date: "2026-08-14",
      employment_mode: "Perm",
      created_at: "2026-08-14T12:00:00Z",
      role: { id: "r-1", title: "Software Engineer", status: "ACTIVE" },
      vendor_name: "Consultancy A",
      resume_id: "res-1",
      candidate: {
        id: "cand-1",
        name: "Bob Builder",
        email: "bob@builder.com",
        contact_number: "+919876543211",
        current_company: "BuildCorp",
        total_experience: "5.50",
        relevant_experience: "4.00",
        notice_period: "30",
        ctc: "12.00",
        ectc: "15.00",
        current_location: "Bangalore",
        preferred_location: "Bangalore",
        pan_masked: "******1234",
        linkedin_url: "https://linkedin.com/in/bob",
        education: "B.Tech",
        about: "Expert builder.",
        created_at: "2026-08-14T12:00:00Z"
      }
    };

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/history")) {
        return Promise.resolve([]);
      }
      if (url.includes("/submissions/")) {
        return Promise.resolve(mockDetail30);
      }
      return Promise.resolve([]);
    });

    await act(async () => {
      render(<CandidateDetail />);
    });

    // Verify Notice Period is displayed with "Days" suffix for numeric value
    expect(screen.getByText("30 Days")).toBeInTheDocument();
  });

  // 16. Forgot Password flow tests
  describe("Forgot Password Flow", () => {
    test("renders Forgot Password page components correctly", () => {
      render(<ForgotPassword />);
      expect(screen.getByText("Reset Password")).toBeInTheDocument();
      expect(screen.getByText("Enter your email to receive a password reset link")).toBeInTheDocument();
      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Send Reset Link/i })).toBeInTheDocument();
    });

    test("submits forgot password form and displays generic success message", async () => {
      (api.post as jest.Mock).mockResolvedValueOnce({
        detail: "If the email address is registered, a password reset link has been sent."
      });

      render(<ForgotPassword />);

      const emailInput = screen.getByLabelText(/Email Address/i);
      fireEvent.change(emailInput, { target: { value: "test@company.com" } });

      fireEvent.click(screen.getByRole("button", { name: /Send Reset Link/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/auth/forgot-password",
          { email: "test@company.com" },
          { skipAuth: true }
        );
      });

      await waitFor(() => {
        expect(screen.getByText("If the email address is registered, a password reset link has been sent.")).toBeInTheDocument();
        expect(screen.getByText("Go to Recruiter Login")).toBeInTheDocument();
        expect(screen.getByText("Go to Vendor Login")).toBeInTheDocument();
      });
    });
  });

  // 17. Reset Password flow tests
  describe("Reset Password Flow", () => {
    beforeEach(() => {
      mockToken = null;
      mockPush.mockClear();
    });

    test("renders error when token is missing", () => {
      mockToken = null;
      render(<ResetPassword />);
      expect(screen.getByText("Invalid or missing reset token.")).toBeInTheDocument();
      expect(screen.queryByLabelText(/^New Password$/i)).not.toBeInTheDocument();
    });

    test("renders form inputs when token is present", () => {
      mockToken = "valid-test-token";
      render(<ResetPassword />);
      expect(screen.getByLabelText(/^New Password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Confirm New Password$/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Reset Password/i })).toBeInTheDocument();
    });

    test("validates password length (8-50 characters)", async () => {
      mockToken = "valid-test-token";
      render(<ResetPassword />);

      const passwordInput = screen.getByLabelText(/^New Password$/i);
      const confirmInput = screen.getByLabelText(/^Confirm New Password$/i);
      const submitButton = screen.getByRole("button", { name: /Reset Password/i });

      // Short password
      fireEvent.change(passwordInput, { target: { value: "1234567" } });
      fireEvent.change(confirmInput, { target: { value: "1234567" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Password must be between 8 and 50 characters.")).toBeInTheDocument();
      });
    });

    test("validates password mismatch", async () => {
      mockToken = "valid-test-token";
      render(<ResetPassword />);

      const passwordInput = screen.getByLabelText(/^New Password$/i);
      const confirmInput = screen.getByLabelText(/^Confirm New Password$/i);
      const submitButton = screen.getByRole("button", { name: /Reset Password/i });

      fireEvent.change(passwordInput, { target: { value: "securePassword123" } });
      fireEvent.change(confirmInput, { target: { value: "differentPassword123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
      });
    });

    test("handles API errors (invalid or expired token)", async () => {
      mockToken = "expired-token";
      (api.post as jest.Mock).mockRejectedValueOnce({
        status: 400,
        detail: "Invalid or expired reset token."
      });

      render(<ResetPassword />);

      fireEvent.change(screen.getByLabelText(/^New Password$/i), { target: { value: "securePassword123" } });
      fireEvent.change(screen.getByLabelText(/^Confirm New Password$/i), { target: { value: "securePassword123" } });
      fireEvent.click(screen.getByRole("button", { name: /Reset Password/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/auth/reset-password",
          {
            token: "expired-token",
            password: "securePassword123",
            confirm_password: "securePassword123"
          },
          { skipAuth: true }
        );
      });

      await waitFor(() => {
        expect(screen.getByText("Invalid or expired reset token.")).toBeInTheDocument();
      });
    });

    test("submits form successfully and offers navigation", async () => {
      mockToken = "valid-token";
      (api.post as jest.Mock).mockResolvedValueOnce({
        detail: "Password has been reset successfully."
      });

      render(<ResetPassword />);

      fireEvent.change(screen.getByLabelText(/^New Password$/i), { target: { value: "securePassword123" } });
      fireEvent.change(screen.getByLabelText(/^Confirm New Password$/i), { target: { value: "securePassword123" } });
      fireEvent.click(screen.getByRole("button", { name: /Reset Password/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/api/v1/auth/reset-password",
          {
            token: "valid-token",
            password: "securePassword123",
            confirm_password: "securePassword123"
          },
          { skipAuth: true }
        );
      });

      await waitFor(() => {
        expect(screen.getByText("Password has been reset successfully.")).toBeInTheDocument();
        expect(screen.getByText("Go to Recruiter Login")).toBeInTheDocument();
        expect(screen.getByText("Go to Vendor Login")).toBeInTheDocument();
      });
    });
  });

  // 18. API Client and Candidate Submission Error Handling Tests
  describe("API Client Error Handling and Candidate Submission", () => {
    let originalFetch: typeof global.fetch;
    const { api: actualApi } = jest.requireActual("../lib/api-client");

    beforeAll(() => {
      originalFetch = global.fetch;
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    test("TEST 1: A normal string API error is converted correctly", async () => {
      const mockResponse = {
        status: 400,
        ok: false,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null)
        },
        json: () => Promise.resolve({ detail: "Candidate already exists." }),
        blob: () => Promise.resolve({})
      };
      global.fetch = jest.fn().mockResolvedValueOnce(mockResponse);

      await expect(actualApi.post("/test-endpoint", {}, { skipAuth: true })).rejects.toThrow(
        expect.objectContaining({
          status: 400,
          detail: "Candidate already exists."
        })
      );
    });

    test("TEST 2: A FastAPI/Pydantic detail array is converted into a readable string", async () => {
      const mockResponse = {
        status: 422,
        ok: false,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null)
        },
        json: () => Promise.resolve({
          detail: [
            {
              type: "value_error",
              loc: ["body", "contact_number"],
              msg: "Value error, Invalid Indian mobile number.",
              input: "12345",
              ctx: {}
            }
          ]
        }),
        blob: () => Promise.resolve({})
      };
      global.fetch = jest.fn().mockResolvedValueOnce(mockResponse);

      await expect(actualApi.post("/test-endpoint", {}, { skipAuth: true })).rejects.toThrow(
        expect.objectContaining({
          status: 422,
          detail: "Contact Number: Invalid Indian mobile number."
        })
      );
    });

    test("TEST 3: Multiple validation errors are converted safely", async () => {
      const mockResponse = {
        status: 422,
        ok: false,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null)
        },
        json: () => Promise.resolve({
          detail: [
            { msg: "Invalid Indian mobile number." },
            { msg: "Value error, Invalid PAN." }
          ]
        }),
        blob: () => Promise.resolve({})
      };
      global.fetch = jest.fn().mockResolvedValueOnce(mockResponse);

      await expect(actualApi.post("/test-endpoint", {}, { skipAuth: true })).rejects.toThrow(
        expect.objectContaining({
          status: 422,
          detail: "Invalid Indian mobile number.\nInvalid PAN."
        })
      );
    });

    test("TEST 4: An object detail does not reach React as a raw object", async () => {
      const mockResponse = {
        status: 400,
        ok: false,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null)
        },
        json: () => Promise.resolve({
          detail: { message: "Something went wrong", code: "validation_error" }
        }),
        blob: () => Promise.resolve({})
      };
      global.fetch = jest.fn().mockResolvedValueOnce(mockResponse);

      await expect(actualApi.post("/test-endpoint", {}, { skipAuth: true })).rejects.toThrow(
        expect.objectContaining({
          status: 400,
          detail: "Something went wrong"
        })
      );
    });

    test("TEST 5: Unexpected/missing detail gets the HTTP-status fallback", async () => {
      const mockResponse = {
        status: 500,
        ok: false,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null)
        },
        json: () => Promise.resolve({}),
        blob: () => Promise.resolve({})
      };
      global.fetch = jest.fn().mockResolvedValueOnce(mockResponse);

      await expect(actualApi.post("/test-endpoint", {}, { skipAuth: true })).rejects.toThrow(
        expect.objectContaining({
          status: 500,
          detail: "Request failed with status 500"
        })
      );
    });

    test("TEST 6: Vendor candidate submission with an invalid contact_number displays a readable validation error and DOES NOT crash React", async () => {
      mockUser = { id: "v1", email: "vendor@company.com", role: "vendor" };

      // Mock lookups & resume state
      (api.get as jest.Mock).mockImplementation((url: string) => {
        console.log("MOCK api.get CALLED WITH:", url);
        if (url.includes("/departments")) {
          return Promise.resolve([{ id: "d1", name: "Engineering", status: "ACTIVE" }]);
        }
        if (url.includes("/job-roles")) {
          const res = [{ id: "r1", department_id: "d1", title: "Dev", job_id: "JOB-DEV-01", status: "ACTIVE" }];
          console.log("MOCK api.get RETURNING FOR /job-roles:", res);
          return Promise.resolve(res);
        }
        if (url.includes("/resumes/res-1/status")) {
          return Promise.resolve({
            malware_scan_state: "CLEAN",
            processing_state: "COMPLETED",
            eligibility_state: "ELIGIBLE"
          });
        }
        return Promise.resolve([]);
      });

      // Mock resume upload POST and submission POST
      (api.post as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/resumes")) {
          return Promise.resolve({ resume_id: "res-1" });
        }
        if (url.includes("/submissions")) {
          return Promise.reject(new APIError(422, "Value error, Invalid Indian mobile number."));
        }
        return Promise.resolve({});
      });

      const { container } = render(<SubmitCandidate />);

      // Wait for department options to be populated
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Engineering" })).toBeInTheDocument();
      });

      // 1. Select department
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Target Department/i), { target: { value: "d1" } });
      });

      // Wait for role select to be populated
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Dev" })).toBeInTheDocument();
      });

      // Select role
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Target Job Role/i), { target: { value: "r1" } });
      });

      // Fill in text fields
      fireEvent.change(screen.getByLabelText(/Job ID/i), { target: { value: "JOB-TEST-1" } });
      fireEvent.change(screen.getByLabelText(/Candidate Full Name/i), { target: { value: "Bob" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "bob@builder.com" } });
      fireEvent.change(screen.getByLabelText(/Contact Number/i), { target: { value: "12345" } });
      fireEvent.change(screen.getByLabelText(/Current Company/i), { target: { value: "BuildCorp" } });
      fireEvent.change(screen.getByLabelText(/Total Experience/i), { target: { value: "5" } });
      fireEvent.change(screen.getByLabelText(/Relevant Experience/i), { target: { value: "3" } });
      fireEvent.change(screen.getByLabelText(/^CTC/i), { target: { value: "10" } });
      fireEvent.change(screen.getByLabelText(/Expected CTC/i), { target: { value: "12" } });
      fireEvent.change(screen.getByLabelText(/Current Location/i), { target: { value: "Delhi" } });
      fireEvent.change(screen.getByLabelText(/Preferred Location/i), { target: { value: "Delhi" } });
      fireEvent.change(screen.getByLabelText(/PAN Card Number/i), { target: { value: "ABCDE1234F" } });
      fireEvent.change(screen.getByLabelText(/LinkedIn Profile URL/i), { target: { value: "https://linkedin.com/in/bob" } });
      fireEvent.change(screen.getByLabelText(/Education details/i), { target: { value: "B.Tech" } });
      fireEvent.change(screen.getByPlaceholderText(/Provide a brief summary/i), { target: { value: "Good builder." } });

      // 2. Upload file
      const file = new File(["dummy content"], "resume.pdf", { type: "application/pdf" });
      const fileInput = container.querySelector('input[type="file"]')!;
      
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      // Wait for scanning polling to complete and mark as eligible
      await waitFor(() => {
        expect(screen.getByText("Resume verified and eligible for submission!")).toBeInTheDocument();
      }, { timeout: 4000 });

      // Submit form
      const submitBtn = screen.getByRole("button", { name: /Submit Candidate/i });
      expect(submitBtn).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // Verify validation error is displayed and React didn't crash
      await waitFor(() => {
        expect(screen.getByText("Value error, Invalid Indian mobile number.")).toBeInTheDocument();
      });
    });

    test("TEST 7: Existing successful candidate submission behavior remains unchanged", async () => {
      mockUser = { id: "v1", email: "vendor@company.com", role: "vendor" };

      // Mock lookups & resume state
      (api.get as jest.Mock).mockImplementation((url: string) => {
        console.log("MOCK api.get CALLED WITH:", url);
        if (url.includes("/departments")) {
          return Promise.resolve([{ id: "d1", name: "Engineering", status: "ACTIVE" }]);
        }
        if (url.includes("/job-roles")) {
          const res = [{ id: "r1", department_id: "d1", title: "Dev", job_id: "JOB-DEV-01", status: "ACTIVE" }];
          console.log("MOCK api.get RETURNING FOR /job-roles:", res);
          return Promise.resolve(res);
        }
        if (url.includes("/resumes/res-1/status")) {
          return Promise.resolve({
            malware_scan_state: "CLEAN",
            processing_state: "COMPLETED",
            eligibility_state: "ELIGIBLE"
          });
        }
        return Promise.resolve([]);
      });

      // Mock successful submission POST
      (api.post as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/resumes")) {
          return Promise.resolve({ resume_id: "res-1" });
        }
        if (url.includes("/submissions")) {
          return Promise.resolve({ id: "sub-1" });
        }
        return Promise.resolve({});
      });

      const { container } = render(<SubmitCandidate />);

      // Wait for department options to be populated
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Engineering" })).toBeInTheDocument();
      });

      // 1. Select department
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Target Department/i), { target: { value: "d1" } });
      });

      // Wait for role select to be populated
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Dev" })).toBeInTheDocument();
      });

      // Select role
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Target Job Role/i), { target: { value: "r1" } });
      });

      // Fill in text fields
      fireEvent.change(screen.getByLabelText(/Job ID/i), { target: { value: "JOB-TEST-1" } });
      fireEvent.change(screen.getByLabelText(/Candidate Full Name/i), { target: { value: "Bob" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "bob@builder.com" } });
      fireEvent.change(screen.getByLabelText(/Contact Number/i), { target: { value: "+919876543211" } });
      fireEvent.change(screen.getByLabelText(/Current Company/i), { target: { value: "BuildCorp" } });
      fireEvent.change(screen.getByLabelText(/Total Experience/i), { target: { value: "5" } });
      fireEvent.change(screen.getByLabelText(/Relevant Experience/i), { target: { value: "3" } });
      fireEvent.change(screen.getByLabelText(/^CTC/i), { target: { value: "10" } });
      fireEvent.change(screen.getByLabelText(/Expected CTC/i), { target: { value: "12" } });
      fireEvent.change(screen.getByLabelText(/Current Location/i), { target: { value: "Delhi" } });
      fireEvent.change(screen.getByLabelText(/Preferred Location/i), { target: { value: "Delhi" } });
      fireEvent.change(screen.getByLabelText(/PAN Card Number/i), { target: { value: "ABCDE1234F" } });
      fireEvent.change(screen.getByLabelText(/LinkedIn Profile URL/i), { target: { value: "https://linkedin.com/in/bob" } });
      fireEvent.change(screen.getByLabelText(/Education details/i), { target: { value: "B.Tech" } });
      fireEvent.change(screen.getByPlaceholderText(/Provide a brief summary/i), { target: { value: "Good builder." } });

      // 2. Upload file
      const file = new File(["dummy content"], "resume.pdf", { type: "application/pdf" });
      const fileInput = container.querySelector('input[type="file"]')!;
      
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      // Wait for scanning polling to complete and mark as eligible
      await waitFor(() => {
        expect(screen.getByText("Resume verified and eligible for submission!")).toBeInTheDocument();
      }, { timeout: 4000 });

      // Submit form
      const submitBtn = screen.getByRole("button", { name: /Submit Candidate/i });
      expect(submitBtn).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // Verify successful submission message
      await waitFor(() => {
        expect(screen.getByText("Candidate submitted successfully! Redirecting to dashboard...")).toBeInTheDocument();
      });
    });
  });

  describe("VMS Frontend Global field-aware API validation error handling", () => {
    test("TEST 1: PAN string_too_short error mapping", () => {
      const errorObj = {
        type: "string_too_short",
        loc: ["body", "pan"],
        msg: "String should have at least 10 characters",
        input: "ABCD1234F",
        ctx: { min_length: 10 }
      };
      const formatted = formatValidationErrorItem(errorObj);
      expect(formatted.fieldKey).toBe("pan");
      expect(formatted.message).toBe("PAN Card: Must contain at least 10 characters.");
    });

    test("TEST 2: Missing required field error mapping", () => {
      const errorObj = {
        type: "missing",
        loc: ["body", "contact_number"],
        msg: "Field required"
      };
      const formatted = formatValidationErrorItem(errorObj);
      expect(formatted.fieldKey).toBe("contact_number");
      expect(formatted.message).toBe("Contact Number: This field is required.");
    });

    test("TEST 3: Multiple validation errors joined by newlines", () => {
      const errors = [
        {
          type: "string_too_short",
          loc: ["body", "pan"],
          msg: "String should have at least 10 characters",
          ctx: { min_length: 10 }
        },
        {
          type: "missing",
          loc: ["body", "contact_number"],
          msg: "Field required"
        }
      ];
      const formattedDetail = formatDetailError(errors);
      expect(formattedDetail).toBe(
        "PAN Card: Must contain at least 10 characters.\nContact Number: This field is required."
      );
    });

    test("TEST 4: string_too_long error mapping", () => {
      const errorObj = {
        type: "string_too_long",
        loc: ["body", "about"],
        msg: "String should have at most 100 characters",
        ctx: { max_length: 100 }
      };
      const formatted = formatValidationErrorItem(errorObj);
      expect(formatted.fieldKey).toBe("about");
      expect(formatted.message).toBe("About the Candidate: Must contain at most 100 characters.");
    });

    test("TEST 5: Numeric constraint (greater_than_equal) error mapping", () => {
      const errorObj = {
        type: "greater_than_equal",
        loc: ["body", "total_experience"],
        msg: "Input should be greater than or equal to 0",
        ctx: { ge: 0 }
      };
      const formatted = formatValidationErrorItem(errorObj);
      expect(formatted.fieldKey).toBe("total_experience");
      expect(formatted.message).toBe("Total Experience: Must be greater than or equal to 0.");
    });

    test("TEST 6: Pattern mismatch (string_pattern_mismatch) error mapping", () => {
      const errorObj = {
        type: "string_pattern_mismatch",
        loc: ["body", "pan"],
        msg: "String should match pattern"
      };
      const formatted = formatValidationErrorItem(errorObj);
      expect(formatted.fieldKey).toBe("pan");
      expect(formatted.message).toBe("PAN Card: Must match the required format.");
    });

    test("TEST 7: Unknown/unexpected validation error type falls back safely", () => {
      const errorObj = {
        type: "some_weird_unknown_validation",
        loc: ["body", "email"],
        msg: "Custom bad format error occurred"
      };
      const formatted = formatValidationErrorItem(errorObj);
      expect(formatted.fieldKey).toBe("email");
      expect(formatted.message).toBe("Email ID: Custom bad format error occurred");
    });

    test("TEST 8: Nested field location path parsing", () => {
      const errorObj = {
        type: "missing",
        loc: ["body", "nested", "candidate", "total_experience"],
        msg: "Field required"
      };
      const formatted = formatValidationErrorItem(errorObj);
      expect(formatted.fieldKey).toBe("total_experience");
      expect(formatted.message).toBe("Total Experience: This field is required.");
    });

    test("TEST 9: Existing normal string API error remains compatible", () => {
      const detail = "Not authenticated";
      const formatted = formatDetailError(detail);
      expect(formatted).toBe("Not authenticated");
    });

    test("TEST 10: Integration with SubmitCandidate form: renders errors next to corresponding inputs & top-level alert", async () => {
      mockUser = { id: "v1", email: "vendor@company.com", role: "vendor" };

      // Mock lookups & status
      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/departments")) {
          return Promise.resolve([{ id: "d1", name: "Engineering", status: "ACTIVE" }]);
        }
        if (url.includes("/job-roles")) {
          return Promise.resolve([{ id: "r1", department_id: "d1", title: "Dev", job_id: "JOB-DEV-01", status: "ACTIVE" }]);
        }
        if (url.includes("/resumes/res-1/status")) {
          return Promise.resolve({
            malware_scan_state: "CLEAN",
            processing_state: "COMPLETED",
            eligibility_state: "ELIGIBLE"
          });
        }
        return Promise.resolve([]);
      });

      // Reject form submission with structured field validation errors
      (api.post as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/resumes")) {
          return Promise.resolve({ resume_id: "res-1" });
        }
        if (url.includes("/submissions")) {
          const err = new APIError(422, "Please correct the highlighted fields before submitting.", {
            pan: "PAN Card: Must contain at least 10 characters.",
            contact_number: "Contact Number: This field is required."
          });
          return Promise.reject(err);
        }
        return Promise.resolve({});
      });

      const { container } = render(<SubmitCandidate />);

      // Populate selects
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Engineering" })).toBeInTheDocument();
      });
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Target Department/i), { target: { value: "d1" } });
      });
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Dev" })).toBeInTheDocument();
      });
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Target Job Role/i), { target: { value: "r1" } });
      });

      // Fill valid strings to pass local validation checks
      fireEvent.change(screen.getByLabelText(/Job ID/i), { target: { value: "JOB-TEST-1" } });
      fireEvent.change(screen.getByLabelText(/Candidate Full Name/i), { target: { value: "Bob" } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "bob@builder.com" } });
      fireEvent.change(screen.getByLabelText(/Contact Number/i), { target: { value: "12345" } });
      fireEvent.change(screen.getByLabelText(/Current Company/i), { target: { value: "BuildCorp" } });
      fireEvent.change(screen.getByLabelText(/Total Experience/i), { target: { value: "5" } });
      fireEvent.change(screen.getByLabelText(/Relevant Experience/i), { target: { value: "3" } });
      fireEvent.change(screen.getByLabelText(/^CTC/i), { target: { value: "10" } });
      fireEvent.change(screen.getByLabelText(/Expected CTC/i), { target: { value: "12" } });
      fireEvent.change(screen.getByLabelText(/Current Location/i), { target: { value: "Delhi" } });
      fireEvent.change(screen.getByLabelText(/Preferred Location/i), { target: { value: "Delhi" } });
      fireEvent.change(screen.getByLabelText(/PAN Card Number/i), { target: { value: "ABC" } }); // will fail
      fireEvent.change(screen.getByLabelText(/LinkedIn Profile URL/i), { target: { value: "https://linkedin.com/in/bob" } });
      fireEvent.change(screen.getByLabelText(/Education details/i), { target: { value: "B.Tech" } });
      fireEvent.change(screen.getByPlaceholderText(/Provide a brief summary/i), { target: { value: "Good builder." } });

      // Upload file
      const file = new File(["dummy content"], "resume.pdf", { type: "application/pdf" });
      const fileInput = container.querySelector('input[type="file"]')!;
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });
      await waitFor(() => {
        expect(screen.getByText("Resume verified and eligible for submission!")).toBeInTheDocument();
      }, { timeout: 4000 });

      // Submit
      const submitBtn = screen.getByRole("button", { name: /Submit Candidate/i });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // Assert top-level error
      await waitFor(() => {
        expect(screen.getByText("Please correct the highlighted fields before submitting.")).toBeInTheDocument();
      });

      // Assert field-specific messages next to inputs
      expect(screen.getByText("PAN Card: Must contain at least 10 characters.")).toBeInTheDocument();
      expect(screen.getByText("Contact Number: This field is required.")).toBeInTheDocument();
    });
  });

  describe("Job Role Management tests", () => {
    let originalConfirm: typeof window.confirm;
    let originalAlert: typeof window.alert;

    beforeEach(() => {
      mockUser = { id: "r1", email: "recruiter@company.com", role: "recruiter" };
      mockIsRecruiter = true;
      mockIsAdmin = true;

      originalConfirm = window.confirm;
      originalAlert = window.alert;
      window.confirm = jest.fn().mockReturnValue(true);
      window.alert = jest.fn();
    });

    afterEach(() => {
      window.confirm = originalConfirm;
      window.alert = originalAlert;
    });

    test("renders job roles list correctly with stable unique IDs", async () => {
      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/departments")) {
          return Promise.resolve([
            { id: "dept-1", name: "Engineering", status: "ACTIVE" }
          ]);
        }
        if (url.includes("/job-roles")) {
          return Promise.resolve([
            {
              id: "role-1",
              department_id: "dept-1",
              title: "Senior Engineer",
              status: "ACTIVE",
              created_at: "2026-08-15T12:00:00Z"
            }
          ]);
        }
        return Promise.resolve([]);
      });

      render(<JobRoleManagement />);

      await waitFor(() => {
        expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
      });

      expect(screen.getByText("Engineering")).toBeInTheDocument();
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      expect(screen.queryByText("Unknown Department")).not.toBeInTheDocument();
      expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
    });

    test("deactivating updates local state correctly to CLOSED status without key warnings or malformed rows", async () => {
      const mockRoles = [
        {
          id: "role-1",
          department_id: "dept-1",
          title: "Senior Engineer",
          status: "ACTIVE",
          created_at: "2026-08-15T12:00:00Z"
        }
      ];

      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/departments")) {
          return Promise.resolve([{ id: "dept-1", name: "Engineering", status: "ACTIVE" }]);
        }
        if (url.includes("/job-roles")) {
          return Promise.resolve(mockRoles);
        }
        return Promise.resolve([]);
      });

      (api.post as jest.Mock).mockResolvedValueOnce({
        detail: "Job role Senior Engineer deactivated (CLOSED)."
      });

      render(<JobRoleManagement />);

      await waitFor(() => {
        expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
      });

      const deactivateBtn = screen.getByRole("button", { name: "Deactivate" });
      await act(async () => {
        fireEvent.click(deactivateBtn);
      });

      // Assert status updated to CLOSED
      await waitFor(() => {
        expect(screen.getByText("CLOSED")).toBeInTheDocument();
      });

      // Verify that no malformed row appeared
      expect(screen.queryByText("Unknown Department")).not.toBeInTheDocument();
      expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
      // "Reactivate" button should now be visible instead of "Deactivate"
      expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    });

    test("reactivating updates local state correctly to ACTIVE status", async () => {
      const mockRoles = [
        {
          id: "role-1",
          department_id: "dept-1",
          title: "Senior Engineer",
          status: "CLOSED",
          created_at: "2026-08-15T12:00:00Z"
        }
      ];

      (api.get as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/departments")) {
          return Promise.resolve([{ id: "dept-1", name: "Engineering", status: "ACTIVE" }]);
        }
        if (url.includes("/job-roles")) {
          return Promise.resolve(mockRoles);
        }
        return Promise.resolve([]);
      });

      (api.post as jest.Mock).mockResolvedValueOnce({
        detail: "Job role Senior Engineer reactivated successfully."
      });

      render(<JobRoleManagement />);

      await waitFor(() => {
        expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
      });

      const reactivateBtn = screen.getByRole("button", { name: "Reactivate" });
      await act(async () => {
        fireEvent.click(reactivateBtn);
      });

      // Assert status updated to ACTIVE
      await waitFor(() => {
        expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    });
  });
});
