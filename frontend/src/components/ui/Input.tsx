import React from "react";
import styles from "./ui.module.css";

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "label"> {
  label?: React.ReactNode;
  error?: string;
}

function getLabelText(node: React.ReactNode): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (React.isValidElement(node)) {
    const children = (node.props as { children?: React.ReactNode })?.children;
    if (Array.isArray(children)) {
      return children.map(getLabelText).join(" ");
    }
    return getLabelText(children);
  }
  return "";
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className = "",
  id,
  ...props
}) => {
  const derivedId = getLabelText(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const inputId = id || (derivedId || undefined);
  return (
    <div className={styles.inputGroup}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`${styles.input} ${error ? styles.inputError : ""} ${className}`}
        {...props}
      />
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
};
