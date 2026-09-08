"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { getThemeStyles, CompanyBrandHeader } from "@/components/CompanyBranding";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isVendor } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const themeStyles = getThemeStyles(user?.activeCompanyName);

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

  const isLinkActive = (path: string) => pathname === path;
  const avatarInitial = (user.name?.trim() || user.email || "?").charAt(0).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {themeStyles && <style dangerouslySetInnerHTML={{ __html: themeStyles }} />}
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
          width: "100%",
          flexWrap: "wrap",
          gap: "1rem"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap" }}>
            <Link href="/vendor/dashboard" style={{ textDecoration: "none" }}>
              <CompanyBrandHeader companyName={user?.activeCompanyName} portalTitle="Vendor" />
            </Link>

            <nav style={{ display: "flex", gap: "1.25rem" }}>
              <Link
                href="/vendor/dashboard"
                className={`vendor-nav-link${isLinkActive("/vendor/dashboard") ? " active" : ""}`}
                style={{
                  fontSize: "0.9rem",
                  fontWeight: isLinkActive("/vendor/dashboard") ? 700 : 500,
                  color: isLinkActive("/vendor/dashboard") ? "hsl(var(--primary-hsl))" : "hsl(var(--foreground-hsl))"
                }}
              >
                Dashboard
              </Link>
              <Link
                href="/vendor/job-roles"
                className={`vendor-nav-link${isLinkActive("/vendor/job-roles") ? " active" : ""}`}
                style={{
                  fontSize: "0.9rem",
                  fontWeight: isLinkActive("/vendor/job-roles") ? 700 : 500,
                  color: isLinkActive("/vendor/job-roles") ? "hsl(var(--primary-hsl))" : "hsl(var(--foreground-hsl))"
                }}
              >
                Active Job Roles
              </Link>
              <Link
                href="/vendor/profile"
                className={`vendor-nav-link${isLinkActive("/vendor/profile") ? " active" : ""}`}
                style={{
                  fontSize: "0.9rem",
                  fontWeight: isLinkActive("/vendor/profile") ? 700 : 500,
                  color: isLinkActive("/vendor/profile") ? "hsl(var(--primary-hsl))" : "hsl(var(--foreground-hsl))"
                }}
              >
                Profile
              </Link>
            </nav>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: "hsl(var(--primary-hsl))",
                color: "hsl(var(--primary-foreground-hsl))",
                fontSize: "0.8rem",
                fontWeight: 700,
                flexShrink: 0,
                userSelect: "none"
              }}
              aria-hidden="true"
            >
              {avatarInitial}
            </div>
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
