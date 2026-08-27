"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "2rem",
      backgroundColor: "hsl(var(--background-hsl))"
    }}>
      <div style={{
        maxWidth: "800px",
        width: "100%",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        gap: "2.5rem"
      }}>
        <div>
          <h1 style={{
            fontSize: "2.5rem",
            fontWeight: 800,
            letterSpacing: "-0.025em",
            color: "hsl(var(--foreground-hsl))",
            marginBottom: "0.75rem"
          }}>
            Vendor Management System
          </h1>
          <p style={{
            fontSize: "1.125rem",
            color: "hsl(var(--muted-hsl))",
            maxWidth: "600px",
            margin: "0 auto"
          }}>
            Select a portal to authenticate and manage your candidate pipeline.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5rem",
          marginTop: "1.5rem"
        }}>
          {/* Recruiter Card */}
          <Link href="/auth/recruiter/login" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "2.5rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "hsl(var(--card-hsl))",
            border: "1px solid hsl(var(--card-border-hsl))",
            boxShadow: "var(--shadow-md)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
            cursor: "pointer",
            textAlign: "left"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-4px)";
            e.currentTarget.style.boxShadow = "var(--shadow-lg)";
            e.currentTarget.style.borderColor = "hsl(var(--primary-hsl))";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "var(--shadow-md)";
            e.currentTarget.style.borderColor = "hsl(var(--card-border-hsl))";
          }}
          >
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "rgba(37, 99, 235, 0.1)",
              color: "hsl(var(--primary-hsl))",
              marginBottom: "1.5rem"
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h2 style={{
              fontSize: "1.375rem",
              fontWeight: 700,
              color: "hsl(var(--foreground-hsl))",
              marginBottom: "0.5rem"
            }}>
              Recruiter Portal
            </h2>
            <p style={{
              fontSize: "0.95rem",
              lineHeight: "1.5",
              color: "hsl(var(--muted-hsl))"
            }}>
              Access candidate profiles, reveal PAN identities, manage departments and job roles, and verify signups.
            </p>
          </Link>

          {/* Vendor Card */}
          <Link href="/auth/vendor/login" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "2.5rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "hsl(var(--card-hsl))",
            border: "1px solid hsl(var(--card-border-hsl))",
            boxShadow: "var(--shadow-md)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
            cursor: "pointer",
            textAlign: "left"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-4px)";
            e.currentTarget.style.boxShadow = "var(--shadow-lg)";
            e.currentTarget.style.borderColor = "hsl(var(--primary-hsl))";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "var(--shadow-md)";
            e.currentTarget.style.borderColor = "hsl(var(--card-border-hsl))";
          }}
          >
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "rgba(14, 165, 233, 0.1)",
              color: "hsl(var(--accent-hsl))",
              marginBottom: "1.5rem"
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <h2 style={{
              fontSize: "1.375rem",
              fontWeight: 700,
              color: "hsl(var(--foreground-hsl))",
              marginBottom: "0.5rem"
            }}>
              Vendor Portal
            </h2>
            <p style={{
              fontSize: "0.95rem",
              lineHeight: "1.5",
              color: "hsl(var(--muted-hsl))"
            }}>
              Submit candidates, process and extract resumes, check PAN advisory duplicates, and review company submissions.
            </p>
          </Link>
        </div>

        <div style={{
          marginTop: "3rem",
          fontSize: "0.875rem",
          color: "hsl(var(--muted-hsl))"
        }}>
          Vendor Management System &bull; Version 1.0.0
        </div>
      </div>
    </main>
  );
}
