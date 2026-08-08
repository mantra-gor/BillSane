import { useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import "./DatePicker.css";

interface DatePickerProps {
  name?: string;
  value?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  onChange?: (dateStr: string) => void;
  options?: Partial<flatpickr.Options.Options>;
}

function DatePicker({
  name,
  value,
  placeholder,
  className = "",
  disabled = false,
  min,
  max,
  onChange,
  options,
}: DatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<flatpickr.Instance | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!inputRef.current) return;

    fpRef.current = flatpickr(inputRef.current, {
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d M Y",
      altInputClass: `input-field w-full ${className}`,
      allowInput: true,
      disableMobile: true,
      defaultDate: value || undefined,
      minDate: min,
      maxDate: max,
      ...options,
      onChange: (_dates, dateStr) => onChangeRef.current?.(dateStr),
    });

    // flatpickr renders its own visible input (`altInput`) and doesn't carry
    // the placeholder across, which left empty date filters looking like
    // blank boxes.
    if (placeholder) {
      fpRef.current.altInput?.setAttribute("placeholder", placeholder);
    }

    return () => {
      fpRef.current?.destroy();
      fpRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fpRef.current?.setDate(value || "", false);
  }, [value]);

  useEffect(() => {
    fpRef.current?.set("minDate", min || null);
  }, [min]);

  useEffect(() => {
    fpRef.current?.set("maxDate", max || null);
  }, [max]);

  useEffect(() => {
    if (disabled) {
      fpRef.current?.altInput?.setAttribute("disabled", "true");
    } else {
      fpRef.current?.altInput?.removeAttribute("disabled");
    }
  }, [disabled]);

  return (
    <input
      ref={inputRef}
      type="hidden"
      name={name}
      id={name}
      placeholder={placeholder}
      disabled={disabled}
      defaultValue={value}
    />
  );
}

export default DatePicker;
