"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";

interface Candidate {
  id: string;
  name: string;
  email: string;
  contact_number: string;
  current_company: string;
  total_experience: number;
  relevant_experience: number;
  notice_period: string;
  ctc: number;
  ectc: number;
  current_location: string;
  preferred_location: string;
  pan_masked: string;
  linkedin_url: string;
  education: string;
  about: string;
  created_at: string;
}

interface RoleInfo {
  id: string;
  department_id: string;
  title: string;
  job_id?: string;
  status: string;
}

interface SubmissionItem {
  id: string;
  status: string;
  cv_sent_date: string;
  employment_mode: string;
  job_id?: string | null;
  created_at: string;
  role: RoleInfo;
  candidate: Candidate;
  vendor_name: string;
  submitting_vendor_name?: string | null;
  vendor_user_name?: string | null;
  vendor_user_ref?: string | null;
  vendor_user_mobile?: string | null;
  resume_id: string;
}

interface PaginatedCandidates {
  items: SubmissionItem[];
  total_items: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export default function CandidatesDashboard() {
  const { user, loading: authLoading } = useAuth();
  // Search & Filter State
  const [searchColumn, setSearchColumn] = useState("candidate_name");
  const [searchQuery, setSearchQuery] = useState("");
  const [employmentMode, setEmploymentMode] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [education, setEducation] = useState("");
  const [vendorId, setVendorId] = useState("");

  const [totalExpMin, setTotalExpMin] = useState("");
  const [totalExpMax, setTotalExpMax] = useState("");
  const [ctcMin, setCtcMin] = useState("");
  const [ctcMax, setCtcMax] = useState("");

  const [sortBy] = useState("submission_date");
  const [sortOrder] = useState("desc");

  // Lookup data
  const [jobRoles, setJobRoles] = useState<RoleInfo[]>([]);
  
  // Table Data
  const [data, setData] = useState<PaginatedCandidates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [exporting, setExporting] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [resumeActionLoading, setResumeActionLoading] = useState<Record<string, 'view' | 'download' | null>>({});

  const handleViewResume = async (resumeId: string) => {
    setResumeActionLoading(prev => ({ ...prev, [resumeId]: 'view' }));
    setError("");
    try {
      const blob = await api.get<Blob>(`/api/v1/resumes/${resumeId}/download`);
      const pdfBlob = new Blob([blob], { type: "application/pdf" });
      const url = window.URL.createObjectURL(pdfBlob);
      window.open(url, "_blank");
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      setError(error.detail || "Failed to open resume. Access might be denied or the file was not found.");
    } finally {
      setResumeActionLoading(prev => ({ ...prev, [resumeId]: null }));
    }
  };

  const handleDownloadResume = async (resumeId: string, candidateName: string) => {
    setResumeActionLoading(prev => ({ ...prev, [resumeId]: 'download' }));
    setError("");
    try {
      const blob = await api.get<Blob>(`/api/v1/resumes/${resumeId}/download`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Resume_${candidateName.replace(/\s+/g, "_")}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      setError(error.detail || "Failed to download resume. Access might be denied or the file was not found.");
    } finally {
      setResumeActionLoading(prev => ({ ...prev, [resumeId]: null }));
    }
  };

  useEffect(() => {
    if (!vendorId && user?.companies && user.companies.length >= 1) {
      let defaultId = user.activeVendorId || user.companies[0].vendor_id;
      if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem("vms_recruiter_selected_company_id");
        const hasStored = stored && user.companies.some(c => c.vendor_id === stored);
        if (hasStored && stored && (!user.activeVendorId || stored === user.activeVendorId)) {
          defaultId = stored;
        }
      }
      setVendorId(defaultId);
    }
  }, [user?.companies, user?.activeVendorId, vendorId]);

  // Fetch Lookup Data on mount
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const roles = await api.get<RoleInfo[]>("/api/v1/recruiter/job-roles");
        setJobRoles(roles);
      } catch (err) {
        console.error("Failed to load job roles lookups", err);
      }
    };
    fetchLookups();
  }, []);

  const fetchCandidates = useCallback(async () => {
    if (!vendorId) {
      if (!authLoading && user && (!user.companies || user.companies.length === 0)) {
        setLoading(false);
        setError("No authorized companies.");
      }
      return;
    }
    if (user?.activeVendorId && vendorId !== user.activeVendorId) {
      setLoading(false);
      setError("Unauthorized company access.");
      return;
    }
    setLoading(true);
    setError("");
    
    // Build query params
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("page_size", pageSize.toString());
    params.set("sort_by", sortBy);
    params.set("sort_order", sortOrder);

    if (searchColumn && searchQuery.trim()) {
      params.set("search_column", searchColumn);
      params.set("search_query", searchQuery.trim());
    }
    if (employmentMode) params.set("employment_mode", employmentMode);
    if (selectedRoleId) params.set("role_id", selectedRoleId);
    params.set("vendor_id", vendorId);
    if (noticePeriod) params.set("notice_period", noticePeriod);
    if (education.trim()) params.set("education", education.trim());
    
    if (totalExpMin) params.set("total_exp_min", totalExpMin);
    if (totalExpMax) params.set("total_exp_max", totalExpMax);
    if (ctcMin) params.set("ctc_min", ctcMin);
    if (ctcMax) params.set("ctc_max", ctcMax);

    try {
      const response = await api.get<PaginatedCandidates>(`/api/v1/recruiter/candidates?${params.toString()}`);
      setData(response);
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      setError(error.detail || "Failed to load candidates inventory.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, searchColumn, searchQuery, employmentMode, selectedRoleId, vendorId, noticePeriod, education, totalExpMin, totalExpMax, ctcMin, ctcMax, authLoading, user]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCandidates();
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setEmploymentMode("");
    setSelectedRoleId("");
    if (user?.companies && user.companies.length >= 1) {
      let defaultId = user.activeVendorId || user.companies[0].vendor_id;
      if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem("vms_recruiter_selected_company_id");
        const hasStored = stored && user.companies.some(c => c.vendor_id === stored);
        if (hasStored && stored && (!user.activeVendorId || stored === user.activeVendorId)) {
          defaultId = stored;
        }
        sessionStorage.setItem("vms_recruiter_selected_company_id", defaultId);
      }
      setVendorId(defaultId);
    } else {
      setVendorId("");
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("vms_recruiter_selected_company_id");
      }
    }
    setNoticePeriod("");
    setEducation("");
    setTotalExpMin("");
    setTotalExpMax("");
    setCtcMin("");
    setCtcMax("");
    setPage(1);
    // Timeout to let state clear
    setTimeout(fetchCandidates, 50);
  };

  // Synchronous XLSX download
  const handleExport = async () => {
    if (user?.activeVendorId && vendorId !== user.activeVendorId) {
      alert("Unauthorized company access.");
      return;
    }
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (searchColumn && searchQuery.trim()) {
        params.set("search_column", searchColumn);
        params.set("search_query", searchQuery.trim());
      }
      if (employmentMode) params.set("employment_mode", employmentMode);
      if (selectedRoleId) params.set("role_id", selectedRoleId);
      if (vendorId) params.set("vendor_id", vendorId);
      if (noticePeriod) params.set("notice_period", noticePeriod);
      if (education.trim()) params.set("education", education.trim());
      if (totalExpMin) params.set("total_exp_min", totalExpMin);
      if (totalExpMax) params.set("total_exp_max", totalExpMax);
      if (ctcMin) params.set("ctc_min", ctcMin);
      if (ctcMax) params.set("ctc_max", ctcMax);

      const blob = await api.post<Blob>(`/api/v1/recruiter/export?${params.toString()}`);
      
      // Save download file locally
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `VMS_Candidates_Export_${new Date().toISOString().split("T")[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Export failed", err);
      alert("Failed to export candidates list.");
    } finally {
      setExporting(false);
    }
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
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Candidates Pipeline</h1>
          <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
            Search, filter, and review all submissions globally across all vendors
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} loading={exporting}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "0.5rem" }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export Excel
        </Button>
      </div>

      {/* Filter and Search Form Dashboard */}
      <form onSubmit={handleSearchSubmit} style={{
        backgroundColor: "hsl(var(--card-hsl))",
        border: "1px solid hsl(var(--card-border-hsl))",
        borderRadius: "var(--radius-lg)",
        padding: "1.5rem",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: "1rem"
      }}>
        {/* Row 1: Search Selection */}
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
          <div style={{ width: "240px" }}>
            <Select
              label="Search Column"
              options={[
                { value: "candidate_name", label: "Candidate Name" },
                { value: "job_id", label: "Job ID" },
                { value: "contact_number", label: "Contact Number" },
                { value: "email", label: "Email Address" },
                { value: "current_company", label: "Current Company" },
                { value: "role", label: "Job Role Title" },
                { value: "vendor_name", label: "Vendor Name" },
                { value: "current_location", label: "Current Location" },
                { value: "preferred_location", label: "Preferred Location" },
                { value: "status", label: "Status" },
                { value: "employment_mode", label: "Employment Mode" }
              ]}
              value={searchColumn}
              onChange={(e) => setSearchColumn(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              label="Search Query"
              type="text"
              placeholder="Type keyword and press search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <Button type="submit">Search</Button>
            <Button type="button" variant="outline" onClick={handleResetFilters}>Reset</Button>
          </div>
        </div>

        {/* Row 2: Secondary Dropdown Filters */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          borderTop: "1px solid hsl(var(--card-border-hsl))",
          paddingTop: "1rem"
        }}>
          {user?.companies && user.companies.length > 0 && (
            <Select
              label="Company"
              options={
                user.activeVendorId
                  ? user.companies
                      .filter(c => c.vendor_id === user.activeVendorId)
                      .map(c => ({ value: c.vendor_id, label: c.company_name.toUpperCase() }))
                  : user.companies.map(c => ({ value: c.vendor_id, label: c.company_name.toUpperCase() }))
              }
              value={vendorId}
              onChange={(e) => {
                const val = e.target.value;
                if (!user.activeVendorId || val === user.activeVendorId) {
                  setVendorId(val);
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("vms_recruiter_selected_company_id", val);
                  }
                  setPage(1);
                }
              }}
              placeholder={undefined}
            />
          )}

          <Select
            label="Employment Mode"
            options={[
              { value: "Perm", label: "Perm" },
              { value: "C2H", label: "C2H" }
            ]}
            value={employmentMode}
            onChange={(e) => setEmploymentMode(e.target.value)}
            placeholder="All Modes"
          />

          <Select
            label="Job Role Title"
            options={jobRoles.map(r => ({ value: r.id, label: r.title }))}
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            placeholder="All Roles"
          />

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
            value={noticePeriod}
            onChange={(e) => setNoticePeriod(e.target.value)}
            placeholder="All Notices"
          />

          <Input
            label="Min Experience"
            type="number"
            placeholder="e.g. 2"
            value={totalExpMin}
            onChange={(e) => setTotalExpMin(e.target.value)}
          />

          <Input
            label="Max CTC (LPA)"
            type="number"
            placeholder="e.g. 15"
            value={ctcMax}
            onChange={(e) => setCtcMax(e.target.value)}
          />
        </div>
      </form>

      {error && (
        <div style={{
          padding: "1rem 1.5rem",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "hsl(var(--danger-bg-hsl))",
          color: "hsl(var(--danger-hsl))",
          fontSize: "0.9rem",
          border: "1px solid rgba(220, 38, 38, 0.2)"
        }}>
          {error}
        </div>
      )}

      {/* Candidates Table List */}
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
            borderCollapse: "separate",
            borderSpacing: 0,
            textAlign: "left",
            fontSize: "0.9rem"
          }}>
            <thead>
              <tr style={{
                backgroundColor: "hsl(var(--muted-bg-hsl))",
                borderBottom: "1px solid hsl(var(--card-border-hsl))"
              }}>
                <th style={{ position: "sticky", left: 0, backgroundColor: "hsl(var(--muted-bg-hsl))", zIndex: 2, borderRight: "1px solid hsl(var(--card-border-hsl))", borderBottom: "1px solid hsl(var(--card-border-hsl))", padding: "1rem 1.5rem", fontWeight: 600, minWidth: "60px", width: "60px" }}>#</th>
                <th style={{ position: "sticky", left: 60, backgroundColor: "hsl(var(--muted-bg-hsl))", zIndex: 2, borderRight: "1px solid hsl(var(--card-border-hsl))", borderBottom: "1px solid hsl(var(--card-border-hsl))", padding: "1rem 1.5rem", fontWeight: 600, minWidth: "180px", width: "180px" }}>Company</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "180px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Candidate Name</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "180px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Vendor Name</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "160px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Vendor User</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "160px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Vendor User Mobile</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "130px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Job ID</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "150px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Role</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "120px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>CV Sent Date</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "150px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Employment Mode</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "150px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Contact Number</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "180px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Email ID</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "150px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Current Company</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "140px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Total Experience</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "150px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Relevant Experience</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "130px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Notice Period</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "100px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>CTC</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "100px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>ECTC</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "140px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Current Location</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "150px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Preferred Location</th>
                <th style={{ padding: "1rem 1.5rem", fontWeight: 600, minWidth: "140px", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>Resume</th>
                <th style={{ position: "sticky", right: 0, backgroundColor: "hsl(var(--muted-bg-hsl))", zIndex: 2, borderLeft: "1px solid hsl(var(--card-border-hsl))", borderBottom: "1px solid hsl(var(--card-border-hsl))", padding: "1rem 1.5rem", fontWeight: 600, minWidth: "160px", width: "160px" }}>Status / Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                    <td style={{ position: "sticky", left: 0, backgroundColor: "hsl(var(--card-hsl))", zIndex: 1, borderRight: "1px solid hsl(var(--card-border-hsl))", borderBottom: "1px solid hsl(var(--card-border-hsl))", padding: "1rem 1.5rem" }}><Skeleton width="30px" /></td>
                    <td style={{ position: "sticky", left: 60, backgroundColor: "hsl(var(--card-hsl))", zIndex: 1, borderRight: "1px solid hsl(var(--card-border-hsl))", borderBottom: "1px solid hsl(var(--card-border-hsl))", padding: "1rem 1.5rem" }}><Skeleton width="120px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="140px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="120px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="90px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="90px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="80px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="140px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="100px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="60px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="60px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="80px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="60px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="60px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="90px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="90px" /></td>
                    <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}><Skeleton width="80px" /></td>
                    <td style={{ position: "sticky", right: 0, backgroundColor: "hsl(var(--card-hsl))", zIndex: 1, borderLeft: "1px solid hsl(var(--card-border-hsl))", borderBottom: "1px solid hsl(var(--card-border-hsl))", padding: "1rem 1.5rem" }}><Skeleton width="110px" /></td>
                  </tr>
                ))
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={22} style={{
                    padding: "3.5rem",
                    textAlign: "center",
                    color: "hsl(var(--muted-hsl))"
                  }}>
                    <p style={{ fontWeight: 500, fontSize: "0.95rem" }}>No candidates found</p>
                    <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>No submissions match your active search/filter options.</p>
                  </td>
                </tr>
              ) : (
                data.items.map((item, idx) => {
                  const isHovered = hoveredRowId === item.id;
                  const rowBgColor = isHovered ? "hsl(var(--background-hsl))" : "hsl(var(--card-hsl))";
                  
                  return (
                    <tr key={item.id} style={{
                      borderBottom: "1px solid hsl(var(--card-border-hsl))",
                      backgroundColor: rowBgColor,
                      transition: "background-color 0.15s ease"
                    }}
                    onMouseEnter={() => setHoveredRowId(item.id)}
                    onMouseLeave={() => setHoveredRowId(null)}
                    >
                      <td style={{ position: "sticky", left: 0, backgroundColor: rowBgColor, zIndex: 1, borderRight: "1px solid hsl(var(--card-border-hsl))", borderBottom: "1px solid hsl(var(--card-border-hsl))", padding: "1rem 1.5rem", color: "hsl(var(--muted-hsl))", fontWeight: 500 }}>
                        {(page - 1) * pageSize + idx + 1}
                      </td>
                      <td style={{ position: "sticky", left: 60, backgroundColor: rowBgColor, zIndex: 1, borderRight: "1px solid hsl(var(--card-border-hsl))", borderBottom: "1px solid hsl(var(--card-border-hsl))", padding: "1rem 1.5rem", fontWeight: 600 }}>
                        <Link href={`/recruiter/submissions/${item.id}`} style={{
                          color: "hsl(var(--primary-hsl))",
                          textDecoration: "none"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
                        >
                          {item.vendor_name}
                        </Link>
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))", fontWeight: 600 }}>
                        {item.candidate.name || "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))", fontWeight: 500 }}>
                        {item.submitting_vendor_name || "N/A"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.vendor_user_name || "N/A"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.vendor_user_mobile || "N/A"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))", fontWeight: 500 }}>
                        {item.job_id || item.role?.job_id || "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.role.title}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.cv_sent_date || "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.employment_mode || "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.contact_number || "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.email || "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.current_company || "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.total_experience !== undefined ? `${item.candidate.total_experience} Yrs` : "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.relevant_experience !== undefined ? `${item.candidate.relevant_experience} Yrs` : "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.notice_period ? (item.candidate.notice_period === "Immediate" ? "Immediate" : `${item.candidate.notice_period} Days`) : "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.ctc !== undefined ? `${item.candidate.ctc} LPA` : "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.ectc !== undefined ? `${item.candidate.ectc} LPA` : "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.current_location || "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))" }}>
                        {item.candidate.preferred_location || "-"}
                      </td>
                      <td style={{ padding: "1rem 1.5rem", borderBottom: "1px solid hsl(var(--card-border-hsl))", whiteSpace: "nowrap" }}>
                        {item.resume_id ? (
                          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => handleViewResume(item.resume_id)}
                              disabled={resumeActionLoading[item.resume_id] !== undefined && resumeActionLoading[item.resume_id] !== null}
                              style={{
                                color: "hsl(var(--primary-hsl))",
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                fontSize: "0.85rem",
                                fontWeight: 500,
                                textDecoration: "underline"
                              }}
                            >
                              {resumeActionLoading[item.resume_id] === 'view' ? "Opening..." : "View"}
                            </button>
                            <span style={{ color: "hsl(var(--muted-hsl))" }}>|</span>
                            <button
                              type="button"
                              onClick={() => handleDownloadResume(item.resume_id, item.candidate.name)}
                              disabled={resumeActionLoading[item.resume_id] !== undefined && resumeActionLoading[item.resume_id] !== null}
                              style={{
                                color: "hsl(var(--primary-hsl))",
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                fontSize: "0.85rem",
                                fontWeight: 500,
                                textDecoration: "underline"
                              }}
                            >
                              {resumeActionLoading[item.resume_id] === 'download' ? "Downloading..." : "Download"}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "hsl(var(--muted-hsl))" }}>No Resume</span>
                        )}
                      </td>
                      <td style={{
                        position: "sticky",
                        right: 0,
                        backgroundColor: rowBgColor,
                        zIndex: 1,
                        borderLeft: "1px solid hsl(var(--card-border-hsl))",
                        borderBottom: "1px solid hsl(var(--card-border-hsl))",
                        padding: "0.85rem 1.25rem",
                        whiteSpace: "nowrap"
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", alignItems: "flex-start" }}>
                          <span style={getStatusStyle(item.status)}>{item.status}</span>
                          <Link
                            href={`/recruiter/submissions/${item.id}`}
                            style={{
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              color: "hsl(var(--primary-hsl))",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem"
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                          >
                            Manage Status &rarr;
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
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
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= data.total_pages}
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
