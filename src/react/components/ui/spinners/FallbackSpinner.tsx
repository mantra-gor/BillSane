import { BrandGlyph } from "../../common/BrandMark";

/**
 * Full-screen boot / suspense state. Uses the brand glyph rather than a generic
 * spinner so the first paint of the app is already on-brand.
 */
function FallbackSpinner({ label = "Loading BillSane…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-screen w-full flex-col items-center justify-center gap-5 bg-canvas">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-munsell_blue/15" />
        <BrandGlyph size={40} className="relative animate-pulse" />
      </div>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
    </div>
  );
}

export default FallbackSpinner;
