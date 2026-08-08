import React from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  className?: string;
}

/**
 * A native `<select>` wearing the shared `.input-field` shape (the chevron is
 * painted by that class). Native keeps keyboard/type-ahead behaviour for free.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid = false, className = "", children, ...rest }, ref) => {
    return (
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={`input-field ${className}`}
        {...rest}>
        {children}
      </select>
    );
  }
);

Select.displayName = "Select";

export default Select;
