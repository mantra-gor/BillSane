/**
 * Shortcut hints have to read correctly on the platform they're shown on —
 * "⌘K" on a Windows build looks like a bug.
 */
export const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.userAgent);

/** The chord modifier: ⌘ on macOS, Ctrl elsewhere. */
export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

/**
 * True when the event carries the platform's primary modifier. Accepts both
 * DOM and React keyboard events - only the two flags are needed.
 */
export function hasModifier(e: {
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean {
  return IS_MAC ? e.metaKey : e.ctrlKey;
}
