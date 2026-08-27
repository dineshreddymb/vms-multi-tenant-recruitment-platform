"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";

interface Department {
  id: string;
  name: string;
  status: string;
}

interface Company {
  id: string;
  name: string;
}

interface JobRole {
  id: string;
  department_id: string;
  vendor_id?: string;
  company_name?: string;
  title: string;
  job_id: string;
  status: string;
  has_jd?: boolean;
  jd_filename?: string | null;
  jd_uploaded_at?: string | null;
  created_at: string;
}

export default function JobRoleManagement() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create Job Role Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDeptId, setCreateDeptId] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createJobId, setCreateJobId] = useState("");
  const [createCompanyId, setCreateCompanyId] = useState("");
  const [createJdFile, setCreateJdFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  
  // AI JD Generation State
  const [aiJdRequirements, setAiJdRequirements] = useState("");
  const [generatedJdText, setGeneratedJdText] = useState("");
  const [generatingJd, setGeneratingJd] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Add New Department Modal State
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [addDeptError, setAddDeptError] = useState("");

  // Add New Job Role Option Modal State
  const [isAddRoleOptionOpen, setIsAddRoleOptionOpen] = useState(false);
  const [newRoleOptionTitle, setNewRoleOptionTitle] = useState("");
  const [addRoleOptionError, setAddRoleOptionError] = useState("");

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<JobRole | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editJdFile, setEditJdFile] = useState<File | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [rolesList, deptsList, optionsList, companiesList] = await Promise.all([
        api.get<JobRole[]>("/api/v1/recruiter/job-roles").catch(() => [] as JobRole[]),
        api.get<Department[]>("/api/v1/recruiter/departments").catch(() => {
          return api.get<Department[]>("/api/v1/departments").catch(() => [] as Department[]);
        }),
        api.get<string[]>("/api/v1/recruiter/job-role-options").catch(() => [] as string[]),
        api.get<Company[]>("/api/v1/auth/companies").catch(() => [] as Company[])
      ]);
      setRoles(rolesList);
      setDepartments(deptsList);
      
      // Combine existing titles from roles list and backend options
      const allOptions = Array.from(
        new Set([...optionsList, ...rolesList.map((r) => r.title)])
      ).sort((a, b) => a.localeCompare(b));
      setRoleOptions(allOptions);

      let finalCompaniesList = companiesList;
      if (!finalCompaniesList || finalCompaniesList.length === 0) {
        finalCompaniesList = [
          { id: "iosys-id-fallback", name: "IOSYS" },
          { id: "volantis-id-fallback", name: "Volantis" }
        ];
      }

      // Filter companies to match the active logged-in company context (user?.activeVendorId)
      const filteredCompanies = finalCompaniesList.filter(
        (c) => c.name && 
               (c.name.toLowerCase() === "iosys" || c.name.toLowerCase() === "volantis") &&
               (!user?.activeVendorId || c.id === user.activeVendorId)
      );
      setCompanies(filteredCompanies);
      if (user?.activeVendorId) {
        setCreateCompanyId(user.activeVendorId);
      } else if (filteredCompanies.length > 0) {
        setCreateCompanyId(filteredCompanies[0].id);
      }
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setError(errorObj.detail || "Failed to load job role inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user?.activeVendorId]);

  const handleDeptSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "__ADD_NEW_DEPT__") {
      setAddDeptError("");
      setNewDeptName("");
      setIsAddDeptOpen(true);
    } else {
      setCreateDeptId(val);
    }
  };

  const handleAddDepartmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddDeptError("");
    const trimmed = newDeptName.trim();
    if (!trimmed) {
      setAddDeptError("Department: Department name is required.");
      return;
    }

    setAddingDept(true);
    try {
      const created = await api.post<Department>("/api/v1/recruiter/departments", {
        name: trimmed
      });
      const updatedDepts = [...departments, created].sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(updatedDepts);
      setCreateDeptId(created.id);
      setIsAddDeptOpen(false);
      setNewDeptName("");
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setAddDeptError(errorObj.detail || "Failed to create department.");
    } finally {
      setAddingDept(false);
    }
  };

  const handleRoleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "__ADD_NEW_ROLE__") {
      setAddRoleOptionError("");
      setNewRoleOptionTitle("");
      setIsAddRoleOptionOpen(true);
    } else {
      setCreateTitle(val);
    }
  };

  const handleAddRoleOptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddRoleOptionError("");
    const trimmed = newRoleOptionTitle.trim();
    if (!trimmed) {
      setAddRoleOptionError("Job Role: Title is required.");
      return;
    }

    if (!roleOptions.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
      setRoleOptions([...roleOptions, trimmed].sort((a, b) => a.localeCompare(b)));
    }
    setCreateTitle(trimmed);
    setIsAddRoleOptionOpen(false);
    setNewRoleOptionTitle("");
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");

    if (!createDeptId.trim()) {
      setCreateError("Department: Department name is required.");
      return;
    }

    if (!createCompanyId.trim()) {
      setCreateError("Company/Vendor: Please select a company/vendor.");
      return;
    }

    if (!createTitle.trim()) {
      setCreateError("Job Role Title: Please enter or select a job role title.");
      return;
    }

    if (!createJobId.trim()) {
      setCreateError("Job ID: Please enter a unique Job ID.");
      return;
    }

    if (createJdFile && createJdFile.size > 10 * 1024 * 1024) {
      setCreateError("Job Description: File size must not exceed the allowed limit of 10MB.");
      return;
    }

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append("department_id", createDeptId.trim());
      formData.append("title", createTitle.trim());
      formData.append("job_id", createJobId.trim());
      formData.append("vendor_id", createCompanyId.trim());
      if (createJdFile) {
        formData.append("file", createJdFile);
      }

      const newRole = await api.post<JobRole>("/api/v1/recruiter/job-roles", formData);
      setRoles([newRole, ...roles]);
      
      // Update options list if new title
      if (!roleOptions.includes(newRole.title)) {
        setRoleOptions([...roleOptions, newRole.title].sort((a, b) => a.localeCompare(b)));
      }

      try {
        const deptsList = await api.get<Department[]>("/api/v1/recruiter/departments");
        setDepartments(deptsList);
      } catch (e) {
        console.error("Failed to refresh departments:", e);
      }

      setCreateTitle("");
      setCreateDeptId("");
      setCreateJobId("");
      setCreateCompanyId("");
      setCreateJdFile(null);
      setIsCreateOpen(false);
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setCreateError(errorObj.detail || "Failed to create job role.");
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateJd = async () => {
    const trimmed = aiJdRequirements.trim();
    if (!trimmed) {
      setCreateError("AI Job Description: Requirements cannot be empty.");
      return;
    }
    setGeneratingJd(true);
    setCreateError("");
    try {
      const response = await api.post<{ jd: string }>("/api/v1/recruiter/job-roles/generate-jd", {
        requirements: trimmed
      });
      setGeneratedJdText(response.jd);
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setCreateError(errorObj.detail || "Failed to generate Job Description. Please try again.");
    } finally {
      setGeneratingJd(false);
    }
  };

  const handleProceedWithGeneratedJd = () => {
    if (!generatedJdText) return;
    
    if (createJdFile) {
      const confirmReplace = window.confirm(
        "A JD file is already selected. Do you want to replace it with the AI-generated JD?"
      );
      if (!confirmReplace) return;
    }
    
    const file = new File([generatedJdText], "generated_jd.txt", { type: "text/plain" });
    setCreateJdFile(file);
    setAiJdRequirements("");
    setGeneratedJdText("");
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setEditError("");

    if (editJdFile && editJdFile.size > 10 * 1024 * 1024) {
      setEditError("Job Description: File size must not exceed the allowed limit of 10MB.");
      return;
    }

    setSavingEdit(true);
    try {
      let updated = selectedRole;

      // 1. Update Title if changed
      if (editTitle.trim() !== selectedRole.title) {
        updated = await api.patch<JobRole>(`/api/v1/recruiter/job-roles/${selectedRole.id}`, {
          title: editTitle.trim()
        });
      }

      // 2. Upload/Replace JD if new file selected
      if (editJdFile) {
        const formData = new FormData();
        formData.append("file", editJdFile);
        updated = await api.post<JobRole>(`/api/v1/recruiter/job-roles/${selectedRole.id}/jd`, formData);
      }

      setRoles(roles.map((r) => (r.id === updated.id ? updated : r)));
      setIsEditOpen(false);
      setSelectedRole(null);
      setEditJdFile(null);
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setEditError(errorObj.detail || "Failed to update job role.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRemoveJd = async () => {
    if (!selectedRole) return;
    if (!confirm("Are you sure you want to remove the Job Description file from this role?")) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const updated = await api.delete<JobRole>(`/api/v1/recruiter/job-roles/${selectedRole.id}/jd`);
      setSelectedRole(updated);
      setRoles(roles.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setEditError(errorObj.detail || "Failed to remove Job Description file.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleViewJD = async (roleId: string) => {
    setActionLoadingId(`view-${roleId}`);
    try {
      const blob = await api.get<Blob>(`/api/v1/recruiter/job-roles/${roleId}/jd`);
      const fileUrl = window.URL.createObjectURL(blob);
      window.open(fileUrl, "_blank");
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to open Job Description file.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Are you sure you want to deactivate this job role? New submissions will be blocked.")) return;
    try {
      await api.post(`/api/v1/recruiter/job-roles/${id}/deactivate`);
      setRoles(roles.map((r) => (r.id === id ? { ...r, status: "CLOSED" } : r)));
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to deactivate job role.");
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.post(`/api/v1/recruiter/job-roles/${id}/reactivate`);
      setRoles(roles.map((r) => (r.id === id ? { ...r, status: "ACTIVE" } : r)));
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to reactivate job role.");
    }
  };

  const getDeptName = (deptId: string) => {
    return departments.find((d) => d.id === deptId)?.name || "Unknown Department";
  };

  const getStatusBadgeStyle = (status: string) => {
    const base = {
      padding: "0.2rem 0.5rem",
      borderRadius: "4px",
      fontSize: "0.75rem",
      fontWeight: 700,
      textTransform: "uppercase" as const
    };
    if (status === "ACTIVE") {
      return { ...base, backgroundColor: "rgba(16, 185, 129, 0.1)", color: "hsl(var(--success-hsl))" };
    }
    return { ...base, backgroundColor: "rgba(220, 38, 38, 0.1)", color: "hsl(var(--danger-hsl))" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Upper header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Job Role Management</h1>
          <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
            Create custom departments, add job roles, attach Job Descriptions (JD), and manage posting lifecycles.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button
            variant="outline"
            onClick={() => {
              setNewDeptName("");
              setAddDeptError("");
              setIsAddDeptOpen(true);
            }}
          >
            + Add Department
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>+ Create Job Role</Button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "1rem",
          backgroundColor: "hsl(var(--danger-bg-hsl))",
          color: "hsl(var(--danger-hsl))",
          borderRadius: "8px"
        }}>
          {error}
        </div>
      )}

      {/* Roles inventory table */}
      <div style={{
        backgroundColor: "hsl(var(--card-hsl))",
        border: "1px solid hsl(var(--card-border-hsl))",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden"
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            textAlign: "left",
            fontSize: "0.9rem"
          }}>
            <thead>
              <tr style={{
                backgroundColor: "hsl(var(--muted-bg-hsl))",
                borderBottom: "1px solid hsl(var(--card-border-hsl))"
              }}>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Role Title</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Department</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Company</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Job ID</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>JD</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Created At</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="180px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="140px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="110px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="120px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="60px" /></td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}><Skeleton width="120px" /></td>
                  </tr>
                ))
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "3rem", textAlign: "center", color: "hsl(var(--muted-hsl))" }}>
                    No job roles configured yet. Click &quot;Create Job Role&quot; to add one.
                  </td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.id} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                    <td style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>{role.title}</td>
                    <td style={{ padding: "1rem 1.5rem" }}>{getDeptName(role.department_id)}</td>
                    <td style={{ padding: "1rem 1.5rem" }}>{role.company_name || "Unknown"}</td>
                    <td style={{ padding: "1rem 1.5rem", fontFamily: "monospace", fontWeight: 600 }}>{role.job_id}</td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      {role.has_jd ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewJD(role.id)}
                            loading={actionLoadingId === `view-${role.id}`}
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                          >
                            View JD
                          </Button>
                        </div>
                      ) : (
                        <span style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.85rem" }}>No JD</span>
                      )}
                    </td>
                    <td style={{ padding: "1rem 1.5rem", color: "hsl(var(--muted-hsl))", fontSize: "0.85rem" }}>
                      {new Date(role.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <span style={getStatusBadgeStyle(role.status)}>{role.status}</span>
                    </td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRole(role);
                            setEditTitle(role.title);
                            setEditJdFile(null);
                            setEditError("");
                            setIsEditOpen(true);
                          }}
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                        >
                          Edit
                        </Button>

                        {role.status === "ACTIVE" ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeactivate(role.id)}
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleReactivate(role.id)}
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateJdFile(null);
          setCreateError("");
          setCreateCompanyId("");
          setAiJdRequirements("");
          setGeneratedJdText("");
        }}
        title="Create Job Role"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          {createError && (
            <div style={{
              padding: "0.75rem",
              backgroundColor: "hsl(var(--danger-bg-hsl))",
              color: "hsl(var(--danger-hsl))",
              borderRadius: "4px",
              fontSize: "0.85rem"
            }}>
              {createError}
            </div>
          )}

          {/* Department Input */}
          <Input
            id="create-department-input"
            label="Department"
            type="text"
            placeholder="e.g. Engineering"
            value={createDeptId}
            onChange={(e) => setCreateDeptId(e.target.value)}
            required
          />

          {/* Company/Vendor Select Dropdown */}
          <Select
            id="create-company-select"
            label={
              <span>
                Company/Vendor <span style={{ color: "hsl(var(--danger-hsl))" }}>*</span>
              </span>
            }
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            value={createCompanyId}
            onChange={(e) => setCreateCompanyId(e.target.value)}
            placeholder="Select Company/Vendor"
            required
          />

          {/* Job Role Title Selection */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="create-role-select" style={{ fontSize: "0.875rem", fontWeight: 500, color: "hsl(var(--foreground-hsl))" }}>
                Job Role Title <span style={{ color: "hsl(var(--danger-hsl))" }}>*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setAddRoleOptionError("");
                  setNewRoleOptionTitle("");
                  setIsAddRoleOptionOpen(true);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "hsl(var(--primary-hsl))",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                + Add New Job Role
              </button>
            </div>

            {roleOptions.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Select
                  id="create-role-select"
                  options={[
                    ...roleOptions.map((t) => ({ value: t, label: t })),
                    { value: "__ADD_NEW_ROLE__", label: "+ Add New Job Role" }
                  ]}
                  value={createTitle}
                  onChange={handleRoleSelectChange}
                  placeholder="Select Job Role"
                />
                {createTitle && createTitle !== "__ADD_NEW_ROLE__" && (
                  <Input
                    label="Or edit title directly:"
                    type="text"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    required
                  />
                )}
              </div>
            ) : (
              <Input
                type="text"
                placeholder="e.g. Lead Software Engineer"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                required
              />
            )}
          </div>

          {/* Job ID Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <Input
              id="create-job-id"
              label={
                <span>
                  Job ID <span style={{ color: "hsl(var(--danger-hsl))" }}>*</span>
                </span>
              }
              type="text"
              placeholder="e.g. JOB-10492"
              value={createJobId}
              onChange={(e) => setCreateJobId(e.target.value)}
              required
            />
          </div>

          {/* JD File Upload */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 500, color: "hsl(var(--foreground-hsl))" }}>
              Job Description (JD) <span style={{ color: "hsl(var(--muted-hsl))", fontWeight: 400 }}>(Optional, PDF/DOCX/DOC/TXT up to 10MB)</span>
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setCreateJdFile(e.target.files[0]);
                }
              }}
              style={{
                fontSize: "0.85rem",
                padding: "0.5rem",
                border: "1px solid hsl(var(--card-border-hsl))",
                borderRadius: "var(--radius-md)",
                backgroundColor: "hsl(var(--card-hsl))",
                color: "hsl(var(--foreground-hsl))"
              }}
            />
            {createJdFile && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "hsl(var(--primary-hsl))", marginTop: "0.2rem" }}>
                <span>Selected: <strong>{createJdFile.name}</strong> ({(createJdFile.size / 1024).toFixed(1)} KB)</span>
                <button
                  type="button"
                  onClick={() => setCreateJdFile(null)}
                  style={{ background: "none", border: "none", color: "hsl(var(--danger-hsl))", cursor: "pointer", fontSize: "0.8rem" }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* AI JD Generation section */}
          <hr style={{ border: "none", borderTop: "1px solid hsl(var(--card-border-hsl))", margin: "0.5rem 0" }} />
          
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 500, color: "hsl(var(--foreground-hsl))" }}>
              AI Job Description <span style={{ color: "hsl(var(--muted-hsl))", fontWeight: 400 }}>(Optional, enter requirements to generate)</span>
            </label>
            <textarea
              id="ai-requirements-textarea"
              placeholder="Enter job requirements, responsibilities, skills, experience, and other details..."
              value={aiJdRequirements}
              onChange={(e) => setAiJdRequirements(e.target.value)}
              style={{
                fontSize: "0.85rem",
                padding: "0.5rem 0.75rem",
                border: "1px solid hsl(var(--card-border-hsl))",
                borderRadius: "var(--radius-md)",
                backgroundColor: "hsl(var(--card-hsl))",
                color: "hsl(var(--foreground-hsl))",
                minHeight: "80px",
                resize: "vertical",
                width: "100%",
                fontFamily: "inherit"
              }}
            />
            
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.25rem" }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateJd}
                disabled={generatingJd}
              >
                {generatingJd ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 30" strokeLinecap="round" />
                    </svg>
                    Generating JD...
                  </span>
                ) : (
                  "Generate JD"
                )}
              </Button>

              {generatedJdText && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "hsl(var(--success-hsl))", fontWeight: 500 }}>
                    Generated JD ready for review.
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "hsl(var(--primary-hsl))",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                      fontWeight: 600
                    }}
                  >
                    View JD
                  </button>
                  <span style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.8rem" }}>|</span>
                  <button
                    type="button"
                    onClick={handleProceedWithGeneratedJd}
                    style={{
                      background: "none",
                      border: "none",
                      color: "hsl(var(--success-hsl))",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                      fontWeight: 600
                    }}
                  >
                    Proceed
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false);
                setCreateJdFile(null);
                setAiJdRequirements("");
                setGeneratedJdText("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create Role
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Add New Department */}
      <Modal
        isOpen={isAddDeptOpen}
        onClose={() => {
          setIsAddDeptOpen(false);
          setNewDeptName("");
          setAddDeptError("");
        }}
        title="Add New Department"
      >
        <form onSubmit={handleAddDepartmentSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {addDeptError && (
            <div style={{
              padding: "0.75rem",
              backgroundColor: "hsl(var(--danger-bg-hsl))",
              color: "hsl(var(--danger-hsl))",
              borderRadius: "4px",
              fontSize: "0.85rem"
            }}>
              {addDeptError}
            </div>
          )}

          <Input
            label="Department Name"
            type="text"
            placeholder="e.g. Artificial Intelligence"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            required
            autoFocus
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddDeptOpen(false);
                setNewDeptName("");
                setAddDeptError("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={addingDept}>
              Add Department
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Add New Job Role Option */}
      <Modal
        isOpen={isAddRoleOptionOpen}
        onClose={() => {
          setIsAddRoleOptionOpen(false);
          setNewRoleOptionTitle("");
          setAddRoleOptionError("");
        }}
        title="Add New Job Role"
      >
        <form onSubmit={handleAddRoleOptionSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {addRoleOptionError && (
            <div style={{
              padding: "0.75rem",
              backgroundColor: "hsl(var(--danger-bg-hsl))",
              color: "hsl(var(--danger-hsl))",
              borderRadius: "4px",
              fontSize: "0.85rem"
            }}>
              {addRoleOptionError}
            </div>
          )}

          <Input
            label="Job Role Title"
            type="text"
            placeholder="e.g. Generative AI Engineer"
            value={newRoleOptionTitle}
            onChange={(e) => setNewRoleOptionTitle(e.target.value)}
            required
            autoFocus
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddRoleOptionOpen(false);
                setNewRoleOptionTitle("");
                setAddRoleOptionError("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit">
              Add Job Role
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 4: Edit Role */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setSelectedRole(null);
          setEditJdFile(null);
          setEditError("");
        }}
        title="Edit Job Role & Job Description"
      >
        <form onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          {editError && (
            <div style={{
              padding: "0.75rem",
              backgroundColor: "hsl(var(--danger-bg-hsl))",
              color: "hsl(var(--danger-hsl))",
              borderRadius: "4px",
              fontSize: "0.85rem"
            }}>
              {editError}
            </div>
          )}

          <div style={{ fontSize: "0.85rem", color: "hsl(var(--muted-hsl))" }}>
            Department: <strong>{selectedRole && getDeptName(selectedRole.department_id)}</strong>
          </div>

          <Input
            label="Job Role Title"
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />

          <Input
            label="Job ID"
            type="text"
            value={selectedRole?.job_id || ""}
            disabled
            style={{ opacity: 0.75, backgroundColor: "hsl(var(--muted-bg-hsl))", cursor: "not-allowed" }}
          />

          {/* Current JD Status & Replace */}
          <div style={{
            padding: "0.75rem",
            backgroundColor: "hsl(var(--muted-bg-hsl))",
            borderRadius: "var(--radius-md)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem"
          }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>
              Current JD:{" "}
              {selectedRole?.has_jd ? (
                <span style={{ color: "hsl(var(--success-hsl))", fontWeight: 600 }}>
                  {selectedRole.jd_filename || "Attached"}
                </span>
              ) : (
                <span style={{ color: "hsl(var(--muted-hsl))" }}>No JD attached</span>
              )}
            </div>

            {selectedRole?.has_jd && (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewJD(selectedRole.id)}
                  style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                >
                  View Current JD
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleRemoveJd}
                  style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                >
                  Remove JD
                </Button>
              </div>
            )}
          </div>

          {/* Replace / Upload New JD File */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 500, color: "hsl(var(--foreground-hsl))" }}>
              {selectedRole?.has_jd ? "Replace Job Description File" : "Attach Job Description File"}
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setEditJdFile(e.target.files[0]);
                }
              }}
              style={{
                fontSize: "0.85rem",
                padding: "0.5rem",
                border: "1px solid hsl(var(--card-border-hsl))",
                borderRadius: "var(--radius-md)",
                backgroundColor: "hsl(var(--card-hsl))",
                color: "hsl(var(--foreground-hsl))"
              }}
            />
            {editJdFile && (
              <div style={{ fontSize: "0.8rem", color: "hsl(var(--primary-hsl))", marginTop: "0.2rem" }}>
                Selected: <strong>{editJdFile.name}</strong> ({(editJdFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditOpen(false);
                setSelectedRole(null);
                setEditJdFile(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={savingEdit}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* AI JD Preview Modal */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="Job Description Preview"
        footerButtons={
          <Button onClick={() => setIsPreviewOpen(false)}>Close</Button>
        }
      >
        <div style={{
          maxHeight: "60vh",
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          padding: "1rem",
          backgroundColor: "hsl(var(--muted-bg-hsl))",
          borderRadius: "var(--radius-md)",
          border: "1px solid hsl(var(--card-border-hsl))",
          fontFamily: "monospace",
          fontSize: "0.85rem",
          color: "hsl(var(--foreground-hsl))"
        }}>
          {generatedJdText}
        </div>
      </Modal>
    </div>
  );
}
