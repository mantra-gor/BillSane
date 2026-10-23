/**
 * Rounding policy.
 *
 * Kept apart from `money.ts` on purpose: that module knows *how* to round, this
 * one decides *when*, and the when is a compliance decision that travels with
 * the rule pack rather than with the arithmetic. The order below is the whole
 * policy, and it is deliberately not "add everything up and round at the end":
 *
 *   1. Line taxable value  → whole paise.
 *   2. Each tax component per line → whole paise.
 *   3. Invoice tax totals  = sum of the *already rounded* line components.
 *   4. Invoice grand total → nearest rupee, with the difference kept as an
 *      explicit `roundOff` column.
 *
 * Step 3 is the one people get wrong. Re-rounding a sum gives a total that
 * doesn't equal the lines it came from, and a GSTR-1 whose invoice value can't
 * be reconciled against its own line items is rejected.
 */

import { type Paise, ZERO, add, subtract } from "./money.js";

/**
 * Split a tax amount into two equal halves — CGST and SGST.
 *
 * Intra-state supply is the full rate split in two, and the tempting way to do
 * that is to halve the *rate*: 18% becomes 9% + 9%. It works for every ordinary
 * slab and then breaks on 0.25%, where half is 0.125% and basis points can no
 * longer express it — 12.5bp rounds to 13bp, so CGST and SGST silently add up
 * to 0.26% instead.
 *
 * Halving the *amount* has no such gap: whatever the rate, the two components
 * sum to exactly the tax that was computed once at the full rate. The odd paisa
 * goes to the first half, deterministically, so the same invoice computed twice
 * is the same invoice.
 */
export function splitHalf(amount: Paise): [Paise, Paise] {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const first = Math.ceil(abs / 2);
  const second = abs - first;
  return negative
    ? [(first === 0 ? 0 : -first) as Paise, (second === 0 ? 0 : -second) as Paise]
    : [first as Paise, second as Paise];
}

export interface RoundOffResult {
  /** The payable figure, to the nearest rupee. */
  rounded: Paise;
  /**
   * `rounded − exact`, which is what the invoice prints on its round-off line.
   * Lands in −49…+50 paise: exactly .50 rounds away from zero, so a total of
   * ₹123.50 becomes ₹124.00 with a +0.50 adjustment.
   */
  roundOff: Paise;
}

/**
 * Round a document total to the nearest rupee.
 *
 * The adjustment is stored, never absorbed. An invoice that quietly shifts a
 * paisa into its tax figures to make the total land on a rupee has misstated
 * the tax, which is the number the return actually cares about.
 */
export function roundToRupee(exact: Paise): RoundOffResult {
  const negative = exact < 0;
  const abs = Math.abs(exact);
  const remainder = abs % 100;
  const roundedAbs = remainder >= 50 ? abs + (100 - remainder) : abs - remainder;
  // `roundedAbs === 0` guard: without it a small negative total returns -0,
  // which survives into JSON as "-0" and into a decimal column as a value that
  // compares equal to zero but doesn't look it.
  const rounded = (negative && roundedAbs !== 0 ? -roundedAbs : roundedAbs) as Paise;
  return { rounded, roundOff: subtract(rounded, exact) };
}

/**
 * Force `parts` to sum to exactly `target`, putting the difference on the
 * largest part.
 *
 * This is what makes tax-inclusive pricing hold together. Back-calculating a
 * taxable value from an MRP and then deriving the components independently
 * leaves a stray paisa often enough to notice — the operator types ₹100.00 and
 * the invoice shows ₹99.99. The residual has to land *somewhere* deliberate,
 * and the largest component is where it distorts the effective rate least.
 *
 * Ties go to the earliest part, so the choice is deterministic: the same
 * invoice recomputed on another machine must produce the same paise.
 *
 * `absorbAt` names the part that takes the difference. The tax engine always
 * passes it, pointing at the taxable value, because a residual that lands on a
 * tax component misstates the tax — and the tax is the figure the return is
 * actually about. Defaulting to the largest part is only for callers with no
 * such distinction to make; at ordinary GST rates the taxable value *is* the
 * largest part, but that stops being true once a cess pushes the tax above the
 * value it is charged on, and a silent default would quietly start moving
 * money into a tax field at exactly that point.
 */
export function allocateResidual(
  target: Paise,
  parts: Paise[],
  absorbAt?: number
): Paise[] {
  if (parts.length === 0) return parts;

  const residual = subtract(target, add(...parts));
  if (residual === ZERO) return parts;

  let index = absorbAt ?? 0;
  if (absorbAt === undefined) {
    for (let i = 1; i < parts.length; i += 1) {
      if (parts[i] > parts[index]) index = i;
    }
  } else if (absorbAt < 0 || absorbAt >= parts.length) {
    throw new Error(`No part at index ${absorbAt} to absorb the residual.`);
  }

  const adjusted = [...parts];
  adjusted[index] = add(adjusted[index], residual);
  return adjusted;
}
