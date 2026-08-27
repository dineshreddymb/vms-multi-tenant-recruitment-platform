"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isVendor } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isVendor)) {
      router.push("/auth/vendor/login");
    }
  }, [user, loading, isVendor, router]);

  if (loading || !user || !isVendor) {
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

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{
        backgroundColor: "hsl(var(--card-hsl))",
        borderBottom: "1px solid hsl(var(--card-border-hsl))",
        padding: "1rem 2rem",
        boxShadow: "var(--shadow-sm)",
        position: "sticky",
        top: 0,
        zIndex: 100
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            <Link href="/vendor/dashboard" style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "hsl(var(--foreground-hsl))",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}>
              <span style={{ color: "hsl(var(--primary-hsl))" }}>VMS</span> Vendor
            </Link>

            <nav style={{ display: "flex", gap: "1.25rem" }}>
              <Link href="/vendor/dashboard" style={{
                fontSize: "0.9rem",
                fontWeight: 500,
                color: "hsl(var(--foreground-hsl))"
              }}>
                Dashboard
              </Link>
              <Link href="/vendor/job-roles" style={{
                fontSize: "0.9rem",
                fontWeight: 500,
                color: "hsl(var(--foreground-hsl))"
              }}>
                Active Job Roles
              </Link>
              <Link href="/vendor/profile" style={{
                fontSize: "0.9rem",
                fontWeight: 500,
                color: "hsl(var(--foreground-hsl))"
              }}>
                Profile
              </Link>
            </nav>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <span style={{ fontSize: "0.875rem", color: "hsl(var(--muted-hsl))" }}>
              Logged in as: <strong style={{ color: "hsl(var(--foreground-hsl))" }}>{user.name}</strong>
            </span>
            <Button variant="outline" size="sm" onClick={logout} style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "2.5rem 2rem", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
        {children}
      </main>
    </div>
  );
}
