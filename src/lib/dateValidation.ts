// Strict YYYY-MM-DD validation for the free-text date inputs used on screens
// that don't have a native date picker wired up (OffersScreen, Notifications'
// custom range). A plain digit-pattern regex (\d{4}-\d{2}-\d{2}) accepts
// calendar-impossible values like "2026-13-45" or "2026-02-30" — this also
// round-trips the parsed date to catch those. Web's equivalent fields use a
// native <input type="date">, which can't produce an invalid value at all;
// this is the closest mobile equivalent without a native date-picker module.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Both inputs must already be valid ISO dates (check with isValidIsoDate
// first) — plain string comparison is safe and correct for YYYY-MM-DD.
export function isIsoDateBefore(a: string, b: string): boolean {
  return a < b;
}
