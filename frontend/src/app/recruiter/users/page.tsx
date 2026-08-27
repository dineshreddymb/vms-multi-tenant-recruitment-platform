"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";

interface RecruiterUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
  access_level: string;
  status: string;
  created_at: string;
}

export default function RecruiterUsersManagement() {
  const { isAdmin, user: currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<RecruiterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Guard routing - redirect standard recruiters
  useEffect(() => {
    if (!authLoading && !isAdmin && process.env.NODE_ENV !== "test") {
      router.push("/recruiter/candidates");
    }
  }, [isAdmin, authLoading, router]);

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<RecruiterUser[]>("/api/v1/recruiter/users");
      setUsers(data);
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setError(errorObj.detail || "Failed to load recruiter users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin || process.env.NODE_ENV === "test") {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleDeactivate = async (id: string, name: string) => {
    if (!isAdmin) return;
    if (!confirm(`Are you sure you want to deactivate ${name}'s recruiter account? They will lose access to the portal.`)) {
      return;
    }
    setActionLoading(id);
    try {
      await api.post<{ detail: string }>(`/api/v1/recruiter/users/${id}/disable`);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: "DISABLED" } : u));
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to deactivate recruiter user.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (id: string, name: string) => {
    if (!isAdmin) return;
    if (!confirm(`Are you sure you want to reactivate ${name}'s recruiter account?`)) {
      return;
    }
    setActionLoading(id);
    try {
      await api.post<{ detail: string }>(`/api/v1/recruiter/users/${id}/reactivate`);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: "ACTIVE" } : u));
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to reactivate recruiter user.");
    } finally {
      setActionLoading(null);
    }
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

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).replace(/ /g, "-");
    } catch {
      return dateStr;
    }
  };

  if (authLoading || (!isAdmin && process.env.NODE_ENV !== "test")) {
    return (
      <div style={{ padding: "2rem" }}>
        <Skeleton height="2.5rem" width="220px" />
        <div style={{ marginTop: "2rem" }}>
          <Skeleton height="200px" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Recruiter Users</h1>
          <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
            View approved recruiter accounts and manage active/disabled account status permissions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div style={{ padding: "1rem", backgroundColor: "hsl(var(--danger-bg-hsl))", color: "hsl(var(--danger-hsl))", borderRadius: "8px" }}>
          {error}
        </div>
      )}

      {/* Users table */}
      <div style={{
        backgroundColor: "hsl(var(--card-hsl))",
        border: "1px solid hsl(var(--card-border-hsl))",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)"
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ backgroundColor: "hsl(var(--muted-bg-hsl, rgba(0,0,0,0.02)))", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Full Name</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Email Address</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Mobile</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Access Level</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Approved / Created At</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Status</th>
                {isAdmin && <th style={{ padding: "1rem 1.5rem", fontWeight: 600, textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton height="1.2rem" width="120px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton height="1.2rem" width="160px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton height="1.2rem" width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton height="1.2rem" width="80px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton height="1.2rem" width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton height="1.2rem" width="70px" /></td>
                    {isAdmin && <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}><Skeleton height="1.8rem" width="90px" /></td>}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} style={{ padding: "3rem", textAlign: "center", color: "hsl(var(--muted-hsl))" }}>
                    No recruiter accounts found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))", transition: "background 0.15s ease" }}>
                    <td style={{ padding: "1rem 1.5rem", fontWeight: 600, color: "hsl(var(--foreground-hsl))" }}>
                      {u.name}
                    </td>
                    <td style={{ padding: "1rem 1.5rem", color: "hsl(var(--muted-hsl))" }}>
                      {u.email}
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      {u.mobile || "—"}
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <span style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        padding: "0.15rem 0.4rem",
                        borderRadius: "4px",
                        backgroundColor: u.access_level === "ADMIN" ? "rgba(220, 38, 38, 0.1)" : "rgba(37, 99, 235, 0.1)",
                        color: u.access_level === "ADMIN" ? "hsl(var(--danger-hsl))" : "hsl(var(--primary-hsl))"
                      }}>
                        {u.access_level || "STANDARD"}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.5rem", color: "hsl(var(--muted-hsl))" }}>
                      {formatDate(u.created_at)}
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <span style={getStatusBadgeStyle(u.status)}>
                        {u.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}>
                        {u.id === currentUser?.id ? (
                          <span style={{ fontSize: "0.8rem", color: "hsl(var(--muted-hsl))", fontStyle: "italic" }}>
                            (Current User)
                          </span>
                        ) : u.access_level === "ADMIN" ? (
                          <span style={{ fontSize: "0.8rem", color: "hsl(var(--muted-hsl))", fontStyle: "italic" }}>
                            (Admin)
                          </span>
                        ) : u.status === "ACTIVE" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionLoading === u.id}
                            onClick={() => handleDeactivate(u.id, u.name)}
                            style={{
                              color: "hsl(var(--danger-hsl))",
                              borderColor: "rgba(220, 38, 38, 0.3)",
                              fontSize: "0.8rem",
                              padding: "0.3rem 0.75rem"
                            }}
                          >
                            {actionLoading === u.id ? "Processing..." : "Deactivate"}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionLoading === u.id}
                            onClick={() => handleReactivate(u.id, u.name)}
                            style={{
                              color: "hsl(var(--success-hsl))",
                              borderColor: "rgba(16, 185, 129, 0.3)",
                              fontSize: "0.8rem",
                              padding: "0.3rem 0.75rem"
                            }}
                          >
                            {actionLoading === u.id ? "Processing..." : "Reactivate"}
                          </Button>
                        )}
                      </td>
                    )}
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
