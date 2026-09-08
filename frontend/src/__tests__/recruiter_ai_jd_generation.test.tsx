import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import JobRoleManagement from "@/app/recruiter/roles/page";
import { api } from "@/lib/api-client";

// Mock router
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
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
    user: {
      id: "u1",
      name: "Test Recruiter User",
      email: "recruiter@corp.com",
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

describe("Recruiter AI Job Description Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn().mockReturnValue(true);
    window.alert = jest.fn();
    
    // Set up mock api gets for initial page render lookups
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles") return Promise.resolve([]);
      if (url === "/api/v1/recruiter/departments") return Promise.resolve([{ id: "d1", name: "Engineering", status: "ACTIVE" }]);
      if (url === "/api/v1/recruiter/job-role-options") return Promise.resolve([]);
      if (url === "/api/v1/auth/companies") return Promise.resolve([{ id: "v1", name: "IOSYS" }]);
      return Promise.reject(new Error("Unknown route"));
    });
  });

  test("AI JD generation elements are displayed in the modal", async () => {
    render(<JobRoleManagement />);

    await waitFor(() => {
      expect(screen.getByText("+ Create Job Role")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Create Job Role"));

    // Verify AI section elements exist
    expect(screen.getByText("AI Job Description")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Enter job requirements, responsibilities, skills, experience, and other details/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate JD" })).toBeInTheDocument();
  });

  test("Generate JD rejects empty requirement input", async () => {
    render(<JobRoleManagement />);

    await waitFor(() => {
      fireEvent.click(screen.getByText("+ Create Job Role"));
    });

    const generateBtn = screen.getByRole("button", { name: "Generate JD" });
    fireEvent.click(generateBtn);

    // Verify frontend validation shows error and does not call backend
    expect(screen.getByText("AI Job Description: Requirements cannot be empty.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("Successful JD generation loading state, preview rendering, and proceed file replacement flow", async () => {
    // Delay resolution to capture the loading state
    let resolvePost: (value: unknown) => void = () => {};
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    (api.post as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles/generate-jd") {
        return postPromise;
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<JobRoleManagement />);

    await waitFor(() => {
      fireEvent.click(screen.getByText("+ Create Job Role"));
    });

    const textarea = screen.getByPlaceholderText(/Enter job requirements/i);
    fireEvent.change(textarea, { target: { value: "Need a senior Python engineer." } });

    const generateBtn = screen.getByRole("button", { name: "Generate JD" });
    
    // Act wrapper for state change
    await act(async () => {
      fireEvent.click(generateBtn);
    });

    // Check loading indicator and disabled state during generation
    expect(screen.getByRole("button", { name: "Generating JD..." })).toBeInTheDocument();
    expect(generateBtn).toBeDisabled();

    // Resolve API request
    await act(async () => {
      resolvePost({ jd: "AI Generated Python Job Description Text content" });
    });

    // Button is restored and success message is displayed
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate JD" })).not.toBeDisabled();
      expect(screen.getByText("Generated JD ready for review.")).toBeInTheDocument();
    });

    // Click View JD to preview
    const viewBtn = screen.getByRole("button", { name: "View JD" });
    fireEvent.click(viewBtn);

    expect(screen.getByText("AI Generated Job Description")).toBeInTheDocument();
    expect(screen.getByDisplayValue("AI Generated Python Job Description Text content")).toBeInTheDocument();

    // Close preview
    const cancelBtns = screen.getAllByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);

    expect(screen.queryByText("AI Generated Job Description")).not.toBeInTheDocument();

    // Click Proceed
    const proceedBtn = screen.getByRole("button", { name: "Proceed" });
    fireEvent.click(proceedBtn);

    // Verify it assigns generated_jd.pdf to status
    expect(screen.getByText(/Selected:/i)).toBeInTheDocument();
    expect(screen.getByText(/generated_jd\.pdf/i)).toBeInTheDocument();
  });

  test("Manual JD replacement confirmation warning is shown when Proceed is clicked", async () => {
    (api.post as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles/generate-jd") {
        return Promise.resolve({ jd: "AI JD Content" });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    const { container } = render(<JobRoleManagement />);

    await waitFor(() => {
      fireEvent.click(screen.getByText("+ Create Job Role"));
    });

    // Select manual file first
    const file = new File(["manual upload content"], "manual_jd.pdf", { type: "application/pdf" });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.getByText(/manual_jd\.pdf/i)).toBeInTheDocument();

    // Enter requirements and generate
    const textarea = screen.getByPlaceholderText(/Enter job requirements/i);
    fireEvent.change(textarea, { target: { value: "Fulltime python engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate JD" }));

    await waitFor(() => {
      expect(screen.getByText("Generated JD ready for review.")).toBeInTheDocument();
    });

    // Click Proceed
    fireEvent.click(screen.getByRole("button", { name: "Proceed" }));

    // Verify confirmation string matches specification
    expect(window.confirm).toHaveBeenCalledWith(
      "A JD file is already selected. Do you want to replace it with the AI-generated JD?"
    );

    // File should now be replaced by generated_jd.pdf
    expect(screen.getByText(/generated_jd\.pdf/i)).toBeInTheDocument();
    expect(screen.queryByText(/manual_jd\.pdf/i)).not.toBeInTheDocument();
  });
});
