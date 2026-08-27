"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function VendorProfile() {
  const { refreshProfile } = useAuth();
  interface CompanyMembership {
    id: string;
    vendor_id: string;
    company_name: string;
    status: string;
  }
  const [profile, setProfile] = useState<{ id: string; vendor_user_reference: string; name: string; email: string; mobile: string; vendor_id: string; companies: CompanyMembership[] } | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<{ id: string; vendor_user_reference: string; name: string; email: string; mobile: string; vendor_id: string; companies: CompanyMembership[] }>("/api/v1/vendor/profile");
      setProfile(data);
      setName(data.name);
      setMobile(data.mobile);
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      setError(error.detail || "Failed to load profile details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      await api.patch("/api/v1/vendor/profile", {
        name,
        mobile
      });
      setSuccess("Profile updated successfully.");
      await refreshProfile();
    } catch (err) {
    const error = err as { detail?: string; status?: number };
      setError(error.detail || "Failed to update profile. Please check your inputs.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "600px" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Profile Settings</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ height: "40px", backgroundColor: "hsl(var(--muted-bg-hsl))", borderRadius: "8px", animation: "pulse 1.5s infinite" }} />
          <div style={{ height: "40px", backgroundColor: "hsl(var(--muted-bg-hsl))", borderRadius: "8px", animation: "pulse 1.5s infinite" }} />
          <div style={{ height: "40px", backgroundColor: "hsl(var(--muted-bg-hsl))", borderRadius: "8px", animation: "pulse 1.5s infinite" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "600px", display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Profile Settings</h1>
        <p style={{ color: "hsl(var(--muted-hsl))", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          View and manage your account information. Company association is managed by administrators.
        </p>
      </div>

      {success && (
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "hsl(var(--success-bg-hsl))",
          color: "hsl(var(--success-hsl))",
          fontSize: "0.875rem",
          border: "1px solid rgba(16, 185, 129, 0.2)"
        }}>
          {success}
        </div>
      )}

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

      <form onSubmit={handleSubmit} style={{
        backgroundColor: "hsl(var(--card-hsl))",
        border: "1px solid hsl(var(--card-border-hsl))",
        borderRadius: "var(--radius-lg)",
        padding: "2rem",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem"
      }}>
        {/* Read only details */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          borderBottom: "1px solid hsl(var(--card-border-hsl))",
          paddingBottom: "1.5rem",
          marginBottom: "0.5rem"
        }}>
          <div>
            <label style={{ fontSize: "0.8rem", color: "hsl(var(--muted-hsl))", fontWeight: 500 }}>Login Email</label>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: "0.25rem" }}>{profile?.email}</div>
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", color: "hsl(var(--muted-hsl))", fontWeight: 500 }}>Vendor User ID</label>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: "0.25rem" }}>{profile?.vendor_user_reference}</div>
          </div>
          <div style={{ gridColumn: "span 2", marginTop: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "hsl(var(--muted-hsl))", fontWeight: 500 }}>Company</label>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: "0.25rem" }}>
              {profile?.companies?.find(c => c.vendor_id === profile.vendor_id)?.company_name || "N/A"}
            </div>
          </div>
        </div>

        {/* Editable Form Inputs */}
        <Input
          label="Your Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Name"
        />

        <Input
          label="Mobile Number (Indian)"
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          required
          placeholder="Mobile Number"
        />

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
          <Button type="submit" loading={saving}>
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
