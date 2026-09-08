"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/AuthContext";

interface VendorMembership {
  id: string;
  vendor_id: string;
  company_name: string;
  status: string;
}

interface VendorUser {
  id: string;
  email: string;
  name: string;
  mobile: string;
  status: string;
  companies: VendorMembership[];
  created_at: string;
}

export default function VendorUsersManagement() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<VendorUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Provisioning form states
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(["IOSYS"]);
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [provisionError, setProvisionError] = useState("");

  const resetForm = () => {
    setSelectedCompanies(["IOSYS"]);
    setCompanyName("");
    setName("");
    setEmail("");
    setMobile("");
    setPassword("");
    setProvisionError("");
  };

  const handleCompanyToggle = (company: string, checked: boolean) => {
    if (checked) {
      setSelectedCompanies((prev) => [...prev, company]);
    } else {
      setSelectedCompanies((prev) => prev.filter((c) => c !== company));
    }
  };

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCompanies.length === 0) {
      setProvisionError("Please select at least one company to authorize.");
      return;
    }
    setProvisionLoading(true);
    setProvisionError("");
    try {
      await api.post<VendorUser>("/api/v1/recruiter/vendor-users", {
        company_name: companyName.trim() || undefined,
        companies: selectedCompanies,
        name,
        email,
        mobile,
        password
      });
      alert("Vendor user provisioned successfully.");
      setIsProvisionOpen(false);
      resetForm();
      fetchUsers();
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      setProvisionError(error.detail || "Failed to provision vendor user.");
    } finally {
      setProvisionLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<VendorUser[]>("/api/v1/recruiter/vendor-users");
      setUsers(data);
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      setError(error.detail || "Failed to load vendor users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDisableMembership = async (userId: string, vendorId: string, companyName: string) => {
    if (!confirm(`Are you sure you want to disable ${companyName} access for this user?`)) return;
    try {
      await api.post(`/api/v1/recruiter/vendor-users/${userId}/memberships/${vendorId}/disable`);
      setUsers(users.map((u) => {
        if (u.id !== userId) return u;
        return {
          ...u,
          companies: (u.companies || []).map((m) => m.vendor_id === vendorId ? { ...m, status: "DISABLED" } : m)
        };
      }));
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      alert(error.detail || "Failed to disable company membership.");
    }
  };

  const handleReactivateMembership = async (userId: string, vendorId: string) => {
    try {
      await api.post(`/api/v1/recruiter/vendor-users/${userId}/memberships/${vendorId}/reactivate`);
      setUsers(users.map((u) => {
        if (u.id !== userId) return u;
        return {
          ...u,
          companies: (u.companies || []).map((m) => m.vendor_id === vendorId ? { ...m, status: "ACTIVE" } : m)
        };
      }));
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      alert(error.detail || "Failed to reactivate company membership.");
    }
  };

  const handleDisable = async (id: string) => {
    if (!confirm("Are you sure you want to disable this vendor user? They will be locked out of the portal.")) return;
    try {
      await api.post<{ detail: string }>(`/api/v1/recruiter/vendor-users/${id}/disable`);
      setUsers(users.map(u => u.id === id ? { ...u, status: "DISABLED" } : u));
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      alert(error.detail || "Failed to disable vendor user.");
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.post<{ detail: string }>(`/api/v1/recruiter/vendor-users/${id}/reactivate`);
      setUsers(users.map(u => u.id === id ? { ...u, status: "ACTIVE" } : u));
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      alert(error.detail || "Failed to reactivate vendor user.");
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Vendor Users Management</h1>
          <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
            Monitor, inspect, and toggle active status permissions for vendor representatives and company memberships.
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" onClick={() => { resetForm(); setIsProvisionOpen(true); }}>
            Provision Vendor User
          </Button>
        )}
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
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Representative Name</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Login Email</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Mobile Number</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Company Memberships</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Account Status</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="140px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="180px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="220px" /></td>
                    <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="60px" /></td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}><Skeleton width="80px" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "hsl(var(--muted-hsl))" }}>
                    No vendor users provisioned in the system.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                    <td style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>{u.name}</td>
                    <td style={{ padding: "1rem 1.5rem" }}>{u.email}</td>
                    <td style={{ padding: "1rem 1.5rem" }}>{u.mobile}</td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {(u.companies && u.companies.length > 0) ? (
                          u.companies.map((m) => (
                            <div key={m.id || m.vendor_id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{
                                padding: "0.15rem 0.4rem",
                                borderRadius: "4px",
                                backgroundColor: m.company_name.toUpperCase() === "IOSYS" ? "rgba(44, 219, 163, 0.15)" : "rgba(30, 99, 233, 0.1)",
                                color: m.company_name.toUpperCase() === "IOSYS" ? "#1F4E47" : "#1E63E9",
                                border: `1px solid ${m.company_name.toUpperCase() === "IOSYS" ? "rgba(31, 78, 71, 0.2)" : "rgba(30, 99, 233, 0.15)"}`,
                                fontWeight: 700,
                                fontSize: "0.8rem",
                                textTransform: m.company_name.toUpperCase() === "IOSYS" ? "uppercase" : "none",
                              }}>
                                {m.company_name.toUpperCase() === "IOSYS" ? "IOSYS" : "Volantis"}
                              </span>
                              <span style={getStatusBadgeStyle(m.status)}>{m.status}</span>
                              {isAdmin && (
                                (m.status === "ACTIVE" || m.status === "APPROVED") ? (
                                  <button
                                    onClick={() => handleDisableMembership(u.id, m.vendor_id, m.company_name)}
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "hsl(var(--danger-hsl))",
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      textDecoration: "underline"
                                    }}
                                  >
                                    Disable
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleReactivateMembership(u.id, m.vendor_id)}
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "hsl(var(--success-hsl))",
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      textDecoration: "underline"
                                    }}
                                  >
                                    Reactivate
                                  </button>
                                )
                              )}
                            </div>
                          ))
                        ) : (
                          <span style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.8rem" }}>No memberships</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "1rem 1.5rem" }}>
                      <span style={getStatusBadgeStyle(u.status)}>{u.status}</span>
                    </td>
                    <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}>
                      {u.status === "ACTIVE" ? (
                        <Button variant="danger" size="sm" onClick={() => handleDisable(u.id)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>
                          Disable Account
                        </Button>
                      ) : (
                        <Button variant="primary" size="sm" onClick={() => handleReactivate(u.id)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>
                          Reactivate Account
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provision Vendor User Modal */}
      <Modal
        isOpen={isProvisionOpen}
        onClose={() => setIsProvisionOpen(false)}
        title="Provision Vendor User"
      >
        <form onSubmit={handleProvision} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {provisionError && (
            <div style={{ padding: "0.75rem 1rem", backgroundColor: "hsl(var(--danger-bg-hsl))", color: "hsl(var(--danger-hsl))", borderRadius: "4px", fontSize: "0.9rem" }}>
              {provisionError}
            </div>
          )}
          <Input
            label="Vendor Agency Name"
            type="text"
            placeholder="e.g. ABC Staffing"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={100}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Select Vendor Companies <span style={{ color: "hsl(var(--danger-hsl))" }}>*</span>
            </label>
            <div style={{ display: "flex", gap: "1.5rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem" }}>
                <input
                  type="checkbox"
                  checked={selectedCompanies.includes("IOSYS")}
                  onChange={(e) => handleCompanyToggle("IOSYS", e.target.checked)}
                />
                <span>IOSYS</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem" }}>
                <input
                  type="checkbox"
                  checked={selectedCompanies.includes("Volantis")}
                  onChange={(e) => handleCompanyToggle("Volantis", e.target.checked)}
                />
                <span>Volantis</span>
              </label>
            </div>
          </div>

          <Input
            label="Representative Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            placeholder="e.g. John Doe"
          />
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="e.g. representative@company.com"
          />
          <Input
            label="Mobile Number (with country code)"
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            required
            placeholder="+91 9988776655"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={50}
            placeholder="Min 8 characters"
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <Button type="button" variant="outline" onClick={() => setIsProvisionOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={provisionLoading}>
              Provision User
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
