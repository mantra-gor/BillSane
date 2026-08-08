// The BillSane glyph rebuilt as inline SVG. The shipped PNG/SVG assets bake in
// navy-on-transparent, which disappears against the dark shell — this version
// takes its colours from props so the same mark works on any surface.
//
// Construction mirrors the original: a solid accent square with four brand
// discs laid over its corners, leaving the concave four-point star visible in
// the middle.

interface BrandMarkProps {
  size?: number;
  /** Colour of the four discs. */
  discColor?: string;
  /** Colour of the star showing through the middle. */
  starColor?: string;
  className?: string;
}

export function BrandGlyph({
  size = 28,
  discColor = "#053247",
  starColor = "#298E9E",
  className = "",
}: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={className}>
      <rect x="26" y="26" width="48" height="48" fill={starColor} />
      <circle cx="26" cy="26" r="23" fill={discColor} />
      <circle cx="74" cy="26" r="23" fill={discColor} />
      <circle cx="26" cy="74" r="23" fill={discColor} />
      <circle cx="74" cy="74" r="23" fill={discColor} />
    </svg>
  );
}

interface BrandLockupProps extends BrandMarkProps {
  /** Wordmark colour. */
  textColor?: string;
  /** Hides the wordmark, leaving just the glyph (collapsed sidebar). */
  glyphOnly?: boolean;
  /** Optional caption under the wordmark. */
  tagline?: string;
}

function BrandMark({
  size = 28,
  discColor = "#053247",
  starColor = "#298E9E",
  textColor = "#053247",
  glyphOnly = false,
  tagline,
  className = "",
}: BrandLockupProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrandGlyph size={size} discColor={discColor} starColor={starColor} />
      {!glyphOnly && (
        <div className="leading-none">
          <div
            className="text-[15px] font-extrabold tracking-[0.16em]"
            style={{ color: textColor }}>
            BILLSANE
          </div>
          {tagline && (
            <div className="mt-1 text-[10px] font-medium tracking-[0.12em] text-ink-faint">
              {tagline}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BrandMark;
