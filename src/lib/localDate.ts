import { format } from 'date-fns';

const BR_DATE_TIME_RE = /^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*|\s+)(\d{2}):(\d{2})(?::(\d{2}))?$/;
const BR_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function parseLocalDateTime(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const brDateTime = normalized.match(BR_DATE_TIME_RE);
  if (brDateTime) {
    const [, day, month, year, hours, minutes, seconds = '0'] = brDateTime;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    );
  }

  const brDate = normalized.match(BR_DATE_RE);
  if (brDate) {
    const [, day, month, year] = brDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const isoDate = new Date(normalized);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}

export function toDatabaseTimestamp(value: unknown, fallback?: Date): string {
  const parsed = parseLocalDateTime(value);
  if (parsed) return parsed.toISOString();
  return (fallback ?? new Date()).toISOString();
}

export function formatLocalDateTime(value: unknown, pattern = 'dd/MM/yyyy HH:mm:ss'): string {
  const parsed = parseLocalDateTime(value);
  if (!parsed) return '-';
  return format(parsed, pattern);
}
