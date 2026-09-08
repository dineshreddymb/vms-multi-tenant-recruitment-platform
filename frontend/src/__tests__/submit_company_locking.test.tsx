import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import SubmitCandidate from "@/app/vendor/submit/page";

// Mock router
const mockPush = jest.fn();
const mockSetActiveVendorId = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: (key: string) => {
      const params: Record<string, string> = {
        role_id: "role-123",
        job_id: "JOB-123",
        dept_id: "dept-123",
        title: "Senior Engineer",
        dept: "Engineering",
        vendor_id: "vendor-iosys",
        company: "IOSYS",
      };
      return params[key] || null;
    },
  }),
}));

// Mock AuthContext
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      email: "vendor@test.com",
      role: "VENDOR_USER",
      activeVendorId: "vendor-volantis",
      activeCompanyName: "Volantis",
      companies: [
        { vendor_id: "vendor-iosys", company_name: "IOSYS" },
        { vendor_id: "vendor-volantis", company_name: "Volantis" },
      ],
    },
    loading: false,
    isAdmin: false,
    isRecruiter: false,
    setActiveVendorId: mockSetActiveVendorId,
  }),
}));

// Mock api-client
jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(() => Promise.resolve([])),
    post: jest.fn(() => Promise.resolve({})),
  },
}));

describe("Vendor Submit Candidate Pre-selected Job Company Locking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("locks the company select and never switches company context when routing from a job", async () => {
    render(<SubmitCandidate />);

    // Wait for mount and verify setActiveVendorId is not called
    await waitFor(() => {
      expect(mockSetActiveVendorId).not.toHaveBeenCalled();
    });

    // Verify company name is rendered as a locked badge
    expect(screen.getByText("Submitting on behalf of company:")).toBeInTheDocument();
    
    // The company name "IOSYS" should be in the document
    const iosysBadge = screen.getByText("IOSYS");
    expect(iosysBadge).toBeInTheDocument();
    
    // The dropdown select should not be in the document because select element is not rendered
    const selects = screen.queryAllByRole("combobox");
    const hasCompanySelect = selects.some(select => 
      select.innerHTML.includes("vendor-iosys") || select.innerHTML.includes("vendor-volantis")
    );
    expect(hasCompanySelect).toBe(false);
  });
});
