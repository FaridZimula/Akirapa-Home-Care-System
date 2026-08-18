/**
 * Utility functions for standardizing US telephone numbers (+1 country code).
 */

/**
 * Extracts clean local digits (up to 10 digits) for input controls.
 * Strips leading +1 or 1 if present so user only sees/edits the 10 local digits.
 */
export function cleanUSPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

/**
 * Formats incoming user phone input to full E.164 international format for US (+1XXXXXXXXXX).
 * Returns null if no digits are provided.
 */
export function formatUSPhoneWithCountryCode(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = cleanUSPhoneDigits(phone);
  if (!digits) return null;
  return `+1${digits}`;
}

/**
 * Formats a phone number for user display, e.g. "+1 (604) 555-0199".
 */
export function formatUSPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = cleanUSPhoneDigits(phone);
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone.startsWith('+1') ? phone : `+1 ${phone}`;
}
