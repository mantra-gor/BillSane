import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

/**
 * Password hashing on top of node's built-in scrypt.
 *
 * Deliberately not bcrypt/argon2: both are native modules, and every native
 * module in an Electron app is another `electron-builder install-app-deps`
 * rebuild that has to match the runtime's ABI on three platforms. better-sqlite3
 * already earns that cost; a password hash doesn't have to. scrypt is a
 * memory-hard KDF in the standard library and is the right tool here.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

// ~16 MB of memory and roughly 100 ms per hash on a laptop — slow enough to
// make an offline guessing run expensive, fast enough that signing in feels
// instant. maxmem is set explicitly because node's 32 MB default sits close
// enough to 128 * N * r that a future bump to N would fail at runtime.
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const PASSWORD_MIN_LENGTH = 8;

/**
 * `scrypt$N$r$p$salt$hash`, base64 for the two binary halves.
 *
 * The parameters travel with the hash rather than being read from PARAMS at
 * verify time, so raising the work factor later still verifies every password
 * already on file — they simply keep their original cost until next changed.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Constant-time comparison. Returns false for a malformed stored value rather
 * than throwing: a corrupted row should read as "wrong password" and be fixable
 * with an admin reset, not crash the sign-in handler.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  try {
    const salt = Buffer.from(rawSalt, "base64");
    const expected = Buffer.from(rawHash, "base64");
    const derived = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: PARAMS.maxmem,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * The one rule applied everywhere a password is set — first-run setup, an admin
 * reset, and a user changing their own. Length only: complexity rules push
 * people towards "Password1!" and a shop owner typing at a counter is not the
 * threat model a symbol requirement addresses.
 */
export function assertPasswordAcceptable(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`
    );
  }
}
