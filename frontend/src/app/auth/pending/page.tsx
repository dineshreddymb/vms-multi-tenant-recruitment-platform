"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function PendingContent() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const loginHref = type === "vendor" ? "/auth/vendor/login" : "/auth/recruiter/login";

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
          backgroundColor: "rgba(245, 158, 11, 0.1)",
          color: "hsl(var(--warning-hsl))",
          marginBottom: "1.5rem"
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        <h1 style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "hsl(var(--foreground-hsl))",
          marginBottom: "0.75rem"
        }}>
          Account Request Pending
        </h1>

        <p style={{
          fontSize: "0.95rem",
          lineHeight: "1.6",
          color: "hsl(var(--muted-hsl))",
          marginBottom: "2rem"
        }}>
          Your signup request has been submitted successfully and is currently awaiting administrator review. 
          You will be able to log in once your account has been approved.
        </p>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem"
        }}>
          <Link href="/">
            <button style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "hsl(var(--primary-hsl))",
              color: "hsl(var(--primary-foreground-hsl))",
              border: "none",
              fontWeight: 500,
              cursor: "pointer"
            }}>
              Return to Homepage
            </button>
          </Link>
          <Link href={loginHref} style={{ fontSize: "0.875rem", color: "hsl(var(--primary-hsl))", fontWeight: 500 }}>
            Go to Login
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function PendingApproval() {
  return (
    <Suspense fallback={
      <main style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div>Loading...</div>
      </main>
    }>
      <PendingContent />
    </Suspense>
  );
}
