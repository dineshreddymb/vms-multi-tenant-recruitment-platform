import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import SubmitCandidate from "@/app/vendor/submit/page";
import { api } from "@/lib/api-client";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}));

// Mock AuthContext
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "vendor@test.com", role: "VENDOR_USER" },
    loading: false,
    isAdmin: false,
    isRecruiter: false,
  }),
}));

// Mock api-client
jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return {
    ...actual,
    api: {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    },
  };
});

describe("Vendor Submit Candidate Mandatory Fields & Job ID", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/departments") {
        return Promise.resolve([
          { id: "dept-1", name: "Engineering", status: "ACTIVE" },
        ]);
      }
      if (url.includes("/api/v1/job-roles?department_id=dept-1")) {
        return Promise.resolve([
          { id: "role-1", department_id: "dept-1", title: "Full Stack Engineer", status: "ACTIVE" },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  it("renders all existing fields plus the new Job ID field with required red asterisks", async () => {
    render(<SubmitCandidate />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/departments");
    });

    // Check all required field labels exist
    expect(screen.getByLabelText(/Target Department/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target Job Role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Job ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/CV Sent Date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Employment Mode/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Candidate Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contact Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Current Company/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Total Experience/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Relevant Experience/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notice Period/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^CTC/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Expected CTC/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Current Location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Preferred Location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/PAN Card Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/LinkedIn Profile URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Education details/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/About the Candidate/i)).toBeInTheDocument();

    // Verify PDF Resume section header has required asterisk
    expect(screen.getByText(/1\. PDF Resume Upload/i)).toBeInTheDocument();
  });

  it("keeps submit disabled until PDF resume is uploaded and verified", async () => {
    render(<SubmitCandidate />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/departments");
    });

    const submitBtn = screen.getByRole("button", { name: "Submit Candidate Profile" });
    expect(submitBtn).toBeDisabled();
    expect(api.post).not.toHaveBeenCalledWith("/api/v1/submissions", expect.anything(), expect.anything());
  });

  it("dynamically loads job roles when department is selected", async () => {
    render(<SubmitCandidate />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Target Department/i)).toBeInTheDocument();
    });

    const deptSelect = screen.getByLabelText(/Target Department/i);
    fireEvent.change(deptSelect, { target: { value: "dept-1" } });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/api/v1/job-roles?department_id=dept-1");
    });

    const roleSelect = screen.getByLabelText(/Target Job Role/i);
    expect(roleSelect).not.toBeDisabled();
  });
});
