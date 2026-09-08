"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function RecruiterSignup() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [companiesList, setCompaniesList] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>("/api/v1/auth/companies?signup=true")
      .then(data => setCompaniesList(data))
      .catch(err => console.error("Failed to load companies list", err));
  }, []);

  const handleCompanyToggle = (companyId: string, checked: boolean) => {
    if (checked) {
      setSelectedCompanies(prev => [...prev, companyId]);
    } else {
      setSelectedCompanies(prev => prev.filter(id => id !== companyId));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (selectedCompanies.length === 0) {
      setError("Select Organizations You Work For: Please select at least one organization.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await api.post("/api/v1/auth/recruiter/signup", {
        full_name: fullName,
        email,
        mobile,
        password,
        confirm_password: confirmPassword,
        companies: selectedCompanies
      }, { skipAuth: true });

      // Redirect to pending approval state message
      router.push("/auth/pending?type=recruiter");
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      setError(error.detail || "Signup request failed. Please check your inputs.");
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
        maxWidth: "450px",
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
            Recruiter Signup
          </h1>
          <p style={{ fontSize: "0.875rem", color: "hsl(var(--muted-hsl))" }}>
            Submit an access request for verification
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

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.25rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "hsl(var(--foreground-hsl))" }}>
              Select Organizations You Work For <span style={{ color: "hsl(var(--danger-hsl, #ef4444))" }}>*</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem 1.5rem", marginTop: "0.25rem" }}>
              {companiesList.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem" }}>
                  <input
                    type="checkbox"
                    checked={selectedCompanies.includes(c.id)}
                    onChange={(e) => handleCompanyToggle(c.id, e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "hsl(var(--primary-hsl))" }}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <Input
            label="Full Name"
            type="text"
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
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
            label="Mobile Number (with country code)"
            type="tel"
            placeholder="+91 9988776655"
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
            Request Access
          </Button>
        </form>

        <div style={{
          marginTop: "1.5rem",
          textAlign: "center",
          fontSize: "0.875rem",
          color: "hsl(var(--muted-hsl))"
        }}>
          Already have an account?{" "}
          <Link href="/auth/recruiter/login" style={{ color: "hsl(var(--primary-hsl))", fontWeight: 600 }}>
            Log In
          </Link>
        </div>
      </div>
    </main>
  );
}
