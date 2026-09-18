const START_YEAR = 2026;
const START_MONTH = 8;
const START_DAY = 18;
const START = Date.UTC(START_YEAR, START_MONTH, START_DAY);

export function appYear(now = Date.now()): number {
  if (now < START) return 1;
  const year = new Date(now).getUTCFullYear();
  let passed = year - START_YEAR;
  if (now < Date.UTC(year, START_MONTH, START_DAY)) passed -= 1;
  return passed + 1;
}

export function codeForYear(year: number): string {
  if (year <= 1) return "FAM786";
  return `${year}FAM786`;
}

export function codeMatches(value: string, now = Date.now()): boolean {
  return value.trim().toUpperCase() === codeForYear(appYear(now));
}

export function unlockIsCurrent(stored: string | null, now = Date.now()): boolean {
  return stored === String(appYear(now));
}
