"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface VendorActiveJobRole {
  id: string;
  title: string;
  department: string;
  department_id: string;
  job_id: string;
  status: string;
  has_jd: boolean;
  jd_filename?: string | null;
  jd_uploaded_at?: string | null;
  created_at: string;
  company: string;
  vendor_id: string;
}

export default function VendorActiveJobRolesPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<VendorActiveJobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchActiveRoles = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<VendorActiveJobRole[]>("/api/v1/vendor/job-roles");
      setRoles(data);
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setError(errorObj.detail || "Failed to load active job roles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveRoles();
  }, []);

  const handleViewJD = async (role: VendorActiveJobRole) => {
    setActionLoadingId(`view-${role.id}`);
    try {
      const blob = await api.get<Blob>(`/api/v1/vendor/job-roles/${role.id}/jd`);
      const fileUrl = window.URL.createObjectURL(blob);
      window.open(fileUrl, "_blank");
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to view Job Description. Role may be inactive or JD unavailable.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDownloadJD = async (role: VendorActiveJobRole) => {
    setActionLoadingId(`download-${role.id}`);
    try {
      const blob = await api.get<Blob>(`/api/v1/vendor/job-roles/${role.id}/jd?download=true`);
      const fileUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = fileUrl;
      link.setAttribute("download", role.jd_filename || `${role.title.replace(/\s+/g, "_")}_JD.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(fileUrl);
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to download Job Description.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSubmitCandidate = (role: VendorActiveJobRole) => {
    const params = new URLSearchParams({
      role_id: role.id,
      job_id: role.job_id,
      dept_id: role.department_id,
      title: role.title,
      dept: role.department,
      vendor_id: role.vendor_id,
      company: role.company,
    });
    router.push(`/vendor/submit?${params.toString()}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Active Job Roles</h1>
          <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
            Explore currently open requirements, review responsibilities, and access official Job Descriptions.
          </p>
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

      {/* Active Roles Table */}
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
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Job Role</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Company</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Department</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Job ID</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Job Description</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="200px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="150px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="180px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="140px" /></td>
                  </tr>
                ))
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{
                    padding: "3.5rem",
                    textAlign: "center",
                    color: "hsl(var(--muted-hsl))",
                    fontSize: "0.95rem"
                  }}>
                    No active job roles are currently available.
                  </td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.id} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <div style={{ fontWeight: 600, color: "hsl(var(--foreground-hsl))" }}>{role.title}</div>
                      <div style={{ fontSize: "0.75rem", color: "hsl(var(--muted-hsl))", marginTop: "0.15rem" }}>
                        Posted on {new Date(role.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <span style={{
                        padding: "0.25rem 0.6rem",
                        backgroundColor: "rgba(37, 99, 235, 0.05)",
                        borderRadius: "4px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "hsl(var(--primary-hsl))",
                        border: "1px solid rgba(37, 99, 235, 0.2)"
                      }}>
                        {role.company}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <span style={{
                        padding: "0.25rem 0.6rem",
                        backgroundColor: "hsl(var(--muted-bg-hsl))",
                        borderRadius: "4px",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color: "hsl(var(--foreground-hsl))"
                      }}>
                        {role.department}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <span style={{
                        fontFamily: "monospace",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "hsl(var(--foreground-hsl))",
                        backgroundColor: "hsl(var(--muted-bg-hsl))",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        letterSpacing: "0.03em"
                      }}>
                        {role.job_id}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      {role.has_jd ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewJD(role)}
                            loading={actionLoadingId === `view-${role.id}`}
                            style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                          >
                            View JD
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleDownloadJD(role)}
                            loading={actionLoadingId === `download-${role.id}`}
                            style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                          >
                            Download JD
                          </Button>
                          {role.jd_filename && (
                            <span style={{
                              fontSize: "0.75rem",
                              color: "hsl(var(--muted-hsl))",
                              maxWidth: "180px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }} title={role.jd_filename}>
                              ({role.jd_filename})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.85rem", fontStyle: "italic" }}>
                          No JD available
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSubmitCandidate(role)}
                        style={{ padding: "0.35rem 0.85rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}
                      >
                        Submit Candidate
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
