import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned action cluster. */
  actions?: React.ReactNode;
  /** Optional status chip beside the title. */
  badge?: React.ReactNode;
  className?: string;
}

/** Consistent title block at the top of every screen. */
function PageHeader({
  title,
  description,
  actions,
  badge,
  className = "",
}: PageHeaderProps) {
  return (
    <header
      className={`flex flex-wrap items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-bold leading-tight text-ink">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

export default PageHeader;
