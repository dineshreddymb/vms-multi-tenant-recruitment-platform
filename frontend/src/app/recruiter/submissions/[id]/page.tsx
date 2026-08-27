"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface Candidate {
  id: string;
  name: string;
  email: string;
  contact_number: string;
  current_company: string;
  total_experience: string;
  relevant_experience: string;
  notice_period: string;
  ctc: string;
  ectc: string;
  current_location: string;
  preferred_location: string;
  pan_masked: string;
  linkedin_url: string;
  education: string;
  about: string;
  created_at: string;
}

interface Role {
  id: string;
  department_id: string;
  title: string;
  job_id?: string;
  status: string;
}

interface SubmissionDetail {
  id: string;
  status: string;
  cv_sent_date: string;
  employment_mode: string;
  job_id?: string | null;
  created_at: string;
  role: Role;
  candidate: Candidate;
  vendor_name: string;
  resume_id: string;
}

interface HistoryItem {
  id: string;
  status: string;
  reason: string | null;
  changed_by_name: string;
  changed_at: string;
}

export default function CandidateDetail() {
  const { id } = useParams();
  const router = useRouter();
  const submissionId = id as string;

  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit Fields State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editTotalExp, setEditTotalExp] = useState("");
  const [editRelExp, setEditRelExp] = useState("");
  const [editNotice, setEditNotice] = useState<string>("Immediate");
  const [editCtc, setEditCtc] = useState("");
  const [editEctc, setEditEctc] = useState("");
  const [editCurrLoc, setEditCurrLoc] = useState("");
  const [editPrefLoc, setEditPrefLoc] = useState("");
  const [editLinkedIn, setEditLinkedIn] = useState("");
  const [editEducation, setEditEducation] = useState("");
  const [editAbout, setEditAbout] = useState("");
  const [editSentDate, setEditSentDate] = useState("");
  const [editMode, setEditMode] = useState<string>("Perm");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Status transitions
  const [statusReason, setStatusReason] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  // PAN Reveal state
  const [revealedPan, setRevealedPan] = useState("");
  const [revealingPan, setRevealingPan] = useState(false);

  const fetchDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<SubmissionDetail>(`/api/v1/recruiter/submissions/${submissionId}`);
      setDetail(data);
      
      // Populate edits
      setEditName(data.candidate.name);
      setEditEmail(data.candidate.email);
      setEditContact(data.candidate.contact_number);
      setEditCompany(data.candidate.current_company);
      setEditTotalExp(data.candidate.total_experience);
      setEditRelExp(data.candidate.relevant_experience);
      setEditNotice(data.candidate.notice_period);
      setEditCtc(data.candidate.ctc);
      setEditEctc(data.candidate.ectc);
      setEditCurrLoc(data.candidate.current_location);
      setEditPrefLoc(data.candidate.preferred_location);
      setEditLinkedIn(data.candidate.linkedin_url);
      setEditEducation(data.candidate.education);
      setEditAbout(data.candidate.about);
      setEditSentDate(data.cv_sent_date);
      setEditMode(data.employment_mode);

      // Load status history logs
      const historyLogs = await api.get<HistoryItem[]>(`/api/v1/recruiter/submissions/${submissionId}/history`);
      setHistory(historyLogs);
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      // Concealment 404 handler
      if (error.status === 404) {
        setError("The requested submission details were not found or access is restricted.");
      } else {
        setError(error.detail || "Failed to load submission details.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [submissionId]);

  // Reveal PAN action
  const handleRevealPan = async () => {
    if (revealedPan) {
      setRevealedPan(""); // hide
      return;
    }
    setRevealingPan(true);
    try {
      const res = await api.post<{ pan: string }>(`/api/v1/recruiter/submissions/${submissionId}/reveal-pan`);
      setRevealedPan(res.pan);
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      alert(error.detail || "Failed to decrypt candidate PAN. Check permissions.");
    } finally {
      setRevealingPan(false);
    }
  };

  // Download PDF Resume action
  const handleDownloadResume = async () => {
    if (!detail) return;
    try {
      const blob = await api.get<Blob>(`/api/v1/resumes/${detail.resume_id}/download`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Resume_${detail.candidate.name.replace(/\s+/g, "_")}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      if (error.status === 403) {
        alert("Access Denied: Resume is undergoing security scans or failed verification.");
      } else {
        alert("Failed to download resume file.");
      }
    }
  };

  // Submit edits
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");
    
    if (parseFloat(editRelExp) > parseFloat(editTotalExp)) {
      setEditError("Relevant experience cannot exceed total experience.");
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await api.patch<SubmissionDetail>(`/api/v1/recruiter/submissions/${submissionId}`, {
        name: editName,
        email: editEmail,
        contact_number: editContact,
        current_company: editCompany,
        total_experience: parseFloat(editTotalExp),
        relevant_experience: parseFloat(editRelExp),
        notice_period: editNotice,
        ctc: parseFloat(editCtc),
        ectc: parseFloat(editEctc),
        current_location: editCurrLoc,
        preferred_location: editPrefLoc,
        linkedin_url: editLinkedIn,
        education: editEducation,
        about: editAbout,
        cv_sent_date: editSentDate,
        employment_mode: editMode
      });
      setDetail(updated);
      setIsEditing(false);
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      setEditError(error.detail || "Failed to save edits.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Transition workflow status
  const handleStatusTransition = async (nextStatus: string) => {
    setStatusError("");
    
    if (nextStatus === "REJECTED" && !statusReason.trim()) {
      setStatusError("A rejection reason is mandatory when rejecting a candidate.");
      return;
    }

    setUpdatingStatus(true);
    try {
      const updated = await api.patch<SubmissionDetail>(`/api/v1/recruiter/submissions/${submissionId}/status`, {
        status: nextStatus,
        reason: nextStatus === "REJECTED" ? statusReason : undefined
      });
      setDetail(updated);
      setStatusReason("");
      
      // Reload history logs
      const historyLogs = await api.get<HistoryItem[]>(`/api/v1/recruiter/submissions/${submissionId}/history`);
      setHistory(historyLogs);
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      setStatusError(error.detail || "Failed to progress workflow status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Allowed next status checks
  const getAllowedStatuses = (current: string) => {
    switch (current) {
      case "SUBMITTED":
        return ["SCREENING", "REJECTED"];
      case "SCREENING":
        return ["INTERVIEW", "REJECTED"];
      case "INTERVIEW":
        return ["SELECTED", "REJECTED"];
      case "SELECTED":
        return ["ONBOARDED", "REJECTED"];
      default:
        return [];
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Skeleton width="300px" height="35px" />
        <Skeleton width="100%" height="400px" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: "1.5rem",
        borderRadius: "var(--radius-md)",
        backgroundColor: "hsl(var(--danger-bg-hsl))",
        color: "hsl(var(--danger-hsl))",
        fontSize: "0.95rem",
        border: "1px solid rgba(220, 38, 38, 0.2)"
      }}>
        {error}
        <div style={{ marginTop: "1rem" }}>
          <Button variant="outline" onClick={() => router.push("/recruiter/candidates")}>
            &larr; Back to Candidates
          </Button>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const allowedNext = getAllowedStatuses(detail.status);
  const isTerminal = detail.status === "ONBOARDED" || detail.status === "REJECTED";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Top back banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={() => router.push("/recruiter/candidates")}
          style={{
            background: "none",
            border: "none",
            color: "hsl(var(--primary-hsl))",
            fontWeight: 500,
            fontSize: "0.9rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          &larr; Back to Candidates List
        </button>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          {!isEditing && (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Edit Profile
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadResume}>
            Download Resume PDF
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2.5rem", alignItems: "start" }}>
        {/* Left Side: Candidate Profile details / Form edit */}
        <div style={{
          backgroundColor: "hsl(var(--card-hsl))",
          border: "1px solid hsl(var(--card-border-hsl))",
          borderRadius: "var(--radius-lg)",
          padding: "2rem",
          boxShadow: "var(--shadow-sm)"
        }}>
          {isEditing ? (
            <form onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, borderBottom: "1px solid hsl(var(--card-border-hsl))", paddingBottom: "0.75rem" }}>
                Edit Candidate Profile
              </h2>

              {editError && (
                <div style={{ padding: "0.75rem 1rem", backgroundColor: "hsl(var(--danger-bg-hsl))", color: "hsl(var(--danger-hsl))", borderRadius: "4px" }}>
                  {editError}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Input label="Candidate Name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                <Input label="Email Address" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Input label="Contact Number" value={editContact} onChange={(e) => setEditContact(e.target.value)} required />
                <Input label="Current Company" value={editCompany} onChange={(e) => setEditCompany(e.target.value)} required />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Input label="Total Experience (Yrs)" type="number" step="0.1" value={editTotalExp} onChange={(e) => setEditTotalExp(e.target.value)} required />
                <Input label="Relevant Experience (Yrs)" type="number" step="0.1" value={editRelExp} onChange={(e) => setEditRelExp(e.target.value)} required />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                <Select
                  label="Notice Period"
                  options={[
                    { value: "Immediate", label: "Immediate" },
                    { value: "15", label: "15 Days" },
                    { value: "30", label: "30 Days" },
                    { value: "45", label: "45 Days" },
                    { value: "60", label: "60 Days" },
                    { value: "90", label: "90 Days" }
                  ]}
                  value={editNotice}
                  onChange={(e) => setEditNotice(e.target.value)}
                />
                <Input label="CTC (LPA)" type="number" step="0.01" value={editCtc} onChange={(e) => setEditCtc(e.target.value)} required />
                <Input label="Expected CTC (LPA)" type="number" step="0.01" value={editEctc} onChange={(e) => setEditEctc(e.target.value)} required />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Input label="Current Location" value={editCurrLoc} onChange={(e) => setEditCurrLoc(e.target.value)} required />
                <Input label="Preferred Location" value={editPrefLoc} onChange={(e) => setEditPrefLoc(e.target.value)} required />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Input label="CV Sent Date" type="date" value={editSentDate} onChange={(e) => setEditSentDate(e.target.value)} required />
                <Select
                  label="Employment Mode"
                  options={[
                    { value: "Perm", label: "Perm" },
                    { value: "C2H", label: "C2H" }
                  ]}
                  value={editMode}
                  onChange={(e) => setEditMode(e.target.value)}
                />
              </div>

              <Input label="LinkedIn URL" type="url" value={editLinkedIn} onChange={(e) => setEditLinkedIn(e.target.value)} required />
              <Input label="Education details" value={editEducation} onChange={(e) => setEditEducation(e.target.value)} required />

              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>About the Candidate</label>
                <textarea
                  rows={4}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "0.875rem",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid hsl(var(--card-border-hsl))"
                  }}
                  value={editAbout}
                  onChange={(e) => setEditAbout(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={savingEdit}>
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {/* Header profile details */}
              <div style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))", paddingBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ fontSize: "1.75rem", fontWeight: 800 }}>{detail.candidate.name}</h2>
                    <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.95rem", marginTop: "0.25rem" }}>
                      {detail.candidate.current_company} &bull; {detail.role.title} &bull; Job ID: <strong>{detail.job_id || detail.role.job_id || "-"}</strong> ({detail.employment_mode})
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "0.8rem", color: "hsl(var(--muted-hsl))" }}>Submitted by</span>
                    <strong style={{ fontSize: "0.95rem", color: "hsl(var(--foreground-hsl))" }}>{detail.vendor_name}</strong>
                  </div>
                </div>
              </div>

              {/* Core Details Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                <div>
                  <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "hsl(var(--muted-hsl))", marginBottom: "0.375rem" }}>Contact Details</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.9rem" }}>
                    <span>Email: <strong>{detail.candidate.email}</strong></span>
                    <span>Mobile: <strong>{detail.candidate.contact_number}</strong></span>
                    <span>LinkedIn: <a href={detail.candidate.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(var(--primary-hsl))", textDecoration: "underline" }}>View Profile</a></span>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "hsl(var(--muted-hsl))", marginBottom: "0.375rem" }}>PAN Card Card Details</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "1rem", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                      {revealedPan ? revealedPan : detail.candidate.pan_masked}
                    </strong>
                    <Button variant="outline" size="sm" onClick={handleRevealPan} loading={revealingPan} style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}>
                      {revealedPan ? "Hide" : "Reveal"}
                    </Button>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.5rem", borderTop: "1px solid hsl(var(--card-border-hsl))", paddingTop: "1.5rem" }}>
                <div>
                  <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "hsl(var(--muted-hsl))", marginBottom: "0.25rem" }}>Experience</h3>
                  <div style={{ fontSize: "0.95rem" }}>Total: <strong>{detail.candidate.total_experience} Yrs</strong></div>
                  <div style={{ fontSize: "0.85rem", color: "hsl(var(--muted-hsl))" }}>Relevant: {detail.candidate.relevant_experience} Yrs</div>
                </div>
                <div>
                  <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "hsl(var(--muted-hsl))", marginBottom: "0.25rem" }}>Notice Period</h3>
                  <div style={{ fontSize: "0.95rem" }}>
                    <strong>{detail.candidate.notice_period === "Immediate" ? "Immediate" : `${detail.candidate.notice_period} Days`}</strong>
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "hsl(var(--muted-hsl))", marginBottom: "0.25rem" }}>Salary Details</h3>
                  <div style={{ fontSize: "0.95rem" }}>CTC: <strong>{detail.candidate.ctc} LPA</strong></div>
                  <div style={{ fontSize: "0.85rem", color: "hsl(var(--muted-hsl))" }}>ECTC: {detail.candidate.ectc} LPA</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.5rem", borderTop: "1px solid hsl(var(--card-border-hsl))", paddingTop: "1.5rem" }}>
                <div>
                  <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "hsl(var(--muted-hsl))", marginBottom: "0.25rem" }}>Location</h3>
                  <div style={{ fontSize: "0.95rem" }}>Current: <strong>{detail.candidate.current_location}</strong></div>
                  <div style={{ fontSize: "0.85rem", color: "hsl(var(--muted-hsl))" }}>Preferred: {detail.candidate.preferred_location}</div>
                </div>
                <div>
                  <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "hsl(var(--muted-hsl))", marginBottom: "0.25rem" }}>Education Details</h3>
                  <div style={{ fontSize: "0.95rem" }}><strong>{detail.candidate.education}</strong></div>
                </div>
                <div>
                  <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "hsl(var(--muted-hsl))", marginBottom: "0.25rem" }}>Submission Details</h3>
                  <div style={{ fontSize: "0.95rem" }}>CV Sent Date: <strong>{detail.cv_sent_date}</strong></div>
                  <div style={{ fontSize: "0.85rem", color: "hsl(var(--muted-hsl))" }}>Mode: {detail.employment_mode}</div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid hsl(var(--card-border-hsl))", paddingTop: "1.5rem" }}>
                <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "hsl(var(--muted-hsl))", marginBottom: "0.5rem" }}>About the Candidate</h3>
                <p style={{ fontSize: "0.95rem", lineHeight: "1.6", whiteSpace: "pre-line" }}>{detail.candidate.about}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Workflow Progress State Machine & timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Status Progression Card */}
          <div style={{
            backgroundColor: "hsl(var(--card-hsl))",
            border: "1px solid hsl(var(--card-border-hsl))",
            borderRadius: "var(--radius-lg)",
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)"
          }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Current Status</h3>
            <span style={{
              display: "inline-block",
              padding: "0.25rem 0.6rem",
              borderRadius: "4px",
              fontSize: "0.8rem",
              fontWeight: 700,
              backgroundColor: "hsl(var(--muted-bg-hsl))",
              margin: "0.5rem 0 1.25rem 0"
            }}>{detail.status}</span>

            {/* Transition controller actions */}
            {!isTerminal ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "hsl(var(--muted-hsl))" }}>Transition actions:</div>
                
                {statusError && (
                  <div style={{ fontSize: "0.75rem", color: "hsl(var(--danger-hsl))", fontWeight: 500 }}>
                    {statusError}
                  </div>
                )}

                {/* Render input reason if REJECTED is selectable or selected */}
                {allowedNext.includes("REJECTED") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Rejection Reason (Mandatory for rejection)</label>
                    <input
                      type="text"
                      placeholder="Enter rejection reason here..."
                      style={{
                        padding: "0.375rem 0.5rem",
                        fontSize: "0.8rem",
                        borderRadius: "4px",
                        border: "1px solid hsl(var(--card-border-hsl))",
                        backgroundColor: "hsl(var(--card-hsl))"
                      }}
                      value={statusReason}
                      onChange={(e) => setStatusReason(e.target.value)}
                    />
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {allowedNext.map((statusOpt) => {
                    const isReject = statusOpt === "REJECTED";
                    return (
                      <Button
                        key={statusOpt}
                        variant={isReject ? "danger" : "primary"}
                        onClick={() => handleStatusTransition(statusOpt)}
                        loading={updatingStatus}
                        style={{ width: "100%", padding: "0.5rem", fontSize: "0.85rem" }}
                      >
                        {isReject ? "Reject Candidate" : `Progress to ${statusOpt}`}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{
                fontSize: "0.85rem",
                color: "hsl(var(--muted-hsl))",
                padding: "0.75rem",
                backgroundColor: "hsl(var(--background-hsl))",
                borderRadius: "var(--radius-md)",
                textAlign: "center"
              }}>
                Candidate is in a terminal status workflow state: <strong>{detail.status}</strong>. Reopening is not supported.
              </div>
            )}
          </div>

          {/* Status Timeline logs */}
          <div style={{
            backgroundColor: "hsl(var(--card-hsl))",
            border: "1px solid hsl(var(--card-border-hsl))",
            borderRadius: "var(--radius-lg)",
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)"
          }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Workflow Logs</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", position: "relative" }}>
              {history.map((log) => (
                <div key={log.id} style={{ display: "flex", gap: "0.75rem", position: "relative" }}>
                  {/* Timeline bullet dot */}
                  <div style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: "hsl(var(--primary-hsl))",
                    marginTop: "4px",
                    zIndex: 2
                  }} />
                  
                  {/* Log description */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", fontSize: "0.8rem" }}>
                    <span style={{ fontWeight: 700 }}>{log.status}</span>
                    <span style={{ color: "hsl(var(--muted-hsl))" }}>
                      By {log.changed_by_name} &bull; {new Date(log.changed_at).toLocaleString()}
                    </span>
                    {log.reason && (
                      <span style={{
                        marginTop: "0.25rem",
                        padding: "0.25rem 0.5rem",
                        backgroundColor: "hsl(var(--muted-bg-hsl))",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        color: "hsl(var(--foreground-hsl))"
                      }}>
                        Reason: {log.reason}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
