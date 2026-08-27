"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.post(
        "/api/v1/auth/forgot-password",
        { email },
        { skipAuth: true }
      );
      setSuccess(true);
    } catch (err) {
      // Show generic error or detail if request parsing itself fails
      const errorObj = err as { detail?: string; status?: number };
      setError(errorObj.detail || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
            Reset Password
          </h1>
          <p style={{ fontSize: "0.875rem", color: "hsl(var(--muted-hsl))" }}>
            Enter your email to receive a password reset link
          </p>
        </div>

        {error && (
          <div style={{
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "hsl(var(--danger-bg-hsl))",
            color: "hsl(var(--danger-hsl))",
            fontSize: "0.875rem",
            marginBottom: "1.5rem",
            border: "1px solid rgba(220, 38, 38, 0.2)"
          }}>
            {error}
          </div>
        )}

        {success ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              color: "hsl(var(--success-hsl))",
              fontSize: "0.875rem",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              lineHeight: "1.5"
            }}>
              If the email address is registered, a password reset link has been sent.
            </div>
            
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              textAlign: "center",
              fontSize: "0.875rem",
              marginTop: "1rem"
            }}>
              <Link href="/auth/recruiter/login" style={{ color: "hsl(var(--primary-hsl))", fontWeight: 500, textDecoration: "none" }}>
                Go to Recruiter Login
              </Link>
              <Link href="/auth/vendor/login" style={{ color: "hsl(var(--accent-hsl))", fontWeight: 500, textDecoration: "none" }}>
                Go to Vendor Login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Input
              label="Email Address"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Button type="submit" loading={loading} style={{ marginTop: "0.5rem" }}>
              Send Reset Link
            </Button>
          </form>
        )}

        {!success && (
          <div style={{
            marginTop: "2rem",
            textAlign: "center",
            fontSize: "0.875rem",
            color: "hsl(var(--muted-hsl))",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem"
          }}>
            <Link href="/" style={{ color: "hsl(var(--primary-hsl))", fontWeight: 500, textDecoration: "none" }}>
              &larr; Back to Selection
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
