"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface RecruiterSignupRequest {
  id: string;
  full_name: string;
  email: string;
  mobile: string;
  status: string;
  requested_at: string;
  requested_companies?: string[];
}

interface VendorSignupRequest {
  id: string;
  company_name: string;
  requested_companies?: string[];
  existing_companies?: string[];
  user_name: string;
  email: string;
  mobile: string;
  status: string;
  created_at: string;
}

export default function ApprovalsQueue() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"recruiter" | "vendor">("recruiter");
  const [recruiterRequests, setRecruiterRequests] = useState<RecruiterSignupRequest[]>([]);
  const [vendorRequests, setVendorRequests] = useState<VendorSignupRequest[]>([]);
  const [companiesList, setCompaniesList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Guard routing - redirect standard recruiters
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push("/recruiter/candidates");
    }
  }, [isAdmin, authLoading, router]);

  const fetchRequests = async () => {
    setLoading(true);
    setError("");
    try {
      const [recData, venData, comps] = await Promise.all([
        api.get<RecruiterSignupRequest[]>("/api/v1/recruiter/recruiter-signup-requests"),
        api.get<VendorSignupRequest[]>("/api/v1/recruiter/vendor-signup-requests"),
        api.get<{ id: string; name: string }[]>("/api/v1/auth/companies")
      ]);
      setRecruiterRequests(recData.filter(r => r.status === "PENDING"));
      setVendorRequests(venData.filter(v => v.status === "PENDING"));
      setCompaniesList(comps);
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setError(errorObj.detail || "Failed to load signup requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchRequests();
    }
  }, [isAdmin]);

  const handleApproveRecruiter = async (id: string) => {
    try {
      await api.post(`/api/v1/recruiter/recruiter-signup-requests/${id}/approve`, {});
      setRecruiterRequests(prev => prev.filter(r => r.id !== id));
      alert("Recruiter request approved successfully.");
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to approve recruiter request.");
    }
  };

  const handleRejectRecruiter = async (id: string) => {
    if (!confirm("Are you sure you want to reject this signup request?")) return;
    try {
      await api.post(`/api/v1/recruiter/recruiter-signup-requests/${id}/reject`, {});
      setRecruiterRequests(prev => prev.filter(r => r.id !== id));
      alert("Recruiter request rejected.");
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to reject recruiter request.");
    }
  };

  const handleApproveVendor = async (id: string) => {
    try {
      await api.post(`/api/v1/recruiter/vendor-signup-requests/${id}/approve`, {});
      setVendorRequests(prev => prev.filter(v => v.id !== id));
      alert("Vendor user request approved successfully.");
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to approve vendor request.");
    }
  };

  const handleRejectVendor = async (id: string) => {
    if (!confirm("Are you sure you want to reject this vendor signup request?")) return;
    try {
      await api.post(`/api/v1/recruiter/vendor-signup-requests/${id}/reject`, {});
      setVendorRequests(prev => prev.filter(v => v.id !== id));
      alert("Vendor user request rejected.");
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      alert(errorObj.detail || "Failed to reject vendor request.");
    }
  };

  if (authLoading || !isAdmin) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "50vh" }}>
        <span>Checking permissions...</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Signup Approvals</h1>
          <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
            Review and verify pending Recruiter and Vendor User signup requests.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div style={{ padding: "1rem", backgroundColor: "hsl(var(--danger-bg-hsl))", color: "hsl(var(--danger-hsl))", borderRadius: "8px" }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))", paddingBottom: "0.5rem" }}>
        <button
          onClick={() => setActiveTab("recruiter")}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.9rem",
            fontWeight: activeTab === "recruiter" ? 600 : 500,
            color: activeTab === "recruiter" ? "hsl(var(--primary-hsl))" : "hsl(var(--muted-hsl))",
            borderBottom: activeTab === "recruiter" ? "2px solid hsl(var(--primary-hsl))" : "2px solid transparent",
            backgroundColor: "transparent",
            cursor: "pointer",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          Recruiter Requests
          <span style={{
            backgroundColor: activeTab === "recruiter" ? "hsl(var(--primary-hsl))" : "hsl(var(--muted-bg-hsl, #e2e8f0))",
            color: activeTab === "recruiter" ? "#fff" : "hsl(var(--muted-hsl))",
            borderRadius: "9999px",
            padding: "0.1rem 0.45rem",
            fontSize: "0.75rem",
            fontWeight: 700
          }}>
            {recruiterRequests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("vendor")}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.9rem",
            fontWeight: activeTab === "vendor" ? 600 : 500,
            color: activeTab === "vendor" ? "hsl(var(--primary-hsl))" : "hsl(var(--muted-hsl))",
            borderBottom: activeTab === "vendor" ? "2px solid hsl(var(--primary-hsl))" : "2px solid transparent",
            backgroundColor: "transparent",
            cursor: "pointer",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          Vendor User Requests
          <span style={{
            backgroundColor: activeTab === "vendor" ? "hsl(var(--primary-hsl))" : "hsl(var(--muted-bg-hsl, #e2e8f0))",
            color: activeTab === "vendor" ? "#fff" : "hsl(var(--muted-hsl))",
            borderRadius: "9999px",
            padding: "0.1rem 0.45rem",
            fontSize: "0.75rem",
            fontWeight: 700
          }}>
            {vendorRequests.length}
          </span>
        </button>
      </div>

      {/* Requests table */}
      <div style={{
        backgroundColor: "hsl(var(--card-hsl))",
        border: "1px solid hsl(var(--card-border-hsl))",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden"
      }}>
        <div style={{ overflowX: "auto" }}>
          {activeTab === "recruiter" ? (
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "0.9rem"
            }}>
              <thead>
                <tr style={{
                  backgroundColor: "hsl(var(--muted-bg-hsl, rgba(0,0,0,0.02)))",
                  borderBottom: "1px solid hsl(var(--card-border-hsl))"
                }}>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Full Name</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Requested Companies</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Email Address</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Mobile Number</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Submitted At</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="120px" /></td>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="150px" /></td>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="180px" /></td>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="100px" /></td>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="120px" /></td>
                      <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}><Skeleton width="120px" /></td>
                    </tr>
                  ))
                ) : recruiterRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "3.5rem", textAlign: "center", color: "hsl(var(--muted-hsl))" }}>
                      No pending recruiter signup requests at this time.
                    </td>
                  </tr>
                ) : (
                  recruiterRequests.map((req) => (
                    <tr key={req.id} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                      <td style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>{req.full_name}</td>
                      <td style={{ padding: "1rem 1.5rem" }}>
                        {req.requested_companies && req.requested_companies.length > 0 ? (
                          req.requested_companies.map(cid => {
                            const comp = companiesList.find(c => c.id === cid);
                            return comp ? comp.name : "Unknown";
                          }).join(", ")
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "1rem 1.5rem" }}>{req.email}</td>
                      <td style={{ padding: "1rem 1.5rem" }}>{req.mobile}</td>
                      <td style={{ padding: "1rem 1.5rem", color: "hsl(var(--muted-hsl))", fontSize: "0.85rem" }}>
                        {new Date(req.requested_at).toLocaleString()}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                          <Button variant="outline" size="sm" onClick={() => handleRejectRecruiter(req.id)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", color: "hsl(var(--danger-hsl))", borderColor: "hsl(var(--card-border-hsl))" }}>
                            Reject
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => handleApproveRecruiter(req.id)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>
                            Approve
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "0.9rem"
            }}>
              <thead>
                <tr style={{
                  backgroundColor: "hsl(var(--muted-bg-hsl, rgba(0,0,0,0.02)))",
                  borderBottom: "1px solid hsl(var(--card-border-hsl))"
                }}>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Full Name</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Company</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Email Address</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Mobile Number</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Submitted At</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="120px" /></td>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="140px" /></td>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="180px" /></td>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="100px" /></td>
                      <td style={{ padding: "1rem 1.5rem" }}><Skeleton width="120px" /></td>
                      <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}><Skeleton width="120px" /></td>
                    </tr>
                  ))
                ) : vendorRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "3.5rem", textAlign: "center", color: "hsl(var(--muted-hsl))" }}>
                      No pending vendor user signup requests at this time.
                    </td>
                  </tr>
                ) : (
                  vendorRequests.map((req) => (
                    <tr key={req.id} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                      <td style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>{req.user_name}</td>
                      <td style={{ padding: "1rem 1.5rem" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                            {((req.requested_companies && req.requested_companies.length > 0) ? req.requested_companies : [req.company_name]).map((c) => {
                              const comp = companiesList.find(company => company.id === c);
                              const displayName = comp ? comp.name : (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) ? "Unknown" : c);
                              return (
                                <span key={c} style={{
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "4px",
                                  backgroundColor: "rgba(37, 99, 235, 0.1)",
                                  color: "hsl(var(--primary-hsl))",
                                  fontWeight: 600,
                                  fontSize: "0.8rem"
                                }}>
                                  {displayName}
                                </span>
                              );
                            })}
                          </div>
                          {req.existing_companies && req.existing_companies.length > 0 && (
                            <span style={{ fontSize: "0.75rem", color: "hsl(var(--muted-hsl))" }}>
                              Existing access: {req.existing_companies.join(", ")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "1rem 1.5rem" }}>{req.email}</td>
                      <td style={{ padding: "1rem 1.5rem" }}>{req.mobile}</td>
                      <td style={{ padding: "1rem 1.5rem", color: "hsl(var(--muted-hsl))", fontSize: "0.85rem" }}>
                        {new Date(req.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                          <Button variant="outline" size="sm" onClick={() => handleRejectVendor(req.id)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", color: "hsl(var(--danger-hsl))", borderColor: "hsl(var(--card-border-hsl))" }}>
                            Reject
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => handleApproveVendor(req.id)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>
                            Approve
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
