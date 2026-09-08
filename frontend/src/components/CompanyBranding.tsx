import React from "react";

// Company-specific branding colors matching Recruiter UI
export const COMPANY_BRANDING = {
  IOSYS: {
    primaryColor: "#1F4E47",
    secondaryColor: "#2CDBA3",
    lightColor: "rgba(44, 219, 163, 0.15)",
    name: "IOSYS",
  },
  Volantis: {
    primaryColor: "#1E63E9",
    secondaryColor: "#3882F6",
    lightColor: "rgba(30, 99, 233, 0.1)",
    name: "VOLANTIS",
  },
  default: {
    primaryColor: "hsl(var(--primary-hsl))",
    secondaryColor: "hsl(var(--primary-hsl))",
    lightColor: "rgba(37, 99, 235, 0.1)",
    name: "VMS",
  },
};

// Helper to get company branding
export const getCompanyBranding = (companyName?: string) => {
  if (!companyName) return COMPANY_BRANDING.default;

  const normalizedName = companyName.toLowerCase();
  if (normalizedName.includes("iosys")) {
    return COMPANY_BRANDING.IOSYS;
  } else if (normalizedName.includes("volantis")) {
    return COMPANY_BRANDING.Volantis;
  }
  return COMPANY_BRANDING.default;
};

// Generates theme style overrides identical to Recruiter
export const getThemeStyles = (companyName?: string): string => {
  if (!companyName) return "";
  const companyUpper = companyName.toUpperCase();
  const isIOSYS = companyUpper.includes("IOSYS");
  const isVolantis = companyUpper.includes("VOLANTIS");

  if (isIOSYS) {
    return `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@500;600;700;800&display=swap');

      .font-logo-brand-iosys {
        font-family: 'Manrope', sans-serif !important;
      }

      :root {
        --primary-hsl: 171, 43%, 21% !important;
        --primary-hover-hsl: 171, 43%, 15% !important;
        --secondary-hsl: 162, 29%, 86% !important; /* secondary-container #d1e7df */
        --secondary-foreground-hsl: 171, 43%, 21% !important; /* on-secondary-container #1a4d44 */
        --accent-hsl: 161, 71%, 52% !important;
        --muted-bg-hsl: 171, 43%, 95% !important;
        --card-border-hsl: 171, 15%, 88% !important;
        --background-hsl: 210, 40%, 98% !important;

        --secondary-bg-hsl: 0, 0%, 100% !important;
        --secondary-text-hsl: 171, 43%, 21% !important;
        --secondary-border-hsl: 171, 43%, 21% !important;
        --secondary-hover-bg-hsl: 171, 43%, 95% !important;
      }

      .vendor-nav-link {
        font-family: 'Inter', sans-serif !important;
        color: hsl(var(--foreground-hsl));
        transition: color 0.15s ease, border-color 0.15s ease;
      }

      .vendor-nav-link:hover {
        color: hsl(var(--primary-hsl));
      }

      .vendor-nav-link.active {
        font-weight: 700 !important;
        color: hsl(var(--primary-hsl)) !important;
      }
    `;
  } else if (isVolantis) {
    return `
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@500;600;700;800&display=swap');

      .font-logo-brand {
        font-family: 'Nunito', sans-serif !important;
        letter-spacing: 0.05em !important;
      }

      .font-logo-text {
        font-family: 'Inter', sans-serif !important;
      }

      :root {
        --primary-hsl: 220, 82%, 52% !important;
        --primary-hover-hsl: 217, 91%, 59% !important;
        --secondary-hsl: 220, 82%, 95% !important;
        --secondary-foreground-hsl: 220, 82%, 52% !important;
        --accent-hsl: 217, 91%, 59% !important;
        --muted-bg-hsl: 220, 82%, 95% !important;
        --card-border-hsl: 220, 15%, 88% !important;
        --background-hsl: 210, 40%, 98% !important;

        --secondary-bg-hsl: 0, 0%, 100% !important;
        --secondary-text-hsl: 220, 82%, 52% !important;
        --secondary-border-hsl: 220, 82%, 52% !important;
        --secondary-hover-bg-hsl: 220, 82%, 95% !important;
      }

      .vendor-nav-link {
        font-family: 'Inter', sans-serif !important;
        color: hsl(var(--foreground-hsl));
        transition: color 0.15s ease, border-color 0.15s ease;
      }

      .vendor-nav-link:hover {
        color: hsl(var(--primary-hsl));
      }

      .vendor-nav-link.active {
        font-weight: 700 !important;
        color: hsl(var(--primary-hsl)) !important;
      }
    `;
  }

  return "";
};

// Company Badge Component identical to Recruiter's renderCompanyBadge
export const CompanyBadge: React.FC<{ companyName?: string; style?: React.CSSProperties }> = ({
  companyName,
  style,
}) => {
  if (!companyName) return null;
  const isIOSYS = companyName.toUpperCase().includes("IOSYS");
  const label = isIOSYS ? "IOSYS" : "Volantis";

  const textColor = isIOSYS ? "#1a4d44" : "#2563eb";
  const bgColor = isIOSYS ? "#E6F4F1" : "#e0e7ff";
  const borderColor = isIOSYS ? "#b9ede0" : "#bfdbfe";
  const borderRadius = "8px";
  const padding = "0.375rem 1rem";
  const fontSize = "0.95rem";
  const fontFamily = "'Inter', sans-serif";
  const letterSpacing = "normal";

  return (
    <span
      style={{
        display: "inline-block",
        width: "fit-content",
        fontSize: fontSize,
        fontFamily: fontFamily,
        fontWeight: 700,
        padding: padding,
        borderRadius: borderRadius,
        backgroundColor: bgColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
        textTransform: "none",
        letterSpacing: letterSpacing,
        lineHeight: 1.2,
        ...style,
      }}
    >
      {label}
    </span>
  );
};

// Brand Header Component for Vendor Layout
export const CompanyBrandHeader: React.FC<{
  companyName?: string;
  portalTitle?: string;
}> = ({ companyName, portalTitle = "Vendor" }) => {
  const companyUpper = companyName?.toUpperCase() || "";
  const isIOSYS = companyUpper.includes("IOSYS");
  const isVolantis = companyUpper.includes("VOLANTIS");

  if (isIOSYS) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              position: "relative",
              width: "72px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <img
              alt="IOSYS Logo"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9XFHzYFby7fSTSjWz2GxibEOt4H66uMbk0ligHFVt60PEZpozd_nhxelD-Q_BPZXGjLbwWrpDMruv2_dQcTd0nX5EmUvZ0iL4IYwnPm0xkIBeyGuvTb8d2PqW56QqISqOwXofKvbDsAOPMhzcSSVh2KIcPuNNMSl62cXCIAnylWAUv_d_pHV928OrVrHMAaYWXMfQblPCIThBC1fH6gS1mSovnmBwMTw4kd3vS3Qwmtnqdlh7hbw0C4y0tsaNxudcjs"
            />
          </div>
          <span
            className="font-logo-brand-iosys"
            style={{
              color: "#111827",
              fontSize: "19px",
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            {portalTitle}
          </span>
        </div>
        <CompanyBadge companyName="IOSYS" />
      </div>
    );
  }

  if (isVolantis) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <div
            style={{
              position: "relative",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <img
              alt="Volantis Logo"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzCPDVoQzCghHXcR7aPTPE9wsXukucixGZNIII769_GI8UBXDCosK_W2cKereznCUfB-_t0M9T97SQf3SF_aKuH6XmREmDpB_Zifcq2tEp3KTbLPMj26_1MLVDl_CbWhCIvQGoFOp6raJSkSFfsnlGh2eVQK7jvFYi1VFm5tkLNuOfiFREahPR5GaD9ZIUGpUIJb88I0uqbH20Q_dFSQFtyDlCPEt7grDS4OuN5zdY3eTms2dKvJquKjaRNRzVEdBHFBs"
            />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
            <span
              className="font-logo-brand"
              style={{
                color: "#2563eb",
                fontSize: "19px",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                lineHeight: 1,
              }}
            >
              VOLANTIS
            </span>
            <span
              className="font-logo-text"
              style={{
                color: "#111827",
                fontSize: "19px",
                fontWeight: 700,
                letterSpacing: "-0.025em",
                lineHeight: 1,
              }}
            >
              {portalTitle}
            </span>
          </div>
        </div>
        <CompanyBadge companyName="Volantis" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "hsl(var(--primary-hsl))",
          }}
        >
          VMS
        </span>
        <span
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "hsl(var(--foreground-hsl))",
          }}
        >
          {portalTitle}
        </span>
      </div>
      {companyName && <CompanyBadge companyName={companyName} />}
    </div>
  );
};
