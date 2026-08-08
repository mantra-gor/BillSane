import { useEffect, useRef, useState } from "react";
import { lookupCustomers, type CustomerMatch } from "../utils/customerStore";
import { EMAIL_REGEX, PHONE_REGEX } from "../utils/validators";

// Long enough that a fast typist finishing a 10-digit number fires one query,
// short enough that the panel has answered before they reach the next field.
const DEBOUNCE_MS = 250;

export interface CustomerLookupState {
  matches: CustomerMatch[];
  searching: boolean;
  /** A complete contact detail has been typed and the answer is in. */
  searched: boolean;
}

interface Answer {
  key: string;
  matches: CustomerMatch[];
}

/**
 * Resolves who is at the counter from the phone and email being typed.
 *
 * Both are sent together and OR'd server-side, which is what recognises a
 * returning customer who has changed one of the two.
 */
export function useCustomerLookup(
  phone: string,
  email: string
): CustomerLookupState {
  const [answer, setAnswer] = useState<Answer | null>(null);

  // Only complete, well-formed values are worth a round trip — a half-typed
  // number can't match anything and would just flicker the panel.
  const phoneKey = PHONE_REGEX.test(phone.trim()) ? phone.trim() : "";
  const emailKey = EMAIL_REGEX.test(email.trim())
    ? email.trim().toLowerCase()
    : "";
  const key = `${phoneKey}|${emailKey}`;
  const hasQuery = Boolean(phoneKey || emailKey);

  // Which query the UI is actually waiting on, so a slow early response can't
  // overwrite a newer one.
  const pending = useRef("");

  useEffect(() => {
    if (!hasQuery) return;
    pending.current = key;

    const timer = setTimeout(() => {
      lookupCustomers({
        phone: phoneKey || undefined,
        email: emailKey || undefined,
      })
        .then((matches) => {
          if (pending.current === key) setAnswer({ key, matches });
        })
        .catch(() => {
          // A lookup is an assist, not a gate — if the database is unreachable
          // the counter still bills the customer as a new one, and the save
          // path reports the real error.
          if (pending.current === key) setAnswer({ key, matches: [] });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [key, hasQuery, phoneKey, emailKey]);

  // Derived rather than stored: the answer is only current if it belongs to the
  // query on screen, which also makes "still searching" fall out for free.
  const answered = hasQuery && answer?.key === key;
  return {
    matches: answered ? answer.matches : [],
    searching: hasQuery && !answered,
    searched: Boolean(answered),
  };
}
