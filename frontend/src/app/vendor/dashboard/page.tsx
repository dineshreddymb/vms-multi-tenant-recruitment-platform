"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";

interface Submission {
  id: string;
  submission_reference: string;
  candidate_id: string;
  vendor_id: string;
  vendor_user_id: string | null;
  role_id: string;
  job_id: string;
  status: string;
  cv_sent_date: string;
  employment_mode: string;
  created_at: string;
  company_name?: string;
}

interface PaginatedResponse {
  items: Submission[];
  total_items: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export default function VendorDashboard() {
  const { user, setActiveVendorId } = useAuth();
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10); // Standard layout size

  const fetchSubmissions = async (pageNum: number) => {
    setLoading(true);
    setError("");
    try {
      const vendorQuery = user?.activeVendorId ? `&vendor_id=${user.activeVendorId}` : "";
      const response = await api.get<PaginatedResponse>(
        `/api/v1/vendor/submissions?page=${pageNum}&page_size=${pageSize}${vendorQuery}`
      );
      setData(response);
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      setError(error.detail || "Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions(page);
  }, [page, user?.activeVendorId]);

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (data && page < data.total_pages) setPage(page + 1);
  };

  const getStatusStyle = (status: string) => {
    const base = {
      padding: "0.25rem 0.5rem",
      borderRadius: "4px",
      fontSize: "0.75rem",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      display: "inline-block"
    };
    switch (status) {
      case "SUBMITTED":
        return { ...base, backgroundColor: "rgba(37, 99, 235, 0.1)", color: "hsl(var(--primary-hsl))" };
      case "SCREENING":
      case "INTERVIEW":
      case "SELECTED":
        return { ...base, backgroundColor: "rgba(245, 158, 11, 0.1)", color: "hsl(var(--warning-hsl))" };
      case "ONBOARDED":
        return { ...base, backgroundColor: "rgba(16, 185, 129, 0.1)", color: "hsl(var(--success-hsl))" };
      case "REJECTED":
        return { ...base, backgroundColor: "rgba(220, 38, 38, 0.1)", color: "hsl(var(--danger-hsl))" };
      default:
        return base;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Upper header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Submissions Dashboard</h1>
          <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
            Monitor and review candidates submitted by your company
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {user?.companies && user.companies.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Company:</span>
              <select
                value={user.activeVendorId || ""}
                onChange={(e) => setActiveVendorId(e.target.value)}
                style={{
                  padding: "0.4rem 0.75rem",
                  borderRadius: "4px",
                  border: "1px solid hsl(var(--card-border-hsl))",
                  backgroundColor: "hsl(var(--card-hsl))",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer"
                }}
              >
                {user.companies.map((c) => (
                  <option key={c.vendor_id} value={c.vendor_id}>{c.company_name}</option>
                ))}
              </select>
            </div>
          )}
          <Link href="/vendor/job-roles">
            <Button>+ Submit Candidate</Button>
          </Link>
        </div>
      </div>

      {/* Main card panel */}
      <div style={{
        backgroundColor: "hsl(var(--card-hsl))",
        border: "1px solid hsl(var(--card-border-hsl))",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden"
      }}>
        {error && (
          <div style={{
            padding: "1rem",
            backgroundColor: "hsl(var(--danger-bg-hsl))",
            color: "hsl(var(--danger-hsl))",
            fontSize: "0.9rem",
            borderBottom: "1px solid hsl(var(--card-border-hsl))"
          }}>
            {error}
          </div>
        )}

        {/* Table container */}
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
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Submission ID</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Job ID</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Company</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Sent Date</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Employment Mode</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Created At</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Skeleton loading rows
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="180px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="180px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="90px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="80px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="120px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="70px" /></td>
                  </tr>
                ))
              ) : !data || data.items.length === 0 ? (
                // Empty state row
                <tr>
                  <td colSpan={7} style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "hsl(var(--muted-hsl))"
                  }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: "1rem", opacity: 0.5 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <p style={{ fontWeight: 500, fontSize: "0.95rem" }}>No candidates submitted yet</p>
                    <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>Get started by submitting your first candidate against an active role.</p>
                  </td>
                </tr>
              ) : (
                // Actual data rows
                data.items.map((sub) => (
                  <tr key={sub.id} style={{
                    borderBottom: "1px solid hsl(var(--card-border-hsl))",
                    transition: "background-color 0.15s ease"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "hsl(var(--background-hsl))"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ""}
                  >
                    <td style={{ padding: "1rem 1.5rem", fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 600, color: "hsl(var(--foreground-hsl))" }}>{sub.submission_reference}</td>
                    <td style={{ padding: "1rem 1.5rem", fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 600, color: "hsl(var(--foreground-hsl))" }}>{sub.job_id || "N/A"}</td>
                    <td style={{ padding: "1rem 1.5rem" }}>{sub.company_name || "N/A"}</td>
                    <td style={{ padding: "1rem 1.5rem" }}>{sub.cv_sent_date}</td>
                    <td style={{ padding: "1rem 1.5rem" }}>{sub.employment_mode}</td>
                    <td style={{ padding: "1rem 1.5rem", color: "hsl(var(--muted-hsl))", fontSize: "0.85rem" }}>
                      {new Date(sub.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <span style={getStatusStyle(sub.status)}>{sub.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {data && data.total_pages > 1 && (
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.5rem",
            borderTop: "1px solid hsl(var(--card-border-hsl))",
            backgroundColor: "hsl(var(--muted-bg-hsl))"
          }}>
            <span style={{ fontSize: "0.85rem", color: "hsl(var(--muted-hsl))" }}>
              Showing Page <strong style={{ color: "hsl(var(--foreground-hsl))" }}>{page}</strong> of <strong style={{ color: "hsl(var(--foreground-hsl))" }}>{data.total_pages}</strong> ({data.total_items} items)
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={page <= 1}
                style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={page >= data.total_pages}
                style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
