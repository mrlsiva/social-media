import { sniffType } from './file-validation';
import { zonedDateTimeToUtc, addDays } from '../common/utils/timezone';
import { durationToSeconds } from '../common/utils/duration';

describe('file type sniffing (magic bytes)', () => {
  it.each([
    ['jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])],
    ['png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])],
    ['webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])],
    ['isobmff', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom')])],
  ])('detects %s', (expected, header) => {
    expect(sniffType(header)).toBe(expected);
  });

  it('rejects unknown content (e.g. an executable renamed to .png)', () => {
    expect(sniffType(Buffer.from('MZ\x90\x00\x03\x00\x00\x00'))).toBeNull();
  });
});

describe('timezone helpers', () => {
  it('converts brand-local wall time to UTC', () => {
    expect(zonedDateTimeToUtc('2026-10-10', '10:00', 'Asia/Kolkata').toISOString()).toBe('2026-10-10T04:30:00.000Z');
    expect(zonedDateTimeToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('parses JWT style durations', () => {
    expect(durationToSeconds('15m')).toBe(900);
    expect(durationToSeconds('30d')).toBe(2_592_000);
  });
});
