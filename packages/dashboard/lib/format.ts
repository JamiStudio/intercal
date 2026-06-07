import { IntercalApiError } from '@intercal/sdk';

export function formatDate(value: string | undefined | null): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

export function formatDateTime(value: string | Date | undefined | null): string {
  if (!value) return 'unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'unknown';
  return `${Math.round(value * 100)}%`;
}

export function describeError(error: unknown): string {
  if (error instanceof IntercalApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export function compactId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
