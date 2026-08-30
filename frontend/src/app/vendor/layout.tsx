"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isVendor } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      <header className="vendor-header" style={{
        backgroundColor: "hsl(var(--card-hsl))",
        borderBottom: "1px solid hsl(var(--card-border-hsl))",
        padding: "1rem 2rem",
        boxShadow: "var(--shadow-sm)",
        position: "sticky",
        top: 0,
        zIndex: 100
      }}>
        <div className="vendor-header-inner" style={{
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

            <nav className="vendor-nav" style={{ display: "flex", gap: "0.25rem" }} aria-label="Vendor navigation">
              <Link href="/vendor/dashboard" aria-current={pathname === "/vendor/dashboard" ? "page" : undefined}>
                Dashboard
              </Link>
              <Link href="/vendor/job-roles" aria-current={pathname === "/vendor/job-roles" ? "page" : undefined}>
                Active Job Roles
              </Link>
              <Link href="/vendor/profile" aria-current={pathname === "/vendor/profile" ? "page" : undefined}>
                Profile
              </Link>
            </nav>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              className="mobile-nav-button"
              aria-label="Toggle vendor navigation"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="vendor-user-label" style={{ fontSize: "0.875rem", color: "hsl(var(--muted-hsl))" }}>
              Logged in as: <strong style={{ color: "hsl(var(--foreground-hsl))" }}>{user.name}</strong>
            </span>
            <Button variant="outline" size="sm" onClick={logout} style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem" }}>
              Logout
            </Button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav className="vendor-mobile-nav" aria-label="Vendor mobile navigation">
            <Link href="/vendor/dashboard" onClick={() => setMobileNavOpen(false)}>Dashboard</Link>
            <Link href="/vendor/job-roles" onClick={() => setMobileNavOpen(false)}>Active Job Roles</Link>
            <Link href="/vendor/profile" onClick={() => setMobileNavOpen(false)}>Profile</Link>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="app-main" style={{ flex: 1, padding: "2.5rem 2rem", width: "100%" }}>
        {children}
      </main>
    </div>
  );
}
