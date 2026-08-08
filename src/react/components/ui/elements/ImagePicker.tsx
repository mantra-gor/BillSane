import { useRef, useState, type ComponentType } from "react";
import { FiTrash2, FiUpload } from "react-icons/fi";
import Button from "./Button";

const MAX_SIZE = 1024 * 1024; // 1MB

interface ImagePickerProps {
  /** Data URL of the current image, or "" for none. */
  value: string;
  onChange: (dataUrl: string) => void;
  label: string;
  hint?: string;
  /** Shown in the well when there's no image. */
  placeholderIcon: ComponentType<{ size?: number; className?: string }>;
  /** Avatars are round; logos are square. */
  shape?: "circle" | "square";
  /** `cover` crops to fill (avatars); `contain` letterboxes (logos). */
  fit?: "cover" | "contain";
}

/**
 * Shared image well used by the profile avatar and the company logo. Reads the
 * file to a data URL — both are stored inline rather than as file paths, so the
 * invoice template can embed them directly.
 */
function ImagePicker({
  value,
  onChange,
  label,
  hint,
  placeholderIcon: PlaceholderIcon,
  shape = "square",
  fit = "contain",
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Image must be smaller than 1MB");
      return;
    }

    setError("");
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  const remove = () => {
    onChange("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div
        className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden border border-line bg-surface-subtle shadow-inset ${
          shape === "circle" ? "rounded-full" : "rounded-2xl"
        }`}>
        {value ? (
          <img
            src={value}
            alt=""
            className={`h-full w-full ${
              fit === "cover" ? "object-cover" : "object-contain p-2"
            }`}
          />
        ) : (
          <PlaceholderIcon size={30} className="text-ink-faint" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink-soft">{label}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<FiUpload size={14} />}
            onClick={() => inputRef.current?.click()}>
            {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<FiTrash2 size={14} />}
              onClick={remove}>
              Remove
            </Button>
          )}
        </div>
        {error ? (
          <p className="mt-2 text-xs font-medium text-danger">{error}</p>
        ) : (
          hint && (
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-ink-muted">
              {hint}
            </p>
          )
        )}
      </div>
    </div>
  );
}

export default ImagePicker;
