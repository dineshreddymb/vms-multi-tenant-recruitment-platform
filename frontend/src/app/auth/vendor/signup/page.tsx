"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function VendorSignup() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!companyName.trim()) {
      setError("Vendor Company Name is required.");
      return;
    }

    const lowerName = companyName.trim().toLowerCase();
    if (lowerName === "iosys" || lowerName === "volantis") {
      setError("Vendor Company Name cannot be IOSYS or Volantis.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await api.post(
        "/api/v1/auth/vendor/signup",
        {
          companies: [],
          company_name: companyName.trim(),
          user_name: userName,
          email,
          mobile,
          password,
          confirm_password: confirmPassword,
        },
        { skipAuth: true }
      );

      // Redirect to pending approval message page
      router.push("/auth/pending?type=vendor");
    } catch (err) {
      const errorObj = err as { detail?: string; status?: number };
      setError(errorObj.detail || "Signup request failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "1.5rem",
        backgroundColor: "hsl(var(--background-hsl))",
      }}
    >
      <div
        style={{
          maxWidth: "450px",
          width: "100%",
          padding: "2.5rem",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "hsl(var(--card-hsl))",
          border: "1px solid hsl(var(--card-border-hsl))",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "hsl(var(--foreground-hsl))",
              marginBottom: "0.5rem",
            }}
          >
            Vendor Signup
          </h1>
          <p style={{ fontSize: "0.875rem", color: "hsl(var(--muted-hsl))" }}>
            Submit an account request for administrator verification
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "hsl(var(--danger-bg-hsl))",
              color: "hsl(var(--danger-hsl))",
              fontSize: "0.875rem",
              marginBottom: "1.5rem",
              border: "1px solid rgba(220, 38, 38, 0.2)",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>


          <Input
            label="Full Name"
            type="text"
            placeholder="John Doe"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            required
            minLength={2}
          />

          <Input
            label="Vendor Company Name"
            type="text"
            placeholder="e.g. ABC Technologies"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            minLength={2}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Mobile Number (Indian)"
            type="tel"
            placeholder="9876543210"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="Min 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Min 8 characters"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />

          <Button type="submit" loading={loading} style={{ marginTop: "0.75rem" }}>
            Submit Signup Request
          </Button>
        </form>

        <div
          style={{
            marginTop: "1.5rem",
            textAlign: "center",
            fontSize: "0.875rem",
            color: "hsl(var(--muted-hsl))",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div>
            Already have an account?{" "}
            <Link href="/auth/vendor/login" style={{ color: "hsl(var(--primary-hsl))", fontWeight: 600 }}>
              Log In
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
