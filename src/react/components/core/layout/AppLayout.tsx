import React, { ReactNode } from "react";

interface AppLayoutProps {
  /** Caps the content column so wide monitors don't stretch tables to nonsense. */
  width?: "default" | "wide" | "full";
  /** Drops the padding entirely — for full-bleed screens like the invoice counter. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

const WIDTHS = {
  default: "max-w-[1400px]",
  wide: "max-w-[1700px]",
  full: "max-w-none",
};

/**
 * The standard page container inside the app shell. Pages compose this rather
 * than repeating padding and max-width, which is what kept the old screens
 * subtly misaligned with each other.
 */
const AppLayout: React.FC<AppLayoutProps> = ({
  width = "default",
  flush = false,
  className = "",
  children,
}) => {
  return (
    <div
      className={`mx-auto w-full animate-fade-in ${WIDTHS[width]} ${
        flush ? "" : "p-6"
      } ${className}`}>
      {children}
    </div>
  );
};

export default AppLayout;
