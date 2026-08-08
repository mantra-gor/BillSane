import React, { forwardRef } from "react";
import Field from "./Field";
import Input from "./Input";

interface LabeledInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  title: string;
  required?: boolean;
  hint?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
  /** Applied to the wrapping `Field` — use for grid spans. */
  fieldClassName?: string;
}

/**
 * A labelled text input: `Field` + `Input` wired together.
 *
 * The control id is taken from `name`, which `register()` already supplies —
 * callers don't pass `name` separately, which would collide with the spread.
 */
const LabeledInput = forwardRef<HTMLInputElement, LabeledInputProps>(
  (
    {
      title,
      required = false,
      hint,
      error,
      prefix,
      suffix,
      className = "",
      fieldClassName = "",
      ...rest
    },
    ref
  ) => {
    const fieldId = rest.id ?? rest.name;

    return (
      <Field
        label={title}
        htmlFor={fieldId}
        required={required}
        hint={hint}
        error={error}
        className={fieldClassName}>
        <Input
          ref={ref}
          id={fieldId}
          invalid={Boolean(error)}
          prefix={prefix}
          suffix={suffix}
          className={className}
          {...rest} // last, so hook-form's onChange/onBlur win
        />
      </Field>
    );
  }
);

LabeledInput.displayName = "LabeledInput";

export default LabeledInput;
