const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/** Parses "15m", "30d", "3600" into seconds. */
export function durationToSeconds(value: string): number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = /^(\d+)\s*([smhdw])$/i.exec(trimmed);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNIT_SECONDS[match[2].toLowerCase()];
}

export const addSeconds = (date: Date, seconds: number): Date => new Date(date.getTime() + seconds * 1000);

/** YYYY-MM for usage periods (UTC). */
export const currentPeriod = (date = new Date()): string => date.toISOString().slice(0, 7);

/** YYYY-MM-DD (UTC). */
export const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
