"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Validate presence of token on render
  if (!token) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "hsl(var(--danger-bg-hsl))",
          color: "hsl(var(--danger-hsl))",
          fontSize: "0.875rem",
          marginBottom: "1.5rem",
          border: "1px solid rgba(220, 38, 38, 0.2)"
        }}>
          Invalid or missing reset token.
        </div>
        <Link href="/" style={{ color: "hsl(var(--primary-hsl))", fontSize: "0.875rem", fontWeight: 500, textDecoration: "none" }}>
          &larr; Back to Selection
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side validations
    if (password.length < 8 || password.length > 50) {
      setError("Password must be between 8 and 50 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await api.post(
        "/api/v1/auth/reset-password",
        {
          token,
          password,
          confirm_password: confirmPassword
        },
        { skipAuth: true }
      );
      setSuccess(true);
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setError(errorObj.detail || "Failed to reset password. The link may have expired or already been used.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          color: "hsl(var(--success-hsl))",
          fontSize: "0.875rem",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          lineHeight: "1.5",
          textAlign: "center"
        }}>
          Password has been reset successfully.
        </div>
        
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          textAlign: "center",
          fontSize: "0.875rem",
          marginTop: "1.5rem"
        }}>
          <Link href="/auth/recruiter/login" style={{ color: "hsl(var(--primary-hsl))", fontWeight: 500, textDecoration: "none" }}>
            Go to Recruiter Login
          </Link>
          <Link href="/auth/vendor/login" style={{ color: "hsl(var(--accent-hsl))", fontWeight: 500, textDecoration: "none" }}>
            Go to Vendor Login
          </Link>
          <Link href="/" style={{ color: "hsl(var(--muted-hsl))", fontWeight: 500, textDecoration: "none", marginTop: "0.5rem" }}>
            &larr; Back to Selection
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {error && (
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "hsl(var(--danger-bg-hsl))",
          color: "hsl(var(--danger-hsl))",
          fontSize: "0.875rem",
          border: "1px solid rgba(220, 38, 38, 0.2)"
        }}>
          {error}
        </div>
      )}

      <Input
        label="New Password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
      />

      <Input
        label="Confirm New Password"
        type="password"
        placeholder="••••••••"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        autoComplete="new-password"
      />

      <Button type="submit" loading={loading} style={{ marginTop: "0.5rem" }}>
        Reset Password
      </Button>
    </form>
  );
}

export default function ResetPassword() {
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
        maxWidth: "400px",
        width: "100%",
        padding: "2.5rem",
        borderRadius: "var(--radius-lg)",
        backgroundColor: "hsl(var(--card-hsl))",
        border: "1px solid hsl(var(--card-border-hsl))",
        boxShadow: "var(--shadow-lg)"
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "hsl(var(--foreground-hsl))",
            marginBottom: "0.5rem"
          }}>
            Set New Password
          </h1>
          <p style={{ fontSize: "0.875rem", color: "hsl(var(--muted-hsl))" }}>
            Choose a new password for your account
          </p>
        </div>

        <Suspense fallback={<div style={{ textAlign: "center", color: "hsl(var(--muted-hsl))" }}>Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
