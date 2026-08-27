import React from "react";
import styles from "./ui.module.css";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline" | "textBtn";
  loading?: boolean;
  size?: "sm" | "md" | "lg" | string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  loading,
  className = "",
  disabled,
  ...props
}) => {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 30" strokeLinecap="round" />
          </svg>
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  );
};
