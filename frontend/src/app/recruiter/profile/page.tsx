"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface AdminUser {
  id: string;
  recruiter_reference: string;
  email: string;
  full_name: string;
  mobile: string;
  status: string;
  created_at: string;
}

export default function RecruiterProfile() {
  const { user, isAdmin } = useAuth();
  
  const [adminsList, setAdminsList] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [adminsError, setAdminsError] = useState("");

  // Grant Admin Form State
  const [grantUserId, setGrantUserId] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [grantSuccess, setGrantSuccess] = useState("");

  // Remove Admin Form State
  const [removing, setRemoving] = useState<string | null>(null);

  // Manage Recruiter Company Access State
  interface RecruiterUser {
    id: string;
    name: string;
    email: string;
    recruiter_reference: string;
    access_level: string;
  }
  const [recruiterUsers, setRecruiterUsers] = useState<RecruiterUser[]>([]);
  const [selectedRecruiterId, setSelectedRecruiterId] = useState("");
  const [companiesList, setCompaniesList] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [accessSuccess, setAccessSuccess] = useState("");

  const selectedRecruiter = recruiterUsers.find(r => r.id === selectedRecruiterId);
  const isSelectedAdmin = selectedRecruiter?.access_level === "ADMIN";

  const fetchAdmins = async () => {
    setLoadingAdmins(true);
    setAdminsError("");
    try {
      const data = await api.get<AdminUser[]>("/api/v1/recruiter/admins");
      setAdminsList(data);
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      setAdminsError(error.detail || "Failed to load admin roster list.");
    } finally {
      setLoadingAdmins(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    if (isAdmin) {
      api.get<RecruiterUser[]>("/api/v1/recruiter/users")
        .then(data => setRecruiterUsers(data))
        .catch(err => console.error("Failed to load recruiter users", err));
      api.get<{ id: string; name: string }[]>("/api/v1/auth/companies?is_tenant=true")
        .then(data => setCompaniesList(data))
        .catch(err => console.error("Failed to load companies list", err));
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedRecruiterId) {
      setSelectedCompanies([]);
      setAccessSuccess("");
      setAccessError("");
      return;
    }
    setLoadingAccess(true);
    setAccessSuccess("");
    setAccessError("");
    api.get<string[]>(`/api/v1/recruiter/users/${selectedRecruiterId}/companies`)
      .then(data => setSelectedCompanies(data))
      .catch(err => {
        const error = err as { detail?: string; status?: number };
        setAccessError(error.detail || "Failed to load recruiter company access.");
      })
      .finally(() => setLoadingAccess(false));
  }, [selectedRecruiterId]);

  const handleSaveAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecruiterId) return;
    setSavingAccess(true);
    setAccessSuccess("");
    setAccessError("");

    const payloadCompanies = selectedCompanies;

    try {
      await api.post(`/api/v1/recruiter/users/${selectedRecruiterId}/companies`, payloadCompanies);
      setAccessSuccess("Recruiter company access updated successfully.");
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      setAccessError(error.detail || "Failed to save company access.");
    } finally {
      setSavingAccess(false);
    }
  };

  const handleAccessCompanyToggle = (companyId: string, checked: boolean) => {
    if (checked) {
      setSelectedCompanies(prev => [...prev, companyId]);
    } else {
      setSelectedCompanies(prev => prev.filter(id => id !== companyId));
    }
  };

  const handleGrantAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantError("");
    setGrantSuccess("");
    setGranting(true);

    const ref = grantUserId.trim().toUpperCase();

    // Basic client-side format validation
    if (!ref || !/^RU\d{3,}$/.test(ref)) {
      setGrantError("Enter a valid Recruiter User ID, for example RU001.");
      setGranting(false);
      return;
    }

    try {
      await api.post(`/api/v1/recruiter/admins/${ref}/grant`);
      setGrantSuccess("Standard Recruiter promoted to Admin successfully.");
      setGrantUserId("");
      await fetchAdmins();
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      if (error.status === 409) {
        setGrantError("Promotion locked: Maximum limit of two active Administrators has been reached.");
      } else {
        setGrantError(error.detail || "Failed to grant administrator privileges.");
      }
    } finally {
      setGranting(false);
    }
  };

  const handleRemoveAdmin = async (recruiterReference: string) => {
    if (!confirm("Are you sure you want to demote this Administrator? They will lose access to administrative panels.")) return;
    
    setRemoving(recruiterReference);
    try {
      await api.post(`/api/v1/recruiter/admins/${recruiterReference}/remove`);
      alert("Administrator demoted successfully.");
      await fetchAdmins();
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      alert(error.detail || "Failed to remove administrator privileges.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem", maxWidth: "900px" }}>
      {/* Page header */}
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Profile &amp; Administrator Settings</h1>
        <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          Manage your account parameters and view the internal VMS administrator roster.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5rem", alignItems: "start" }}>
        {/* Left pane: User details and Roster */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* User profile card */}
          <div style={{
            backgroundColor: "hsl(var(--card-hsl))",
            border: "1px solid hsl(var(--card-border-hsl))",
            borderRadius: "var(--radius-lg)",
            padding: "2rem",
            boxShadow: "var(--shadow-sm)"
          }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1.25rem", borderBottom: "1px solid hsl(var(--card-border-hsl))", paddingBottom: "0.5rem" }}>
              My Account Profile
            </h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.9rem" }}>
              <div>
                <span style={{ fontSize: "0.8rem", color: "hsl(var(--muted-hsl))" }}>Email Address</span>
                <div style={{ fontWeight: 600, marginTop: "0.15rem" }}>{user?.email}</div>
              </div>
              <div>
                <span style={{ fontSize: "0.8rem", color: "hsl(var(--muted-hsl))" }}>Recruiter User ID</span>
                <div style={{ fontWeight: 600, marginTop: "0.15rem" }}>{user?.recruiter_reference}</div>
              </div>
              <div>
                <span style={{ fontSize: "0.8rem", color: "hsl(var(--muted-hsl))" }}>Access Privilege Scope</span>
                <div style={{ marginTop: "0.25rem" }}>
                  <span style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px",
                    backgroundColor: isAdmin ? "rgba(220, 38, 38, 0.1)" : "rgba(37, 99, 235, 0.1)",
                    color: isAdmin ? "hsl(var(--danger-hsl))" : "hsl(var(--primary-hsl))"
                  }}>{user?.access_level}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Roster List */}
          <div style={{
            backgroundColor: "hsl(var(--card-hsl))",
            border: "1px solid hsl(var(--card-border-hsl))",
            borderRadius: "var(--radius-lg)",
            padding: "2rem",
            boxShadow: "var(--shadow-sm)"
          }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
              Active Administrator Roster ({adminsList.length}/2)
            </h2>

            {adminsError && (
              <div style={{ padding: "0.5rem", backgroundColor: "hsl(var(--danger-bg-hsl))", color: "hsl(var(--danger-hsl))", fontSize: "0.8rem", borderRadius: "4px" }}>
                {adminsError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
              {loadingAdmins ? (
                Array.from({ length: 2 }).map((_, idx) => <Skeleton key={idx} height="50px" />)
              ) : (
                adminsList.map((adm) => (
                  <div key={adm.id} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "hsl(var(--background-hsl))",
                    border: "1px solid hsl(var(--card-border-hsl))"
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                      <strong style={{ fontSize: "0.9rem" }}>{adm.full_name}</strong>
                      <span style={{ fontSize: "0.75rem", color: "hsl(var(--muted-hsl))" }}>{adm.email}</span>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "hsl(var(--muted-hsl))" }}>
                        Recruiter User ID: {adm.recruiter_reference}
                      </span>
                    </div>

                    {/* Enable demotion if current user is admin, but do not allow demoting themselves */}
                    {isAdmin && adm.recruiter_reference !== user?.recruiter_reference && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveAdmin(adm.recruiter_reference)}
                        disabled={removing === adm.recruiter_reference}
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", color: "hsl(var(--danger-hsl))", borderColor: "rgba(220, 38, 38, 0.2)" }}
                      >
                        Demote
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right pane: Admin action panel (Visible only to Administrators) */}
        {isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
            <div style={{
              backgroundColor: "hsl(var(--card-hsl))",
              border: "1px solid hsl(var(--card-border-hsl))",
              borderRadius: "var(--radius-lg)",
              padding: "2rem",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem"
            }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                Administrator Tools
              </h2>
              <p style={{ fontSize: "0.85rem", color: "hsl(var(--muted-hsl))", lineHeight: "1.4" }}>
                Promote a standard recruiter to Administrator. The database will block the promotion if the roster limit (maximum 2 active) is exceeded.
              </p>

              {grantSuccess && (
                <div style={{ padding: "0.75rem", backgroundColor: "hsl(var(--success-bg-hsl))", color: "hsl(var(--success-hsl))", borderRadius: "4px", fontSize: "0.85rem" }}>
                  {grantSuccess}
                </div>
              )}

              {grantError && (
                <div style={{ padding: "0.75rem", backgroundColor: "hsl(var(--danger-bg-hsl))", color: "hsl(var(--danger-hsl))", borderRadius: "4px", fontSize: "0.85rem" }}>
                  {grantError}
                </div>
              )}

              <form onSubmit={handleGrantAdmin} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "0.5rem" }}>
                <Input
                  label="Recruiter User ID"
                  type="text"
                  placeholder="Enter RU001..."
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  required
                />

                <Button type="submit" loading={granting} style={{ width: "100%" }}>
                  Promote to Admin
                </Button>
              </form>
            </div>

            {/* Recruiter Company Access Management Card */}
            <div style={{
              backgroundColor: "hsl(var(--card-hsl))",
              border: "1px solid hsl(var(--card-border-hsl))",
              borderRadius: "var(--radius-lg)",
              padding: "2rem",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem"
            }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                Recruiter Company Access
              </h2>
              <p style={{ fontSize: "0.85rem", color: "hsl(var(--muted-hsl))", lineHeight: "1.4" }}>
                Select a Recruiter and choose the companies they are authorized to access.
              </p>

              {accessSuccess && (
                <div style={{ padding: "0.75rem", backgroundColor: "hsl(var(--success-bg-hsl))", color: "hsl(var(--success-hsl))", borderRadius: "4px", fontSize: "0.85rem" }}>
                  {accessSuccess}
                </div>
              )}

              {accessError && (
                <div style={{ padding: "0.75rem", backgroundColor: "hsl(var(--danger-bg-hsl))", color: "hsl(var(--danger-hsl))", borderRadius: "4px", fontSize: "0.85rem" }}>
                  {accessError}
                </div>
              )}

              <form onSubmit={handleSaveAccess} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label htmlFor="recruiter-select" style={{ fontSize: "0.875rem", fontWeight: 600 }}>Select Recruiter</label>
                  <select
                    id="recruiter-select"
                    value={selectedRecruiterId}
                    onChange={(e) => setSelectedRecruiterId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "hsl(var(--background-hsl))",
                      border: "1px solid hsl(var(--card-border-hsl))",
                      color: "hsl(var(--foreground-hsl))",
                      fontSize: "0.9rem"
                    }}
                  >
                    <option value="">-- Select Recruiter --</option>
                    {recruiterUsers.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.recruiter_reference}) [{r.access_level}]</option>
                    ))}
                  </select>
                </div>

                {selectedRecruiterId && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                      <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>Company Access List</label>
                      {loadingAccess ? (
                        <Skeleton height="30px" />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {companiesList.map(c => (
                            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem" }}>
                              <input
                                type="checkbox"
                                checked={selectedCompanies.includes(c.id)}
                                onChange={(e) => handleAccessCompanyToggle(c.id, e.target.checked)}
                                style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "hsl(var(--primary-hsl))" }}
                              />
                              <span>{c.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button type="submit" loading={savingAccess} style={{ width: "100%", marginTop: "0.5rem" }}>
                      Save Access Changes
                    </Button>
                  </>
                )}
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
