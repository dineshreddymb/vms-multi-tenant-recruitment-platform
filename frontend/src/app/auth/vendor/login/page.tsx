"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function VendorLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password, "vendor");
    } catch (err) {
      const error = err as { detail?: string; status?: number };
      if (error.status === 403 && typeof error.detail === "string" && error.detail.toLowerCase().includes("deactivated")) {
        // Handled by AuthContext redirection
        return;
      }
      setError(error.detail || "Invalid email or password. Please check your credentials and try again.");
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
            Vendor Login
          </h1>
          <p style={{ fontSize: "0.875rem", color: "hsl(var(--muted-hsl))" }}>
            Sign in to access your dashboard
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

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <div style={{ textAlign: "right", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
            <Link href="/auth/forgot-password" style={{ fontSize: "0.8rem", color: "hsl(var(--primary-hsl))", textDecoration: "none" }}>
              Forgot Password?
            </Link>
          </div>

          <Button type="submit" loading={loading} style={{ marginTop: "0.5rem" }}>
            Sign In
          </Button>
        </form>

        <div style={{
          marginTop: "1.5rem",
          textAlign: "center",
          fontSize: "0.875rem",
          color: "hsl(var(--muted-hsl))",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem"
        }}>
          <div>
            Don&apos;t have an account?{" "}
            <Link href="/auth/vendor/signup" style={{ color: "hsl(var(--primary-hsl))", fontWeight: 600 }}>
              Sign Up
            </Link>
          </div>
          <div>
            <Link href="/" style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.8rem" }}>
              &larr; Back to Selection
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
