import React from "react";
import styles from "./ui.module.css";

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  width,
  height,
  circle = false,
}) => {
  const customStyles: React.CSSProperties = {
    width: width || undefined,
    height: height || undefined,
    borderRadius: circle ? "50%" : undefined,
  };

  return (
    <div
      className={`${styles.skeleton} ${className}`}
      style={customStyles}
    />
  );
};
