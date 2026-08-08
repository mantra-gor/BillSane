import React from "react";

interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned slot in the header — range pickers, "View all" links. */
  action?: React.ReactNode;
  /** Drops the body padding, for cards whose content is a full-bleed table. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/** The standard content panel: hairline border, soft elevation, optional header. */
function Card({
  title,
  subtitle,
  action,
  flush = false,
  className = "",
  bodyClassName = "",
  children,
}: CardProps) {
  const hasHeader = Boolean(title || action);

  return (
    <section className={`card overflow-hidden ${className}`}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-sm font-semibold text-ink">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-ink-muted">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={`${flush ? "" : "px-5 pb-5"} ${hasHeader ? "" : flush ? "" : "pt-5"} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

export default Card;
