import { describe, expect, test } from "vitest";
import { normalizeGstin, panOf, stateCodeOf, validateGstin } from "./gstin.js";

/**
 * The first two are GSTINs published as examples in GST documentation, so they
 * are independent evidence that the checksum here matches the real one rather
 * than merely matching itself. The rest were generated against this
 * implementation for state-code coverage, and are only as trustworthy as the
 * two above make the algorithm.
 */
const VALID = {
  maharashtra: "27AAPFU0939F1ZV",
  gujarat: "24AAACC1206D1ZM",
  karnataka: "29AAPFU0939F1ZR",
  delhi: "07AAPFU0939F1ZX",
  uttarPradesh: "09AAPFU0939F1ZT",
  chandigarh: "04AAPFU0939F1Z3",
};

describe("validateGstin", () => {
  test.each(Object.entries(VALID))("accepts a valid GSTIN (%s)", (_state, gstin) => {
    const result = validateGstin(gstin);
    expect(result.ok).toBe(true);
  });

  test("returns the parts a caller needs", () => {
    const result = validateGstin(VALID.maharashtra);
    expect(result).toEqual({
      ok: true,
      gstin: "27AAPFU0939F1ZV",
      stateCode: "27",
      pan: "AAPFU0939F",
      entityNumber: "1",
    });
  });

  test("normalises spacing and case rather than rejecting them", () => {
    // A GSTIN pasted out of an email arrives like this constantly.
    expect(validateGstin("  27aapfu0939f1zv  ").ok).toBe(true);
    expect(validateGstin("27-AAPFU0939F-1ZV").ok).toBe(true);
  });

  test("rejects an empty value", () => {
    expect(validateGstin("")).toMatchObject({ ok: false, code: "empty" });
    expect(validateGstin("   ")).toMatchObject({ ok: false, code: "empty" });
  });

  test("rejects the wrong length", () => {
    expect(validateGstin("27AAPFU0939F1Z")).toMatchObject({ ok: false, code: "length" });
    expect(validateGstin("27AAPFU0939F1ZVV")).toMatchObject({ ok: false, code: "length" });
  });

  test("rejects characters outside the alphabet", () => {
    expect(validateGstin("27AAPFU0939F1Z!")).toMatchObject({ ok: false, code: "charset" });
  });

  test("rejects an unassigned state code", () => {
    expect(validateGstin("00AAPFU0939F1ZV")).toMatchObject({ ok: false, code: "state_code" });
    expect(validateGstin("39AAPFU0939F1ZV")).toMatchObject({ ok: false, code: "state_code" });
  });

  test("rejects a malformed PAN", () => {
    // Digits where the PAN's leading letters belong.
    expect(validateGstin("27123450939F1ZV")).toMatchObject({ ok: false, code: "pan" });
  });

  test("rejects entity number 0", () => {
    expect(validateGstin("27AAPFU0939F0ZV")).toMatchObject({
      ok: false,
      code: "entity_number",
    });
  });

  test("rejects a 14th character that isn't Z", () => {
    expect(validateGstin("27AAPFU0939F1YV")).toMatchObject({
      ok: false,
      code: "reserved_character",
    });
  });

  /**
   * The point of a check digit: the errors people actually make — one wrong
   * character, two swapped — stop being silently acceptable.
   */
  test("catches a single-character typo", () => {
    expect(validateGstin("27AAPFU0939F1ZW")).toMatchObject({ ok: false, code: "checksum" });
    expect(validateGstin("27AAPFU0938F1ZV")).toMatchObject({ ok: false, code: "checksum" });
  });

  test("catches transposed characters", () => {
    // AAPFU0939F → AAPFU0993F, a plain digit swap.
    expect(validateGstin("27AAPFU0993F1ZV")).toMatchObject({ ok: false, code: "checksum" });
  });

  test("exactly one check digit completes a given prefix", () => {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const matches = [...alphabet].filter((c) => validateGstin(`27AAPFU0939F1Z${c}`).ok);
    expect(matches).toEqual(["V"]);
  });

  test("does not disclose the expected check digit", () => {
    const result = validateGstin("27AAPFU0939F1ZW");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("V");
  });
});

describe("normalizeGstin", () => {
  test("strips spacing and upper-cases", () => {
    expect(normalizeGstin(" 27 aapfu0939f 1zv ")).toBe("27AAPFU0939F1ZV");
  });
});

describe("stateCodeOf / panOf", () => {
  test("read the parts out of a valid GSTIN", () => {
    expect(stateCodeOf(VALID.delhi)).toBe("07");
    expect(panOf(VALID.delhi)).toBe("AAPFU0939F");
  });

  test("are null for anything malformed", () => {
    expect(stateCodeOf("nonsense")).toBeNull();
    expect(panOf("nonsense")).toBeNull();
  });

  /**
   * The multi-registration case: two GSTINs are the same business when their
   * PANs match, which is the level aggregate turnover — and therefore
   * e-invoice applicability — is assessed at.
   */
  test("identify two registrations of one business", () => {
    expect(panOf(VALID.maharashtra)).toBe(panOf(VALID.karnataka));
    expect(stateCodeOf(VALID.maharashtra)).not.toBe(stateCodeOf(VALID.karnataka));
  });
});
