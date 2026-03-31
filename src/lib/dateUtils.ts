/**
 * Timezone-aware date range utilities.
 *
 * Problem: Supabase stores timestamps in UTC. If we filter with
 * `.gte('purchased_at', '2026-03-30T00:00:00')` the DB treats that as UTC,
 * but the user in Brazil (UTC-3) means "local midnight" which is 03:00 UTC.
 * Sales made after 21:00 local time fall on the next UTC day and get excluded.
 *
 * Solution: Append the browser's timezone offset so PostgREST converts correctly.
 * e.g. '2026-03-30T00:00:00-03:00' → DB compares against 2026-03-30T03:00:00Z
 */

/** Returns the local timezone offset string, e.g. "-03:00" or "+05:30" */
function getTimezoneOffsetString(): string {
  const offset = new Date().getTimezoneOffset(); // minutes, positive = behind UTC
  const sign = offset <= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

const tz = getTimezoneOffsetString();

/** Start of day in local timezone as ISO string: "2026-03-30T00:00:00-03:00" */
export function dayStartISO(dateStr: string): string {
  return `${dateStr}T00:00:00${tz}`;
}

/** End of day in local timezone as ISO string: "2026-03-30T23:59:59-03:00" */
export function dayEndISO(dateStr: string): string {
  return `${dateStr}T23:59:59${tz}`;
}

/** Format a Date as YYYY-MM-DD using local time */
export function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
