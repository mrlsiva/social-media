import { Pipe, PipeTransform } from '@angular/core';

/** 12345 -> "12.3K" */
@Pipe({ name: 'compact' })
export class CompactNumberPipe implements PipeTransform {
  private readonly fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  transform(value: number | null | undefined): string {
    return this.fmt.format(value ?? 0);
  }
}

/** "3 min ago" style relative time. */
@Pipe({ name: 'ago' })
export class TimeAgoPipe implements PipeTransform {
  private readonly rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  transform(value: string | Date | null | undefined): string {
    if (!value) return '';
    const diff = (new Date(value).getTime() - Date.now()) / 1000;
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
    ];
    for (const [unit, secs] of units) if (Math.abs(diff) >= secs) return this.rtf.format(Math.round(diff / secs), unit);
    return 'just now';
  }
}

@Pipe({ name: 'bytes' })
export class BytesPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    const v = value ?? 0;
    if (v < 1024) return `${v} B`;
    if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
    return `${(v / 1024 ** 3).toFixed(2)} GB`;
  }
}

/** Converts an ISO instant to a value for <input type="datetime-local"> in local time. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
