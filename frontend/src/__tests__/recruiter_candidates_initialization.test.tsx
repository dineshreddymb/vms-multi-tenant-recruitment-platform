import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CandidatesDashboard from "@/app/recruiter/candidates/page";
import { api } from "@/lib/api-client";

// Mock router
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock API Client
jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockUser: any = null;
let mockLoading = true;

// Mock Auth Context
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: mockLoading,
    logout: jest.fn(),
    isVendor: false,
    isRecruiter: true,
  }),
}));

describe("Recruiter Candidates Page Initialization Lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockUser = null;
    mockLoading = true;
  });

  test("1 & 2. fetchCandidates does NOT execute with vendorId === '' during initial page loading, and initial selection happens before API request", async () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/job-roles")) return Promise.resolve([]);
      if (url.includes("/candidates")) {
        return Promise.resolve({ items: [], total_items: 0, page: 1, page_size: 10, total_pages: 0 });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    // 1. Render while Auth is loading (user is null, loading is true)
    const { rerender } = render(<CandidatesDashboard />);

    // Expect NO API request to /candidates is sent yet
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining("/candidates"));

    // 2. Auth finishes loading, user is resolved with companies
    mockLoading = false;
    mockUser = {
      id: "r1",
      email: "recruiter@corp.com",
      role: "RECRUITER",
      companies: [
        { id: "m1", vendor_id: "iosys-id", company_name: "IOSYS", status: "ACTIVE" },
        { id: "m2", vendor_id: "volantis-id", company_name: "Volantis", status: "ACTIVE" }
      ]
    };

    // Re-render to propagate context change
    rerender(<CandidatesDashboard />);

    // Now, candidates are fetched WITH the first company ID
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("/recruiter/candidates?page=1&page_size=10&sort_by=submission_date&sort_order=desc&vendor_id=iosys-id")
      );
    });

    // No request without vendor_id was ever generated
    const calls = (api.get as jest.Mock).mock.calls;
    const candidatesCalls = calls.filter((call) => call[0].includes("/candidates"));
    candidatesCalls.forEach((call) => {
      expect(call[0]).toContain("vendor_id=iosys-id");
    });
  });

  test("3 & 6. Refresh with IOSYS selected (or default) sends vendor_id for IOSYS and no specific company context error appears", async () => {
    sessionStorage.setItem("vms_recruiter_selected_company_id", "iosys-id");
    mockLoading = false;
    mockUser = {
      id: "r1",
      email: "recruiter@corp.com",
      role: "RECRUITER",
      companies: [
        { id: "m1", vendor_id: "iosys-id", company_name: "IOSYS", status: "ACTIVE" },
        { id: "m2", vendor_id: "volantis-id", company_name: "Volantis", status: "ACTIVE" }
      ]
    };

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/job-roles")) return Promise.resolve([]);
      if (url.includes("/candidates")) {
        return Promise.resolve({ items: [], total_items: 0, page: 1, page_size: 10, total_pages: 0 });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<CandidatesDashboard />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("vendor_id=iosys-id")
      );
    });

    // The error alert must NOT be present
    expect(screen.queryByText(/Please select a specific company context/i)).not.toBeInTheDocument();
  });

  test("4. Refresh with Volantis selected sends vendor_id for Volantis", async () => {
    // Simulate Volantis having been selected previously
    sessionStorage.setItem("vms_recruiter_selected_company_id", "volantis-id");
    mockLoading = false;
    mockUser = {
      id: "r1",
      email: "recruiter@corp.com",
      role: "RECRUITER",
      companies: [
        { id: "m1", vendor_id: "iosys-id", company_name: "IOSYS", status: "ACTIVE" },
        { id: "m2", vendor_id: "volantis-id", company_name: "Volantis", status: "ACTIVE" }
      ]
    };

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/job-roles")) return Promise.resolve([]);
      if (url.includes("/candidates")) {
        return Promise.resolve({ items: [], total_items: 0, page: 1, page_size: 10, total_pages: 0 });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<CandidatesDashboard />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("vendor_id=volantis-id")
      );
    });
  });

  test("5. Switching company sends the correct vendor_id", async () => {
    mockLoading = false;
    mockUser = {
      id: "r1",
      email: "recruiter@corp.com",
      role: "RECRUITER",
      companies: [
        { id: "m1", vendor_id: "iosys-id", company_name: "IOSYS", status: "ACTIVE" },
        { id: "m2", vendor_id: "volantis-id", company_name: "Volantis", status: "ACTIVE" }
      ]
    };

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/job-roles")) return Promise.resolve([]);
      if (url.includes("/candidates")) {
        return Promise.resolve({ items: [], total_items: 0, page: 1, page_size: 10, total_pages: 0 });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<CandidatesDashboard />);

    // Wait for initial fetch
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("vendor_id=iosys-id")
      );
    });

    // Change company selection to Volantis
    const select = screen.getByLabelText(/Company/i, { selector: "select" });
    fireEvent.change(select, { target: { value: "volantis-id" } });

    // Verify correct API call is triggered
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("vendor_id=volantis-id")
      );
    });

    // Verify it is persisted in sessionStorage
    expect(sessionStorage.getItem("vms_recruiter_selected_company_id")).toBe("volantis-id");
  });
});
