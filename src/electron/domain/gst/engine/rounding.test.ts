import { describe, expect, test } from "vitest";
import {
  type Paise,
  add,
  applyRate,
  basisPoints,
  fromRupees,
  subtract,
  taxableFromInclusive,
} from "./money.js";
import { allocateResidual, roundToRupee, splitHalf } from "./rounding.js";

describe("roundToRupee", () => {
  test("rounds down below half a rupee", () => {
    expect(roundToRupee(fromRupees("123.49"))).toEqual({
      rounded: 12300,
      roundOff: -49,
    });
  });

  test("rounds up at and above half a rupee", () => {
    expect(roundToRupee(fromRupees("123.50"))).toEqual({ rounded: 12400, roundOff: 50 });
    expect(roundToRupee(fromRupees("123.51"))).toEqual({ rounded: 12400, roundOff: 49 });
  });

  test("leaves a whole rupee alone", () => {
    expect(roundToRupee(fromRupees("123"))).toEqual({ rounded: 12300, roundOff: 0 });
  });

  /**
   * A credit note has to mirror the invoice it reverses. Rounding toward
   * positive infinity instead of away from zero would make the pair fail to
   * cancel by a rupee.
   */
  test("rounds negatives away from zero, so a reversal mirrors exactly", () => {
    expect(roundToRupee(fromRupees("-123.50"))).toEqual({
      rounded: -12400,
      roundOff: -50,
    });
    expect(roundToRupee(fromRupees("-123.49"))).toEqual({
      rounded: -12300,
      roundOff: 49,
    });
  });

  test("the adjustment always reconciles the exact figure to the rounded one", () => {
    for (let paise = -250; paise <= 250; paise += 1) {
      const { rounded, roundOff } = roundToRupee(paise as Paise);
      expect(add(paise as Paise, roundOff)).toBe(rounded);
      // Math.abs because `-12300 % 100` is -0 in JavaScript, and that is the
      // operator's quirk rather than anything about the value.
      expect(Math.abs(rounded % 100)).toBe(0);
      expect(Math.abs(roundOff)).toBeLessThanOrEqual(50);
    }
  });

  /**
   * A small negative total must round to 0, not -0: negative zero survives
   * `JSON.stringify` as "-0" and reaches a decimal column looking like a value
   * it isn't.
   */
  test("never produces negative zero", () => {
    for (const value of [-1, -25, -49, -50]) {
      const { rounded } = roundToRupee(value as Paise);
      expect(Object.is(rounded, -0)).toBe(false);
    }
    expect(roundToRupee(-25 as Paise).rounded).toBe(0);
    expect(roundToRupee(-50 as Paise).rounded).toBe(-100);
  });
});

describe("allocateResidual", () => {
  test("leaves parts alone when they already sum to the target", () => {
    const parts = [fromRupees("50"), fromRupees("50")];
    expect(allocateResidual(fromRupees("100"), parts)).toEqual([5000, 5000]);
  });

  test("puts a shortfall on the largest part", () => {
    const parts = [fromRupees("30"), fromRupees("69.99")];
    expect(allocateResidual(fromRupees("100"), parts)).toEqual([3000, 7000]);
  });

  test("puts an excess on the largest part too", () => {
    const parts = [fromRupees("30"), fromRupees("70.01")];
    expect(allocateResidual(fromRupees("100"), parts)).toEqual([3000, 7000]);
  });

  test("breaks ties toward the earliest part, so it is deterministic", () => {
    const parts = [fromRupees("50"), fromRupees("50")];
    expect(allocateResidual(fromRupees("100.01"), parts)).toEqual([5001, 5000]);
  });

  test("an empty list is not an error", () => {
    expect(allocateResidual(fromRupees("100"), [])).toEqual([]);
  });

  test("absorbs into the named part when the caller pins one", () => {
    const parts = [fromRupees("30"), fromRupees("69.99")];
    // Index 0 despite index 1 being larger.
    expect(allocateResidual(fromRupees("100"), parts, 0)).toEqual([3001, 6999]);
  });

  /**
   * The case the default gets wrong. A cess heavy enough to exceed the value it
   * is charged on makes a tax component the largest part, so "largest" would
   * put the residual on tax. Pinning the taxable value is what the engine does.
   */
  test("keeps the residual off tax when a component outgrows the taxable value", () => {
    const taxable = fromRupees("100");
    const cess = fromRupees("200.01");
    const [adjTaxable, adjCess] = allocateResidual(fromRupees("300"), [taxable, cess], 0);
    expect(adjCess).toBe(cess);
    expect(adjTaxable).toBe(9999);
  });

  test("rejects an out-of-range absorber rather than silently picking one", () => {
    expect(() => allocateResidual(fromRupees("100"), [fromRupees("99")], 3)).toThrow();
  });
});

describe("splitHalf", () => {
  test("halves an even amount exactly", () => {
    expect(splitHalf(fromRupees("18"))).toEqual([900, 900]);
  });

  test("gives the odd paisa to the first half, deterministically", () => {
    expect(splitHalf(1 as Paise)).toEqual([1, 0]);
    expect(splitHalf(7 as Paise)).toEqual([4, 3]);
  });

  test("always re-sums to what it was given", () => {
    for (let amount = -500; amount <= 500; amount += 1) {
      const [a, b] = splitHalf(amount as Paise);
      expect(add(a, b)).toBe(amount);
    }
  });

  test("never produces negative zero", () => {
    const [a, b] = splitHalf(-1 as Paise);
    expect(Object.is(a, -0)).toBe(false);
    expect(Object.is(b, -0)).toBe(false);
  });
});

/**
 * The invariant tax-inclusive pricing lives or dies on: whatever MRP the
 * operator types, the taxable value plus every tax component must add back up
 * to exactly that figure. A stray paisa here is the "I typed ₹100 and the
 * invoice says ₹99.99" bug.
 */
describe("inclusive pricing holds to the paisa", () => {
  const RATES = [0, 0.25, 3, 5, 12, 18, 28].map((r) => basisPoints(r));

  test.each(RATES)("intra-state split at %ibp re-sums to the MRP", (rate) => {
    for (let rupees = 1; rupees <= 400; rupees += 1) {
      for (const paiseSuffix of ["00", "01", "49", "50", "99"]) {
        const inclusive = fromRupees(`${rupees}.${paiseSuffix}`);
        const taxable = taxableFromInclusive(inclusive, rate);

        // Tax once at the full rate, then halve the amount — see `splitHalf`.
        // Halving the rate instead breaks at 0.25%, where 0.125% is not
        // expressible in whole basis points.
        const totalTax = applyRate(taxable, rate);
        const [cgst, sgst] = splitHalf(totalTax);
        expect(add(cgst, sgst)).toBe(totalTax);

        const [adjustedTaxable, adjustedCgst, adjustedSgst] = allocateResidual(
          inclusive,
          [taxable, cgst, sgst]
        );

        expect(add(adjustedTaxable, adjustedCgst, adjustedSgst)).toBe(inclusive);
        // The residual lands on the taxable value, never on a tax component:
        // misstating tax to make a total balance is the one trade never worth
        // making.
        expect(adjustedCgst).toBe(cgst);
        expect(adjustedSgst).toBe(sgst);
        expect(Math.abs(subtract(adjustedTaxable, taxable))).toBeLessThanOrEqual(1);
      }
    }
  });

  test("the 0.25% slab splits without inventing a fraction of a basis point", () => {
    // Rough diamonds are taxed at 0.25%, so CGST and SGST are 0.125% each — a
    // rate that cannot be written in basis points at all. Splitting the amount
    // sidesteps the question entirely.
    const taxable = fromRupees("100000");
    const totalTax = applyRate(taxable, basisPoints(0.25));
    expect(totalTax).toBe(25000);

    const [cgst, sgst] = splitHalf(totalTax);
    expect(add(cgst, sgst)).toBe(totalTax);
    expect(cgst).toBe(12500);
    expect(sgst).toBe(12500);
  });

  test.each(RATES)("inter-state IGST at %ibp re-sums to the MRP", (rate) => {
    for (let rupees = 1; rupees <= 400; rupees += 1) {
      const inclusive = fromRupees(`${rupees}.50`);
      const taxable = taxableFromInclusive(inclusive, rate);
      const igst = applyRate(taxable, rate);
      const [adjustedTaxable, adjustedIgst] = allocateResidual(inclusive, [taxable, igst]);

      expect(add(adjustedTaxable, adjustedIgst)).toBe(inclusive);
      expect(adjustedIgst).toBe(igst);
    }
  });
});
