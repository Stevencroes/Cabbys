// Lead-passenger contact validation — deliberately forgiving.
// Travelers type numbers with spaces, dashes, dots and country codes;
// we only need something a driver can actually dial or WhatsApp.

export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s\-().]/g, "");
  // "00" international prefix → "+"
  return cleaned.startsWith("00") ? `+${cleaned.slice(2)}` : cleaned;
}

export function isValidPhone(input: string): boolean {
  const n = normalizePhone(input);
  return /^\+?\d{7,15}$/.test(n);
}

export function isValidEmail(input: string): boolean {
  const e = input.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
