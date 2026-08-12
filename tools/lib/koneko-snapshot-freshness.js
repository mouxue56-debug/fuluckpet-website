export const MAX_SNAPSHOT_AGE_MS = 48 * 60 * 60 * 1000;

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

export function assertFreshKonekoSnapshot(snapshot, now = Date.now()) {
  const capturedAt = snapshot && snapshot.capturedAt;
  if (typeof capturedAt !== 'string') {
    throw new Error('スナップショットの capturedAt が不正です。Koneko から再取得してください。');
  }
  const match = RFC3339_TIMESTAMP.exec(capturedAt);
  if (!match) {
    throw new Error('スナップショットの capturedAt はタイムゾーン付き RFC3339 形式で記録してください。');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] || '').padEnd(3, '0'));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zone = match[8];
  const offsetHour = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const offsetMinute = zone === 'Z' ? 0 : Number(zone.slice(4, 6));
  if (
    year < 1000
    || month < 1 || month > 12
    || day < 1 || day > monthDays[month - 1]
    || hour > 23 || minute > 59 || second > 59
    || offsetHour > 23 || offsetMinute > 59
  ) {
    throw new Error('スナップショットの capturedAt が不正です。Koneko から再取得してください。');
  }

  let capturedMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  if (zone !== 'Z') {
    const offsetMs = (offsetHour * 60 + offsetMinute) * 60 * 1000;
    capturedMs += zone[0] === '+' ? -offsetMs : offsetMs;
  }

  const ageMs = now - capturedMs;
  if (ageMs < -MAX_FUTURE_SKEW_MS) {
    throw new Error(`スナップショットの capturedAt が未来です: ${capturedAt}`);
  }
  if (ageMs > MAX_SNAPSHOT_AGE_MS) {
    throw new Error(`スナップショットが古すぎます: ${capturedAt}。Koneko の両アカウントから再取得してください。`);
  }

  return capturedMs;
}
