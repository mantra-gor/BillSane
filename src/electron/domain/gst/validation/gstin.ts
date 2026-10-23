/**
 * GSTIN format and checksum validation.
 *
 * Pure and synchronous, so the same function backs the main-process validator
 * and the renderer's live field feedback through `gst:validateGstin` — one
 * answer, not two implementations that drift.
 *
 * What this proves and what it does not: a GSTIN that passes here is
 * *well-formed*, which catches the transposed digits and dropped characters
 * that make up nearly every real mistake at a counter. It says nothing about
 * whether the number is registered, active, or belongs to the person quoting
 * it. Only the IRP's GSTIN lookup answers that, and it arrives in Phase 5 —
 * until then "valid" in this module means "structurally valid".
 */

/**
 * A GSTIN is 15 characters:
 *
 *   ┌──┬───────────┬─┬─┬─┐
 *   │27│AAPCS9575E │1│Z│5│
 *   └──┴───────────┴─┴─┴─┘
 *    │       │      │ │ └── checksum over the first 14
 *    │       │      │ └──── 'Z', reserved
 *    │       │      └────── entity number for this PAN in this state
 *    │       └───────────── PAN of the registered person
 *    └───────────────────── state code
 */
const GSTIN_LENGTH = 15;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** The checksum alphabet: digits then letters, index = value, base 36. */
const CHECKSUM_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Valid state/UT codes, plus 97 (other territory) and 99 (centre jurisdiction).
 *
 * Here rather than in a rule pack *for now* — it belongs in `gst-rules` once the
 * pack loader lands, because this list has changed (Daman & Diu and Dadra &
 * Nagar Haveli merged into 26, and 38 was added for Ladakh).
 */
const STATE_CODES = new Set([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
  "31", "32", "33", "34", "35", "36", "37", "38", "97", "99",
]);

export type GstinErrorCode =
  | "empty"
  | "length"
  | "charset"
  | "state_code"
  | "pan"
  | "entity_number"
  | "reserved_character"
  | "checksum";

export type GstinValidation =
  | { ok: true; gstin: string; stateCode: string; pan: string; entityNumber: string }
  | { ok: false; code: GstinErrorCode; message: string };

/**
 * Normalise before validating — a GSTIN copied out of an email arrives with
 * spaces and in whatever case the sender used, and rejecting that is pedantry
 * rather than validation.
 */
export function normalizeGstin(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function validateGstin(value: string): GstinValidation {
  const gstin = normalizeGstin(value ?? "");

  if (gstin === "") {
    return { ok: false, code: "empty", message: "Enter a GSTIN." };
  }
  if (gstin.length !== GSTIN_LENGTH) {
    return {
      ok: false,
      code: "length",
      message: `A GSTIN is 15 characters — this one has ${gstin.length}.`,
    };
  }
  if (!/^[0-9A-Z]{15}$/.test(gstin)) {
    return {
      ok: false,
      code: "charset",
      message: "A GSTIN contains only letters and digits.",
    };
  }

  const stateCode = gstin.slice(0, 2);
  if (!STATE_CODES.has(stateCode)) {
    return {
      ok: false,
      code: "state_code",
      message: `${stateCode} is not a valid state code.`,
    };
  }

  const pan = gstin.slice(2, 12);
  if (!PAN_PATTERN.test(pan)) {
    return {
      ok: false,
      code: "pan",
      message: `Characters 3–12 should be a PAN — "${pan}" isn't one.`,
    };
  }

  const entityNumber = gstin[12];
  if (entityNumber === "0") {
    return {
      ok: false,
      code: "entity_number",
      message: "The 13th character is the entity number and can't be 0.",
    };
  }

  if (gstin[13] !== "Z") {
    return {
      ok: false,
      code: "reserved_character",
      message: "The 14th character of a GSTIN is always Z.",
    };
  }

  if (gstin[14] !== checksumCharacter(gstin)) {
    // Deliberately does not reveal the expected character. It is a check digit,
    // not a puzzle — telling someone which character would make their typo
    // "valid" invites them to change that one instead of finding the real
    // number, and a well-formed wrong GSTIN is worse than an obvious mistake.
    return {
      ok: false,
      code: "checksum",
      message: "That GSTIN's check digit doesn't match — look for a typo.",
    };
  }

  return { ok: true, gstin, stateCode, pan, entityNumber };
}

/**
 * The check digit for the first 14 characters.
 *
 * Base-36 with alternating weights of 1 and 2, each weighted product folded by
 * adding its quotient and remainder against 36, and the total complemented to
 * the next multiple of 36 — the Luhn-mod-N scheme, over the alphabet above.
 */
function checksumCharacter(gstin: string): string {
  let sum = 0;
  for (let i = 0; i < GSTIN_LENGTH - 1; i += 1) {
    const value = CHECKSUM_ALPHABET.indexOf(gstin[i]);
    const weighted = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(weighted / 36) + (weighted % 36);
  }
  return CHECKSUM_ALPHABET[(36 - (sum % 36)) % 36];
}

/** The state code a GSTIN belongs to, or null if it isn't well-formed. */
export function stateCodeOf(value: string): string | null {
  const result = validateGstin(value);
  return result.ok ? result.stateCode : null;
}

/**
 * The PAN inside a GSTIN.
 *
 * This is what ties several registrations to one business: aggregate turnover —
 * and therefore e-invoice applicability — is assessed across every GSTIN under
 * one PAN, so multi-registration setups check this rather than comparing GSTINs.
 */
export function panOf(value: string): string | null {
  const result = validateGstin(value);
  return result.ok ? result.pan : null;
}
