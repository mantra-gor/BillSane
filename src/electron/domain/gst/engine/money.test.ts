import { describe, expect, test } from "vitest";
import {
  type Paise,
  add,
  applyRate,
  basisPoints,
  formatRupees,
  fromRupees,
  multiplyByQuantity,
  subtract,
  taxableFromInclusive,
  toRupees,
} from "./money.js";

const GST_18 = basisPoints(18);
const GST_5 = basisPoints(5);
const GST_12 = basisPoints(12);
const GST_28 = basisPoints(28);

describe("fromRupees", () => {
  test("parses whole and fractional rupees", () => {
    expect(fromRupees("1234.56")).toBe(123456);
    expect(fromRupees("1234.5")).toBe(123450);
    expect(fromRupees("1234")).toBe(123400);
    expect(fromRupees("0.01")).toBe(1);
  });

  test("treats blank as zero — an empty grid cell is absence, not an error", () => {
    expect(fromRupees("")).toBe(0);
    expect(fromRupees("   ")).toBe(0);
  });

  test("handles negatives, which credit notes and round-off need", () => {
    expect(fromRupees("-0.50")).toBe(-50);
    expect(fromRupees("-1234.56")).toBe(-123456);
  });

  test("rounds beyond two decimals half away from zero", () => {
    expect(fromRupees("1234.565")).toBe(123457);
    expect(fromRupees("1234.564")).toBe(123456);
    expect(fromRupees("0.005")).toBe(1);
    expect(fromRupees("-0.005")).toBe(-1);
  });

  /**
   * The reason this module exists. `0.1 + 0.2` is 0.30000000000000004 as a
   * double; as paise it is 30, exactly, and stays that way however many lines
   * an invoice has.
   */
  test("is exact where floating point is not", () => {
    expect(add(fromRupees("0.1"), fromRupees("0.2"))).toBe(30);
    const hundredth = fromRupees("0.01");
    let total = 0 as Paise;
    for (let i = 0; i < 100; i += 1) total = add(total, hundredth);
    expect(total).toBe(100);
    expect(toRupees(total)).toBe(1);
  });

  test("rejects text that isn't an amount", () => {
    expect(() => fromRupees("twelve")).toThrow();
    expect(() => fromRupees("1.2.3")).toThrow();
  });
});

describe("formatRupees / toRupees", () => {
  test("always shows two decimals", () => {
    expect(formatRupees(123456 as Paise)).toBe("1234.56");
    expect(formatRupees(5 as Paise)).toBe("0.05");
    expect(formatRupees(100 as Paise)).toBe("1.00");
    expect(formatRupees(-50 as Paise)).toBe("-0.50");
  });

  test("converts back for decimal(12,2) storage", () => {
    expect(toRupees(123456 as Paise)).toBe(1234.56);
  });
});

describe("basisPoints", () => {
  test("covers every GST rate, including the fractional ones", () => {
    expect(basisPoints(18)).toBe(1800);
    expect(basisPoints(5)).toBe(500);
    expect(basisPoints(2.5)).toBe(250);
    expect(basisPoints(0.25)).toBe(25);
    expect(basisPoints(0)).toBe(0);
  });
});

describe("multiplyByQuantity", () => {
  test("multiplies a rate by whole and fractional quantities", () => {
    expect(multiplyByQuantity(fromRupees("100"), "3")).toBe(30000);
    expect(multiplyByQuantity(fromRupees("100"), "2.5")).toBe(25000);
    expect(multiplyByQuantity(fromRupees("99.99"), "7")).toBe(69993);
  });

  test("rounds the line to whole paise once", () => {
    // 0.33 × 3.33 = 1.0989 → 1.10
    expect(multiplyByQuantity(fromRupees("0.33"), "3.33")).toBe(110);
  });

  test("a zero quantity is a zero line, not an error", () => {
    expect(multiplyByQuantity(fromRupees("100"), "0")).toBe(0);
  });
});

describe("applyRate", () => {
  test("computes the ordinary GST rates", () => {
    expect(applyRate(fromRupees("100"), GST_18)).toBe(1800);
    expect(applyRate(fromRupees("1000"), GST_5)).toBe(5000);
    expect(applyRate(fromRupees("2500"), GST_12)).toBe(30000);
  });

  test("rounds half away from zero", () => {
    // 0.05 × 5% = 0.0025 → rounds to 0.00; 0.10 × 5% = 0.005 → 0.01
    expect(applyRate(fromRupees("0.05"), GST_5)).toBe(0);
    expect(applyRate(fromRupees("0.10"), GST_5)).toBe(1);
  });

  test("a nil rate produces no tax", () => {
    expect(applyRate(fromRupees("999.99"), basisPoints(0))).toBe(0);
  });

  test("stays exact on amounts far larger than a counter will ever see", () => {
    // 9_999_999_999 paise × 28% = 2_799_999_999.72 → 2_800_000_000.
    // Well past 2^53 as an intermediate product, which is why the maths is
    // done in BigInt rather than with `*`.
    expect(applyRate(fromRupees("99999999.99"), GST_28)).toBe(2_800_000_000);
  });
});

describe("taxableFromInclusive", () => {
  test("recovers the taxable value from an MRP", () => {
    // ₹118 inclusive of 18% is ₹100 taxable.
    expect(taxableFromInclusive(fromRupees("118"), GST_18)).toBe(10000);
    expect(taxableFromInclusive(fromRupees("105"), GST_5)).toBe(10000);
    expect(taxableFromInclusive(fromRupees("128"), GST_28)).toBe(10000);
  });

  test("round-trips the common retail price points", () => {
    for (const mrp of ["99", "199", "249", "499", "999", "1499"]) {
      const inclusive = fromRupees(mrp);
      const taxable = taxableFromInclusive(inclusive, GST_18);
      const tax = applyRate(taxable, GST_18);
      // Within a paisa — closing that last paisa is `allocateResidual`'s job,
      // not this function's.
      expect(Math.abs(subtract(add(taxable, tax), inclusive))).toBeLessThanOrEqual(1);
    }
  });

  test("a nil rate leaves the amount untouched", () => {
    expect(taxableFromInclusive(fromRupees("100"), basisPoints(0))).toBe(10000);
  });
});
