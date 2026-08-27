import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JobRoleManagement from "@/app/recruiter/roles/page";
import { api } from "@/lib/api-client";

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
    user: { id: "u1", name: "Test Recruiter User", email: "r@corp.com" },
    loading: false,
    logout: jest.fn(),
    isVendor: false,
    isRecruiter: true,
  }),
}));

describe("Dynamic Department & Job Role Management UI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows recruiter to open Add Department modal and create new department", async () => {
    const mockDepts = [
      { id: "d1", name: "Engineering", status: "ACTIVE" },
      { id: "d2", name: "Product", status: "ACTIVE" },
    ];
    const mockRoles: unknown[] = [];
    const mockOptions = ["Backend Engineer", "Frontend Engineer"];

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles") return Promise.resolve(mockRoles);
      if (url === "/api/v1/departments") return Promise.resolve(mockDepts);
      if (url === "/api/v1/recruiter/job-role-options") return Promise.resolve(mockOptions);
      return Promise.reject(new Error("Unknown route"));
    });

    (api.post as jest.Mock).mockImplementation((url: string, body: unknown) => {
      if (url === "/api/v1/recruiter/departments") {
        const payload = body as { name: string };
        return Promise.resolve({
          id: "d3",
          name: payload.name,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<JobRoleManagement />);

    await waitFor(() => {
      expect(screen.getByText("+ Create Job Role")).toBeInTheDocument();
    });

    // 1. Click "+ Add Department" on the main page
    fireEvent.click(screen.getByText("+ Add Department"));
    expect(screen.getByRole("heading", { name: "Add New Department" })).toBeInTheDocument();

    // 2. Enter Department Name and Submit
    const deptInput = screen.getByLabelText(/Department Name/i);
    fireEvent.change(deptInput, { target: { value: "Artificial Intelligence" } });
    fireEvent.click(screen.getByText("Add Department", { selector: "button" }));

    // 3. Verify API called
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/v1/recruiter/departments", {
        name: "Artificial Intelligence",
      });
    });
  });

  it("handles duplicate department error gracefully", async () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles") return Promise.resolve([]);
      if (url === "/api/v1/departments") return Promise.resolve([{ id: "d1", name: "Engineering", status: "ACTIVE" }]);
      if (url === "/api/v1/recruiter/job-role-options") return Promise.resolve([]);
      return Promise.reject(new Error("Unknown route"));
    });

    (api.post as jest.Mock).mockRejectedValueOnce({
      status: 409,
      detail: "Department: A department with this name already exists.",
    });

    render(<JobRoleManagement />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Department")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add Department"));

    const deptInput = screen.getByLabelText(/Department Name/i);
    fireEvent.change(deptInput, { target: { value: "Engineering" } });
    fireEvent.click(screen.getByText("Add Department", { selector: "button" }));

    await waitFor(() => {
      expect(screen.getByText("Department: A department with this name already exists.")).toBeInTheDocument();
    });
  });

  it("allows recruiter to add a new Job Role option and create the role", async () => {
    const mockDepts = [{ id: "d1", name: "Engineering", status: "ACTIVE" }];
    const mockRoles: unknown[] = [];
    const mockOptions = ["Software Engineer"];

    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles") return Promise.resolve(mockRoles);
      if (url === "/api/v1/departments") return Promise.resolve(mockDepts);
      if (url === "/api/v1/recruiter/job-role-options") return Promise.resolve(mockOptions);
      return Promise.reject(new Error("Unknown route"));
    });

    (api.post as jest.Mock).mockImplementation((url: string) => {
      if (url === "/api/v1/recruiter/job-roles") {
        return Promise.resolve({
          id: "r1",
          department_id: "d1",
          title: "Generative AI Specialist",
          status: "ACTIVE",
          has_jd: false,
          jd_filename: null,
          created_at: new Date().toISOString(),
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(<JobRoleManagement />);

    await waitFor(() => {
      expect(screen.getByText("+ Create Job Role")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Create Job Role"));

    // Type existing department name
    const deptInput = screen.getByLabelText(/Department/i, { selector: "input" });
    fireEvent.change(deptInput, { target: { value: "Engineering" } });

    // Click "+ Add New Job Role" button
    fireEvent.click(screen.getByRole("button", { name: "+ Add New Job Role" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Add New Job Role" })).toBeInTheDocument();
    });

    const roleInput = screen.getByPlaceholderText("e.g. Generative AI Engineer");
    fireEvent.change(roleInput, { target: { value: "Generative AI Specialist" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Job Role" }));

    // Populate mandatory Job ID
    await waitFor(() => {
      expect(screen.getByLabelText(/Job ID/i)).toBeInTheDocument();
    });
    const jobIdInput = screen.getByLabelText(/Job ID/i);
    fireEvent.change(jobIdInput, { target: { value: "JOB-GENAI-101" } });

    // Click Create Role
    await waitFor(() => {
      expect(screen.getByText("Create Role", { selector: "button" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create Role", { selector: "button" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/v1/recruiter/job-roles",
        expect.any(FormData)
      );
      expect(screen.getByText("Generative AI Specialist")).toBeInTheDocument();
    });
  });
});
