import React from "react";
import styles from "./ui.module.css";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "label"> {
  label?: React.ReactNode;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
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

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  error,
  placeholder,
  className = "",
  id,
  ...props
}) => {
  const derivedId = getLabelText(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const selectId = id || (derivedId || undefined);
  return (
    <div className={styles.inputGroup}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`${styles.input} ${error ? styles.inputError : ""} ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
};
