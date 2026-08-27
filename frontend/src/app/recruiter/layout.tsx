"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

// Company-specific branding colors
const COMPANY_BRANDING = {
  IOSYS: {
    primaryColor: "hsl(220, 90%, 50%)", // Blue
    secondaryColor: "hsl(220, 90%, 40%)",
    lightColor: "rgba(56, 132, 255, 0.1)",
    name: "IOSYS",
  },
  Volantis: {
    primaryColor: "hsl(160, 90%, 40%)", // Green
    secondaryColor: "hsl(160, 90%, 30%)",
    lightColor: "rgba(46, 204, 113, 0.1)",
    name: "Volantis",
  },
  default: {
    primaryColor: "hsl(var(--primary-hsl))",
    secondaryColor: "hsl(var(--primary-hsl))",
    lightColor: "rgba(37, 99, 235, 0.1)",
    name: "VMS",
  }
};

// Helper to get company branding
const getCompanyBranding = (companyName?: string) => {
  if (!companyName) return COMPANY_BRANDING.default;
  
  const normalizedName = companyName.toLowerCase();
  if (normalizedName.includes("iosys")) {
    return COMPANY_BRANDING.IOSYS;
  } else if (normalizedName.includes("volantis")) {
    return COMPANY_BRANDING.Volantis;
  }
  return COMPANY_BRANDING.default;
};

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isRecruiter, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  // Get company branding based on active company
  const companyBranding = getCompanyBranding(user?.activeCompanyName);

  useEffect(() => {
    if (!loading && (!user || !isRecruiter)) {
      router.push("/auth/recruiter/login");
    }
  }, [user, loading, isRecruiter, router]);

  if (loading || !user || !isRecruiter) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "hsl(var(--background-hsl))",
        color: "hsl(var(--muted-hsl))",
        fontSize: "1rem"
      }}>
        Verifying session...
      </div>
    );
  }

  const isLinkActive = (path: string) => pathname === path;

  // Derive avatar initial from user name or email
  const avatarInitial = (user.name?.trim() || user.email || "?")
    .charAt(0)
    .toUpperCase();

  const navLinkClass = (path: string) =>
    `sidebar-nav-link${isLinkActive(path) ? " active" : ""}`;

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <aside style={{
        width: "256px",
        minWidth: "256px",
        backgroundColor: "hsl(var(--card-hsl))",
        borderRight: "1px solid hsl(var(--card-border-hsl))",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "hidden",
      }}>

        {/* Branding */}
        <div style={{ padding: "1.5rem 1.25rem 1rem" }}>
          <Link
            href="/recruiter/candidates"
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "0.3rem",
              textDecoration: "none",
              flexDirection: "column",
            }}
            aria-label="VMS Recruiter — go to Candidates"
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
              <span style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: companyBranding.primaryColor,
                letterSpacing: "-0.01em",
                lineHeight: 1,
              }}>
                {companyBranding.name}
              </span>
              <span style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: "hsl(var(--foreground-hsl))",
                letterSpacing: "-0.01em",
                lineHeight: 1,
              }}>
                Recruiter
              </span>
            </div>
            {user.activeCompanyName && (
              <div style={{
                marginTop: "0.25rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: companyBranding.primaryColor,
                backgroundColor: companyBranding.lightColor,
                padding: "0.25rem 0.5rem",
                borderRadius: "4px",
                display: "inline-block",
                border: `1px solid ${companyBranding.primaryColor}20`,
              }}>
                {user.activeCompanyName}
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav
          aria-label="Recruiter navigation"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <Link
            href="/recruiter/candidates"
            className={navLinkClass("/recruiter/candidates")}
            aria-current={isLinkActive("/recruiter/candidates") ? "page" : undefined}
          >
            {/* Candidates / Users icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Candidates List
          </Link>

          <Link
            href="/recruiter/roles"
            className={navLinkClass("/recruiter/roles")}
            aria-current={isLinkActive("/recruiter/roles") ? "page" : undefined}
          >
            {/* Briefcase icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Job Roles
          </Link>

          <Link
            href="/recruiter/vendor-users"
            className={navLinkClass("/recruiter/vendor-users")}
            aria-current={isLinkActive("/recruiter/vendor-users") ? "page" : undefined}
          >
            {/* Hexagon icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            Vendor Users
          </Link>

          {isAdmin && (
            <Link
              href="/recruiter/users"
              className={navLinkClass("/recruiter/users")}
              aria-current={isLinkActive("/recruiter/users") ? "page" : undefined}
            >
              {/* Users icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Recruiter Users
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/recruiter/approvals"
              className={navLinkClass("/recruiter/approvals")}
              aria-current={isLinkActive("/recruiter/approvals") ? "page" : undefined}
            >
              {/* Check-circle icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Signup Approvals
            </Link>
          )}

          <Link
            href="/recruiter/profile"
            className={navLinkClass("/recruiter/profile")}
            aria-current={isLinkActive("/recruiter/profile") ? "page" : undefined}
          >
            {/* Settings / gear icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Profile &amp; Admins
          </Link>
        </nav>

        {/* Bottom — User Account Section */}
        <div style={{
          padding: "0.875rem 1.25rem 1.25rem",
          borderTop: "1px solid hsl(var(--card-border-hsl))",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}>

          {/* User info row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem" }}>
            {/* Avatar circle */}
            <div className="sidebar-avatar" aria-hidden="true">
              {avatarInitial}
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{
                fontSize: "0.75rem",
                color: "hsl(var(--muted-hsl))",
                lineHeight: 1.2,
              }}>
                Logged in
              </span>
              <span style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "hsl(var(--foreground-hsl))",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
                title={user.email}
              >
                {user.email}
              </span>
              {user.activeCompanyName && (
                <span style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: companyBranding.primaryColor,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {user.activeCompanyName}
                </span>
              )}
              <span style={{
                display: "inline-block",
                width: "fit-content",
                fontSize: "0.68rem",
                fontWeight: 700,
                padding: "0.1rem 0.4rem",
                borderRadius: "4px",
                backgroundColor: isAdmin ? "rgba(220, 38, 38, 0.1)" : companyBranding.lightColor,
                color: isAdmin ? "hsl(var(--danger-hsl))" : companyBranding.primaryColor,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                lineHeight: 1.6,
                border: isAdmin ? undefined : `1px solid ${companyBranding.primaryColor}20`,
              }}>
                {user.access_level || "STANDARD"}
              </span>
            </div>
          </div>

          {/* Log Out button */}
          <button
            className="sidebar-logout-btn"
            onClick={logout}
            type="button"
            aria-label="Log out of VMS Recruiter"
          >
            {/* Log-out icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "hsl(var(--background-hsl))", minWidth: 0 }}>
        <main style={{ flex: 1, padding: "2.5rem" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
