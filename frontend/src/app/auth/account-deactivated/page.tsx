import React from "react";
import Link from "next/link";

export default function AccountDeactivated() {
  return (
    <main style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "1.5rem",
      backgroundColor: "hsl(var(--background-hsl))"
    }}>
      <div style={{
        maxWidth: "480px",
        width: "100%",
        padding: "3rem",
        borderRadius: "var(--radius-lg)",
        backgroundColor: "hsl(var(--card-hsl))",
        border: "1px solid hsl(var(--card-border-hsl))",
        boxShadow: "var(--shadow-lg)",
        textAlign: "center"
      }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          backgroundColor: "rgba(220, 38, 38, 0.1)",
          color: "hsl(var(--danger-hsl))",
          marginBottom: "1.5rem"
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <h1 style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "hsl(var(--foreground-hsl))",
          marginBottom: "0.75rem"
        }}>
          Account Deactivated
        </h1>

        <p style={{
          fontSize: "0.95rem",
          lineHeight: "1.6",
          color: "hsl(var(--muted-hsl))",
          marginBottom: "2rem"
        }}>
          Your account has been deactivated. Please contact your administrator or recruiter for assistance.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <button style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "hsl(var(--primary-hsl))",
              color: "hsl(var(--primary-foreground-hsl))",
              border: "none",
              fontWeight: 500,
              fontSize: "0.9rem",
              cursor: "pointer"
            }}>
              Back to Login
            </button>
          </Link>
        </div>
      </div>
    </main>
  );
}
