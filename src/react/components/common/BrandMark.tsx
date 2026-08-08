// The BillSane logo. Everything on screen renders the shipped brand PNGs — the
// full lockup (glyph + wordmark) and the square glyph — so there is exactly one
// source of truth for the mark. Both are navy-on-transparent and would vanish
// against the dark shell, so `onDark` seats them on a white plate instead of
// recolouring the artwork.

import lockupSrc from "../../assets/branding/logo-no-background.png";
import glyphSrc from "../../assets/branding/logo-no-background-small.png";

/**
 * Fraction of the lockup PNG's canvas that the artwork actually fills — the
 * export carries transparent padding above and below. Dividing by it lets
 * `size` mean the same thing (rendered glyph height) for both marks.
 */
const LOCKUP_FILL = 0.63;

interface BrandGlyphProps {
  /** Rendered height of the glyph in px. */
  size?: number;
  /** Sits the mark on a white plate so it reads on the dark shell. */
  onDark?: boolean;
  className?: string;
}

export function BrandGlyph({
  size = 28,
  onDark = false,
  className = "",
}: BrandGlyphProps) {
  return (
    <span
      className={`inline-flex ${onDark ? "rounded-lg bg-white p-1.5" : ""} ${className}`}>
      <img src={glyphSrc} alt="BillSane" style={{ height: size, width: size }} />
    </span>
  );
}

interface BrandLockupProps extends BrandGlyphProps {
  /** Hides the wordmark, leaving just the glyph (collapsed sidebar). */
  glyphOnly?: boolean;
  /** Optional caption under the lockup. */
  tagline?: string;
}

function BrandMark({
  size = 28,
  onDark = false,
  glyphOnly = false,
  tagline,
  className = "",
}: BrandLockupProps) {
  if (glyphOnly) {
    return <BrandGlyph size={size} onDark={onDark} className={className} />;
  }

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <span
        className={`inline-flex ${onDark ? "rounded-lg bg-white px-3 py-1.5" : ""}`}>
        <img
          src={lockupSrc}
          alt="BillSane"
          className="w-auto"
          style={{ height: size / LOCKUP_FILL }}
        />
      </span>
      {tagline && (
        <div className="mt-1 text-[10px] font-medium tracking-[0.12em] text-ink-faint">
          {tagline}
        </div>
      )}
    </div>
  );
}

export default BrandMark;
