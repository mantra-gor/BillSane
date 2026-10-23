/**
 * Money, in integer paise.
 *
 * Every rupee figure the GST engine touches is held as a whole number of paise.
 * Floating point is not merely imprecise here, it is *wrong in a way that gets
 * filed*: `0.1 + 0.2` is a rounding curiosity in a dashboard and a rejected
 * return in GSTR-1, where the invoice value has to reconcile to the sum of its
 * components exactly. Storage stays `decimal(12,2)` (see `decimalTransformer`) —
 * paise is the representation the arithmetic happens in, converted at the edges.
 *
 * Percentages come in as **basis points** for the same reason: 1% = 100bp, so
 * 2.5% is 250 and 0.25% is 25, and no GST or cess rate ever needs a fraction of
 * a basis point. That keeps rate maths in integers too.
 */

/**
 * A whole number of paise. Branded so a bare `number` — which could be rupees,
 * a quantity or a rate — can't be passed where paise is meant.
 */
export type Paise = number & { readonly __brand: "paise" };

/** Basis points: 1% = 100bp. GST's 18% is 1800, cess at 0.25% is 25. */
export type BasisPoints = number & { readonly __brand: "bp" };

export const ZERO = 0 as Paise;

export function paise(value: number): Paise {
  if (!Number.isInteger(value)) {
    throw new Error(`Paise must be a whole number, got ${value}.`);
  }
  return value as Paise;
}

export function basisPoints(percent: number): BasisPoints {
  const bp = divRoundHalfUp(BigInt(Math.round(percent * 1e6)), 10_000n);
  return Number(bp) as BasisPoints;
}

/**
 * Integer division rounding half away from zero.
 *
 * "Half up" in accounting means away from zero, not toward positive infinity —
 * a −0.005 round-off has to land on −0.01, not 0.00, or a credit note stops
 * mirroring the invoice it reverses. Done in BigInt because intermediate
 * products (rate × qty × rate-in-bp) leave the safe-integer range long before
 * the amounts themselves look large.
 */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("Division by zero in money maths.");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  // remainder * 2 >= d  ⇒  the fraction is at or past the halfway mark.
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function toPaise(value: bigint): Paise {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Amount out of range: ${value} paise.`);
  }
  return Number(value) as Paise;
}

/**
 * Parse a rupee amount into paise.
 *
 * Strings are exact — they are parsed digit by digit, never through
 * `parseFloat`, so "1234.565" rounds to 123457 rather than inheriting whatever
 * the nearest double happened to be. Numbers are **best effort**: a value that
 * arrived as a `number` has already lost whatever precision it lost, and no
 * amount of care here recovers it. That is why the invoice grid holds rates as
 * strings and hands strings to the engine.
 */
export function fromRupees(value: string | number): Paise {
  const text = typeof value === "number" ? numberToDecimalString(value) : value.trim();
  if (text === "" || text === "-" || text === "+") return ZERO;

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) throw new Error(`"${value}" is not a rupee amount.`);

  const [, sign, whole, fraction = ""] = match;
  // Two digits of paise, plus everything after as the tie-breaker for rounding.
  const padded = (fraction + "00").slice(0, 2);
  const rest = fraction.slice(2);

  let total = BigInt(whole || "0") * 100n + BigInt(padded);
  if (rest !== "") {
    // Round on the first discarded digit, half away from zero.
    const carry = divRoundHalfUp(BigInt(rest), BigInt("1" + "0".repeat(rest.length)));
    total += carry;
  }

  return toPaise(sign === "-" ? -total : total);
}

/**
 * A double's shortest decimal form. `toString()` already gives that, except for
 * exponent notation, which the parser above doesn't accept.
 */
function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`"${value}" is not a rupee amount.`);
  return Math.abs(value) < 1e21 && !String(value).includes("e")
    ? String(value)
    : value.toFixed(2);
}

/** Back to rupees, for `decimal(12,2)` storage through `decimalTransformer`. */
export function toRupees(value: Paise): number {
  return value / 100;
}

/** For display and for the invoice template — always two decimal places. */
export function formatRupees(value: Paise): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

export function add(...values: Paise[]): Paise {
  return values.reduce<Paise>((sum, value) => (sum + value) as Paise, ZERO);
}

export function subtract(a: Paise, b: Paise): Paise {
  return (a - b) as Paise;
}

export function negate(value: Paise): Paise {
  return (value === 0 ? 0 : -value) as Paise;
}

/**
 * Line amount: a rate in paise times a quantity that may itself be fractional
 * (`decimal(12,2)`, so 2.5 kg is ordinary). Rounded to whole paise once, here,
 * rather than accumulating a fraction across the line.
 */
export function multiplyByQuantity(rate: Paise, quantity: string | number): Paise {
  const qtyHundredths = fromRupees(quantity); // reuse: 2 dp, exact from strings
  return toPaise(divRoundHalfUp(BigInt(rate) * BigInt(qtyHundredths), 100n));
}

/** `base × rate`, rounded to whole paise. The core of every tax component. */
export function applyRate(base: Paise, rate: BasisPoints): Paise {
  return toPaise(divRoundHalfUp(BigInt(base) * BigInt(rate), 10_000n));
}

/**
 * Split an amount that already includes tax into its taxable value.
 *
 * `taxable = inclusive × 10000 ÷ (10000 + rate)`. The residual paise this
 * leaves — `inclusive − taxable − Σcomponents` — is *not* handled here: the
 * engine assigns it to a specific component so the parts re-sum to exactly the
 * price the operator typed. Doing it here would spread the error silently.
 */
export function taxableFromInclusive(inclusive: Paise, rate: BasisPoints): Paise {
  return toPaise(
    divRoundHalfUp(BigInt(inclusive) * 10_000n, 10_000n + BigInt(rate))
  );
}

/** True when the amount is exactly zero — cheaper to read than `=== 0`. */
export function isZero(value: Paise): boolean {
  return value === 0;
}
