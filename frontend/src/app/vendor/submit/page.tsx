"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, APIError } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

interface Department {
  id: string;
  name: string;
  status: string;
}

interface JobRole {
  id: string;
  department_id: string;
  title: string;
  job_id: string;
  status: string;
  vendor_id?: string;
  company_name?: string;
}

const reqLabel = (text: string) => (
  <span>
    {text} <span style={{ color: "hsl(var(--danger-hsl))", fontWeight: 700 }}>*</span>
  </span>
);

export default function SubmitCandidate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, setActiveVendorId } = useAuth();

  // Pre-selected job context (when navigated from job-roles page)
  interface PreselectedJob {
    role_id: string;
    job_id: string;
    dept_id: string;
    title: string;
    dept: string;
    vendor_id?: string | null;
    company?: string | null;
  }
  const [preselectedJob, setPreselectedJob] = useState<PreselectedJob | null>(null);

  // Form State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [jobId, setJobId] = useState("");
  
  const [cvSentDate, setCvSentDate] = useState(new Date().toISOString().split("T")[0]);
  const [employmentMode, setEmploymentMode] = useState<string>("Perm");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [totalExperience, setTotalExperience] = useState("");
  const [relevantExperience, setRelevantExperience] = useState("");
  const [noticePeriod, setNoticePeriod] = useState<string>("30");
  const [ctc, setCtc] = useState("");
  const [ectc, setEctc] = useState("");
  const [currentLocation, setCurrentLocation] = useState("");
  const [preferredLocation, setPreferredLocation] = useState("");
  const [pan, setPan] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [education, setEducation] = useState("");
  const [about, setAbout] = useState("");
  
  // Resume state
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState<"IDLE" | "UPLOADING" | "SCANNING" | "ELIGIBLE" | "FAILED" | "INFECTED">("IDLE");
  const [scanError, setScanError] = useState("");
  
  // PAN Duplicate Check
  interface PANAdvisory {
    pan_fingerprint: string;
    exists: boolean;
    can_submit: boolean;
    status: string;
    message: string;
    eligible_date: string | null;
  }
  const [panAdvisory, setPanAdvisory] = useState<PANAdvisory | null>(null);
  const [checkingPan, setCheckingPan] = useState(false);
  
  // Submission Lifecycle
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Initialize Idempotency Key
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  // Read pre-selected job context from query params (Flow B: from job-roles page)
  useEffect(() => {
    const role_id = searchParams.get("role_id");
    const job_id = searchParams.get("job_id");
    const dept_id = searchParams.get("dept_id");
    const title = searchParams.get("title");
    const dept = searchParams.get("dept");
    const vendor_id = searchParams.get("vendor_id");
    const company = searchParams.get("company");

    if (role_id && job_id && dept_id && title && dept) {
      if (preselectedJob?.role_id !== role_id || preselectedJob?.vendor_id !== vendor_id) {
        const ctx: PreselectedJob = { role_id, job_id, dept_id, title, dept, vendor_id, company };
        setPreselectedJob(ctx);
        setSelectedDeptId(dept_id);
        setSelectedRoleId(role_id);
        setJobId(job_id);
        if (vendor_id && user?.activeVendorId !== vendor_id) {
          setActiveVendorId(vendor_id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Fetch Departments on Mount
  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const data = await api.get<Department[]>("/api/v1/departments");
        setDepartments(data);
      } catch (err) {
        console.error("Failed to load departments", err);
      }
    };
    fetchDepts();
  }, []);

  // Fetch Roles when Selected Department changes (skip reset when in pre-selected mode)
  useEffect(() => {
    const fetchRoles = async () => {
      if (!selectedDeptId) {
        setRoles([]);
        if (!preselectedJob) {
          setSelectedRoleId("");
          setJobId("");
        }
        return;
      }
      try {
        const data = await api.get<JobRole[]>(`/api/v1/job-roles?department_id=${selectedDeptId}`);
        setRoles(data);
        if (preselectedJob) {
          // If we have a preselected job, ensure its role_id and job_id are populated in state
          setSelectedRoleId(preselectedJob.role_id);
          setJobId(preselectedJob.job_id);
        } else {
          setSelectedRoleId("");
          setJobId("");
        }
      } catch (err) {
        console.error("Failed to load job roles", err);
      }
    };
    fetchRoles();
  }, [selectedDeptId, preselectedJob]);

  // Auto-populate Job ID when Target Job Role is selected (skip when in pre-selected mode)
  useEffect(() => {
    if (preselectedJob) return; // Job ID already set from query params
    if (!selectedRoleId) {
      setJobId("");
      return;
    }
    const role = roles.find((r) => r.id === selectedRoleId);
    if (role) {
      setJobId(role.job_id);
    } else {
      setJobId("");
    }
  }, [selectedRoleId, roles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced PAN Advisory Duplicate Check (Exactly 10 characters)
  useEffect(() => {
    const checkPan = async () => {
      const cleanPan = pan.trim();
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
      
      if (cleanPan.length === 10 && panRegex.test(cleanPan)) {
        setCheckingPan(true);
        setPanAdvisory(null);
        try {
          const res = await api.post<PANAdvisory>("/api/v1/pan/check", {
            pan: cleanPan,
            role_id: selectedRoleId || undefined
          });
          setPanAdvisory(res);
        } catch (err) {
          console.error("PAN check failed", err);
        } finally {
          setCheckingPan(false);
        }
      } else {
        setPanAdvisory(null);
      }
    };

    const timer = setTimeout(checkPan, 300);
    return () => clearTimeout(timer);
  }, [pan, selectedRoleId]);

  // File selection and private upload trigger
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type !== "application/pdf") {
      setScanError("Only PDF files are allowed.");
      setScanStatus("FAILED");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setScanError("File size exceeds the 10MB limit.");
      setScanStatus("FAILED");
      return;
    }

    setResumeFile(file);
    setScanError("");
    setScanStatus("UPLOADING");
    setUploadProgress(20);

    const formData = new FormData();
    formData.append("file", file);
    const currentRoleId = preselectedJob?.role_id || selectedRoleId;
    if (currentRoleId) {
      formData.append("role_id", currentRoleId);
    }

    try {
      // Upload Resume File
      const response = await api.post<{ resume_id?: string; id?: string }>("/api/v1/resumes", formData);
      const resId = response.resume_id || response.id || "";
      setResumeId(resId);
      setUploadProgress(100);
      setScanStatus("SCANNING");
      
      // Start Background Scan Polling
      pollResumeStatus(resId);
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      setScanError(error?.detail || "Resume upload failed. Please try again.");
      setScanStatus("FAILED");
    }
  };

  // Poll status of uploaded resume
  const pollResumeStatus = (id: string) => {
    let intervalId: NodeJS.Timeout | null = null;

    const checkStatus = async () => {
      try {
        const res = await api.get<{ malware_scan_state: string; processing_state: string; eligibility_state: string }>(`/api/v1/resumes/${id}/status`);
        
        if (res?.malware_scan_state === "INFECTED") {
          setScanStatus("INFECTED");
          setScanError("Security gate failure: Malware detected. Resume rejected.");
          if (intervalId) clearInterval(intervalId);
        } else if (res?.processing_state === "FAILED" || res?.eligibility_state === "INELIGIBLE") {
          setScanStatus("FAILED");
          setScanError("Resume parsing failed. Please complete details manually.");
          if (intervalId) clearInterval(intervalId);
        } else if (res?.eligibility_state === "ELIGIBLE") {
          setScanStatus("ELIGIBLE");
          if (intervalId) clearInterval(intervalId);
        }
      } catch (err) {
        const error = err as { detail?: string; status?: number };
        setScanStatus("FAILED");
        setScanError(error?.detail || "Failed to verify resume scanning status.");
        if (intervalId) clearInterval(intervalId);
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 1500);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess(false);
    
    const errors: Record<string, string> = {};

    // 1. Mandatory Resume Check
    if (!resumeId || scanStatus !== "ELIGIBLE") {
      setSubmitError("Please upload a verified PDF resume.");
      return;
    }

    // 2. Client-Side Mandatory Field Validation
    if (!selectedDeptId || !selectedDeptId.trim()) {
      errors.department_id = "Target Department is required.";
    }
    if (!selectedRoleId || !selectedRoleId.trim()) {
      errors.role_id = "Target Job Role is required.";
    }
    if (!jobId || !jobId.trim()) {
      errors.job_id = "Job ID is required.";
    }
    if (!cvSentDate || !cvSentDate.trim()) {
      errors.cv_sent_date = "CV Sent Date is required.";
    }
    if (!employmentMode || !employmentMode.trim()) {
      errors.employment_mode = "Employment Mode is required.";
    }
    if (!name || !name.trim()) {
      errors.name = "Candidate Full Name is required.";
    }
    if (!email || !email.trim()) {
      errors.email = "Email Address is required.";
    }
    if (!contactNumber || !contactNumber.trim()) {
      errors.contact_number = "Contact Number is required.";
    }
    if (!currentCompany || !currentCompany.trim()) {
      errors.current_company = "Current Company is required.";
    }
    if (!totalExperience || !totalExperience.trim()) {
      errors.total_experience = "Total Experience is required.";
    }
    if (!relevantExperience || !relevantExperience.trim()) {
      errors.relevant_experience = "Relevant Experience is required.";
    }
    if (totalExperience && relevantExperience && parseFloat(relevantExperience) > parseFloat(totalExperience)) {
      errors.relevant_experience = "Relevant experience cannot exceed total experience.";
    }
    if (!noticePeriod || !noticePeriod.trim()) {
      errors.notice_period = "Notice Period is required.";
    }
    if (!ctc || !ctc.trim()) {
      errors.ctc = "CTC is required.";
    }
    if (!ectc || !ectc.trim()) {
      errors.ectc = "Expected CTC is required.";
    }
    if (!currentLocation || !currentLocation.trim()) {
      errors.current_location = "Current Location is required.";
    }
    if (!preferredLocation || !preferredLocation.trim()) {
      errors.preferred_location = "Preferred Location is required.";
    }
    if (!pan || !pan.trim()) {
      errors.pan = "PAN Card Number is required.";
    }
    if (!linkedinUrl || !linkedinUrl.trim()) {
      errors.linkedin_url = "LinkedIn Profile URL is required.";
    }
    if (!education || !education.trim()) {
      errors.education = "Education details are required.";
    }
    if (!about || !about.trim()) {
      errors.about = "About the Candidate is required.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstError = Object.values(errors)[0];
      setSubmitError(firstError || "Please complete all required fields.");
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    const payload = {
      vendor_id: preselectedJob ? preselectedJob.vendor_id : roles.find(r => r.id === selectedRoleId)?.vendor_id,
      cv_sent_date: cvSentDate.trim(),
      employment_mode: employmentMode.trim(),
      role_id: selectedRoleId.trim(),
      job_id: jobId.trim(),
      name: name.trim(),
      email: email.trim(),
      contact_number: contactNumber.trim(),
      current_company: currentCompany.trim(),
      total_experience: parseFloat(totalExperience),
      relevant_experience: parseFloat(relevantExperience),
      notice_period: noticePeriod.trim(),
      ctc: parseFloat(ctc),
      ectc: parseFloat(ectc),
      current_location: currentLocation.trim(),
      preferred_location: preferredLocation.trim(),
      pan: pan.trim().toUpperCase(),
      linkedin_url: linkedinUrl.trim(),
      education: education.trim(),
      about: about.trim(),
      resume_id: resumeId
    };

    try {
      await api.post("/api/v1/submissions", payload, {
        idempotencyKey
      });

      setSubmitSuccess(true);
      setTimeout(() => {
        router.push("/vendor/dashboard");
      }, 1500);
    } catch (err) {
      const error = err as APIError;
      if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
        setFieldErrors(error.fieldErrors);
        setSubmitError("Please correct the highlighted fields before submitting.");
      } else {
        setSubmitError(error.detail || "Submission failed. Please check inputs and retry.");
      }
      if (error.status === 409 || error.status === 400) {
        setIdempotencyKey(crypto.randomUUID());
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "900px" }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Submit Candidate</h1>
        <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          Submit a new candidate profile against an active job role. All fields marked with <span style={{ color: "hsl(var(--danger-hsl))", fontWeight: 700 }}>*</span> are mandatory.
        </p>
      </div>

        <div style={{
          padding: "0.75rem 1rem",
          backgroundColor: "rgba(37, 99, 235, 0.05)",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(37, 99, 235, 0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem"
        }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "hsl(var(--foreground-hsl))" }}>
            Submitting on behalf of company:
          </span>
          {preselectedJob ? (
            <span style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "4px",
              border: "1px solid hsl(var(--card-border-hsl))",
              backgroundColor: "hsl(var(--muted-bg-hsl))",
              fontWeight: 700,
              fontSize: "0.875rem",
              color: "hsl(var(--foreground-hsl))",
              cursor: "not-allowed"
            }}>
              {preselectedJob.company || user?.activeCompanyName}
            </span>
          ) : (
            <span style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "4px",
              border: "1px solid hsl(var(--card-border-hsl))",
              backgroundColor: "hsl(var(--muted-bg-hsl))",
              fontWeight: 700,
              fontSize: "0.875rem",
              color: "hsl(var(--foreground-hsl))",
              cursor: "not-allowed"
            }}>
              {roles.find((r) => r.id === selectedRoleId)?.company_name || "Select Job Role First"}
            </span>
          )}
        </div>

      {submitSuccess && (
        <div style={{
          padding: "1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "hsl(var(--success-bg-hsl))",
          color: "hsl(var(--success-hsl))",
          fontWeight: 500,
          border: "1px solid rgba(16, 185, 129, 0.2)"
        }}>
          Candidate submitted successfully! Redirecting to dashboard...
        </div>
      )}

      {submitError && (
        <div style={{
          padding: "1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "hsl(var(--danger-bg-hsl))",
          color: "hsl(var(--danger-hsl))",
          fontSize: "0.9rem",
          border: "1px solid rgba(220, 38, 38, 0.2)"
        }}>
          {submitError}
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "2rem"
      }}>
        {/* Step 1: Resume Upload Widget */}
        <div style={{
          backgroundColor: "hsl(var(--card-hsl))",
          border: "1px solid hsl(var(--card-border-hsl))",
          borderRadius: "var(--radius-lg)",
          padding: "2rem",
          boxShadow: "var(--shadow-sm)"
        }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
            1. PDF Resume Upload <span style={{ color: "hsl(var(--danger-hsl))", fontWeight: 700 }}>*</span>
          </h2>
          
          <div style={{
            border: "2px dashed hsl(var(--card-border-hsl))",
            borderRadius: "var(--radius-md)",
            padding: "2.5rem",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: "hsl(var(--background-hsl))",
            position: "relative"
          }}>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: "pointer"
              }}
              disabled={scanStatus === "UPLOADING" || scanStatus === "SCANNING"}
            />
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "hsl(var(--muted-hsl))", marginBottom: "0.75rem" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p style={{ fontSize: "0.9rem", fontWeight: 500 }}>
              {resumeFile ? resumeFile.name : "Select private PDF Resume (Max 10MB)"}
            </p>
            <p style={{ fontSize: "0.75rem", color: "hsl(var(--muted-hsl))", marginTop: "0.25rem" }}>
              Only PDF resumes are processed under sandboxed validation gates
            </p>
          </div>

          {/* Upload and Scan Progress States */}
          {scanStatus !== "IDLE" && (
            <div style={{ marginTop: "1.25rem" }}>
              {scanStatus === "UPLOADING" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ height: "6px", backgroundColor: "hsl(var(--muted-bg-hsl))", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ width: `${uploadProgress}%`, height: "100%", backgroundColor: "hsl(var(--primary-hsl))", transition: "width 0.2s ease" }} />
                  </div>
                </div>
              )}
              {scanStatus === "SCANNING" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "hsl(var(--warning-hsl))", fontSize: "0.875rem" }}>
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 30" />
                  </svg>
                  <span>Scanning for malware & processing... Please wait.</span>
                </div>
              )}
              {scanStatus === "ELIGIBLE" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "hsl(var(--success-hsl))", fontSize: "0.875rem", fontWeight: 600 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Resume verified and eligible for submission!</span>
                </div>
              )}
              {(scanStatus === "FAILED" || scanStatus === "INFECTED") && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "hsl(var(--danger-hsl))", fontSize: "0.875rem" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{scanError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Role and Candidate Form */}
        <form onSubmit={handleFormSubmit} style={{
          backgroundColor: "hsl(var(--card-hsl))",
          border: "1px solid hsl(var(--card-border-hsl))",
          borderRadius: "var(--radius-lg)",
          padding: "2rem",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem"
        }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>2. Candidate Information</h2>

          {/* Department, Job Role, Job ID */}
          {preselectedJob ? (
            /* Flow B: Pre-selected from Job Roles page — render as locked read-only fields */
            <div style={{
              padding: "1rem 1.25rem",
              backgroundColor: "rgba(37, 99, 235, 0.05)",
              border: "1px solid rgba(37, 99, 235, 0.2)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem"
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "hsl(var(--primary-hsl))", marginBottom: "0.25rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Job Context — Pre-selected (read-only)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "hsl(var(--muted-hsl))", fontWeight: 500, marginBottom: "0.3rem" }}>Target Department</div>
                  <div style={{
                    padding: "0.4rem 0.75rem",
                    backgroundColor: "hsl(var(--muted-bg-hsl))",
                    border: "1px solid hsl(var(--card-border-hsl))",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "hsl(var(--foreground-hsl))",
                    cursor: "not-allowed"
                  }}>
                    {preselectedJob.dept}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "hsl(var(--muted-hsl))", fontWeight: 500, marginBottom: "0.3rem" }}>Target Job Role</div>
                  <div style={{
                    padding: "0.4rem 0.75rem",
                    backgroundColor: "hsl(var(--muted-bg-hsl))",
                    border: "1px solid hsl(var(--card-border-hsl))",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "hsl(var(--foreground-hsl))",
                    cursor: "not-allowed"
                  }}>
                    {preselectedJob.title}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "hsl(var(--muted-hsl))", fontWeight: 500, marginBottom: "0.3rem" }}>Job ID</div>
                  <div style={{
                    padding: "0.4rem 0.75rem",
                    backgroundColor: "hsl(var(--muted-bg-hsl))",
                    border: "1px solid hsl(var(--card-border-hsl))",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    letterSpacing: "0.04em",
                    color: "hsl(var(--foreground-hsl))",
                    cursor: "not-allowed"
                  }}>
                    {preselectedJob.job_id}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: "0.5rem", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem", alignItems: "end" }}>
                <Input
                  label={reqLabel("CV Sent Date")}
                  type="date"
                  value={cvSentDate}
                  onChange={(e) => setCvSentDate(e.target.value)}
                  required
                  error={fieldErrors.cv_sent_date}
                />
              </div>
            </div>
          ) : (
            /* Flow A: Direct access — normal interactive dropdowns */
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Select
                  label={reqLabel("Target Department")}
                  options={departments.map(d => ({ value: d.id, label: d.name }))}
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  placeholder="Select Department"
                  required
                  error={fieldErrors.department_id}
                />
                <Select
                  label={reqLabel("Target Job Role")}
                  options={roles.map(r => ({ value: r.id, label: r.title }))}
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  placeholder="Select Role"
                  required
                  disabled={!selectedDeptId}
                  error={fieldErrors.role_id}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Input
                  id="job-id"
                  label={reqLabel("Job ID")}
                  type="text"
                  placeholder="Auto-populated upon selecting Job Role"
                  value={jobId}
                  readOnly
                  style={{ backgroundColor: "hsl(var(--muted-bg-hsl))", cursor: "not-allowed" }}
                  required
                  error={fieldErrors.job_id}
                />
                <Input
                  label={reqLabel("CV Sent Date")}
                  type="date"
                  value={cvSentDate}
                  onChange={(e) => setCvSentDate(e.target.value)}
                  required
                  error={fieldErrors.cv_sent_date}
                />
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Select
              label={reqLabel("Employment Mode")}
              options={[
                { value: "Perm", label: "Perm" },
                { value: "C2H", label: "C2H" }
              ]}
              value={employmentMode}
              onChange={(e) => setEmploymentMode(e.target.value)}
              required
              error={fieldErrors.employment_mode}
            />
            <Input
              label={reqLabel("Candidate Full Name")}
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              error={fieldErrors.name}
            />
          </div>

          {/* Candidate profile */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Input
              label={reqLabel("Email Address")}
              type="email"
              placeholder="john@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              error={fieldErrors.email}
            />
            <Input
              label={reqLabel("Contact Number (Indian Mobile)")}
              type="tel"
              placeholder="9876543210"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              required
              error={fieldErrors.contact_number}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Input
              label={reqLabel("Current Company")}
              type="text"
              placeholder="Infosys / Wipro / Self-employed"
              value={currentCompany}
              onChange={(e) => setCurrentCompany(e.target.value)}
              required
              error={fieldErrors.current_company}
            />
            <Input
              label={reqLabel("Total Experience (Years)")}
              type="number"
              step="0.1"
              min="0"
              placeholder="5.5"
              value={totalExperience}
              onChange={(e) => setTotalExperience(e.target.value)}
              required
              error={fieldErrors.total_experience}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Input
              label={reqLabel("Relevant Experience (Years)")}
              type="number"
              step="0.1"
              min="0"
              placeholder="4.0"
              value={relevantExperience}
              onChange={(e) => setRelevantExperience(e.target.value)}
              required
              error={fieldErrors.relevant_experience}
            />
            <Select
              label={reqLabel("Notice Period")}
              options={[
                { value: "Immediate", label: "Immediate" },
                { value: "15", label: "15 Days" },
                { value: "30", label: "30 Days" },
                { value: "45", label: "45 Days" },
                { value: "60", label: "60 Days" },
                { value: "90", label: "90 Days" }
              ]}
              value={noticePeriod}
              onChange={(e) => setNoticePeriod(e.target.value)}
              required
              error={fieldErrors.notice_period}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Input
              label={reqLabel("CTC (LPA)")}
              type="number"
              step="0.01"
              min="0"
              placeholder="8.50"
              value={ctc}
              onChange={(e) => setCtc(e.target.value)}
              required
              error={fieldErrors.ctc}
            />
            <Input
              label={reqLabel("Expected CTC (LPA)")}
              type="number"
              step="0.01"
              min="0"
              placeholder="12.00"
              value={ectc}
              onChange={(e) => setEctc(e.target.value)}
              required
              error={fieldErrors.ectc}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Input
              label={reqLabel("Current Location")}
              type="text"
              placeholder="Bangalore"
              value={currentLocation}
              onChange={(e) => setCurrentLocation(e.target.value)}
              required
              error={fieldErrors.current_location}
            />
            <Input
              label={reqLabel("Preferred Location")}
              type="text"
              placeholder="Bangalore / Hyderabad"
              value={preferredLocation}
              onChange={(e) => setPreferredLocation(e.target.value)}
              required
              error={fieldErrors.preferred_location}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
              <Input
                label={reqLabel("PAN Card Number")}
                type="text"
                placeholder="ABCDE1234F"
                maxLength={10}
                value={pan}
                onChange={(e) => setPan(e.target.value)}
                required
                error={fieldErrors.pan}
              />
              {checkingPan && <span style={{ fontSize: "0.75rem", color: "hsl(var(--warning-hsl))" }}>Verifying duplicate status...</span>}
              {panAdvisory && (
                <span style={{
                  fontSize: "0.75rem",
                  color: panAdvisory.can_submit ? "hsl(var(--success-hsl))" : "hsl(var(--danger-hsl))",
                  fontWeight: 600,
                  marginTop: "0.25rem"
                }}>
                  {panAdvisory.message}
                </span>
              )}
            </div>

            <Input
              label={reqLabel("LinkedIn Profile URL")}
              type="url"
              placeholder="https://linkedin.com/in/username"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              required
              error={fieldErrors.linkedin_url}
            />
          </div>

          <Input
            label={reqLabel("Education details")}
            type="text"
            placeholder="B.Tech in Computer Science / BCA"
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            required
            error={fieldErrors.education}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="about-the-candidate" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
              About the Candidate <span style={{ color: "hsl(var(--danger-hsl))", fontWeight: 700 }}>*</span>
            </label>
            <textarea
              id="about-the-candidate"
              rows={4}
              placeholder="Provide a brief summary of candidate background and key skill sets."
              style={{
                fontFamily: "inherit",
                fontSize: "0.875rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: fieldErrors.about ? "1px solid hsl(var(--danger-hsl))" : "1px solid hsl(var(--card-border-hsl))",
                backgroundColor: "hsl(var(--card-hsl))",
                color: "hsl(var(--foreground-hsl))"
              }}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              required
            />
            {fieldErrors.about && <span style={{ color: "hsl(var(--danger-hsl))", fontSize: "0.75rem", marginTop: "0.25rem", fontWeight: 500 }}>{fieldErrors.about}</span>}
          </div>

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "1rem",
            borderTop: "1px solid hsl(var(--card-border-hsl))",
            paddingTop: "1.5rem"
          }}>
            <span style={{ fontSize: "0.75rem", color: "hsl(var(--muted-hsl))", fontFamily: "monospace" }}>
              Idempotency: {idempotencyKey.slice(0, 8)}...
            </span>
            <Button
              type="submit"
              disabled={scanStatus !== "ELIGIBLE" || submitting}
              loading={submitting}
            >
              Submit Candidate Profile
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
