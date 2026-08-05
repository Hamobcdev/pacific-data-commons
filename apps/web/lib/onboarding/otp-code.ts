export const OTP_CODE_LENGTH = 6;

/** Turns a pasted clipboard string into a fixed-length digit array — strips
 * non-digits, truncates to OTP_CODE_LENGTH, pads the remainder with "".
 * Pulled out of ResumeOtp.tsx as a pure function so paste handling is unit
 * testable without a DOM (the rest of that handler — focusing the right
 * input, submitting once all six are filled — is inherently ref/DOM-driven
 * and isn't covered here). */
export function parsePastedCode(text: string, length = OTP_CODE_LENGTH): string[] {
  const digitsOnly = text.replace(/\D/g, "").slice(0, length);
  return Array.from({ length }, (_, i) => digitsOnly[i] ?? "");
}
