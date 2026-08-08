import type { KeyboardEvent } from "react";

// Indian mobile numbers: 10 digits, first digit 6-9.
export const PHONE_REGEX = /^[6-9]\d{9}$/;
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Left untyped (no RegisterOptions annotation) so structural typing lets
// these be passed to register() for any field name/form shape.
export const phoneValidation = {
  required: "Phone number is required",
  pattern: {
    value: PHONE_REGEX,
    message: "Enter a valid 10-digit mobile number",
  },
};

export const emailValidation = {
  required: "Email is required",
  pattern: {
    value: EMAIL_REGEX,
    message: "Enter a valid email address",
  },
};

const ALLOWED_PHONE_KEYS = [
  "Backspace",
  "Delete",
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "Enter",
];

// type="tel" doesn't restrict keystrokes like type="number" does, so block
// non-digit keys manually (mirrors the numeric-field guards elsewhere).
export function blockNonDigitKey(e: KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || ALLOWED_PHONE_KEYS.includes(e.key)) return;
  if (!/^\d$/.test(e.key)) {
    e.preventDefault();
  }
}

// For money/percentage fields on type="number": keep the decimal point, but
// reject the exponent and sign characters the browser otherwise accepts and
// then reports back as an empty value.
const BLOCKED_NUMBER_KEYS = ["e", "E", "+", "-"];

export function blockInvalidNumberKey(e: KeyboardEvent<HTMLInputElement>) {
  if (BLOCKED_NUMBER_KEYS.includes(e.key)) {
    e.preventDefault();
  }
}
