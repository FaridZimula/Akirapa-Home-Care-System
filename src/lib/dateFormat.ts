// Formats dates & times according to explicit timezone targets or user device's local timezone automatically.

export type TargetTimeZone = 'LOCAL' | 'AMERICA_NEW_YORK' | 'AFRICA_KAMPALA' | string;

export function getTimeZoneString(tz?: TargetTimeZone): string | undefined {
  if (!tz || tz === 'LOCAL') return undefined;
  if (tz === 'AMERICA_NEW_YORK') return 'America/New_York';
  if (tz === 'AFRICA_KAMPALA') return 'Africa/Kampala';
  return tz;
}

export function getTimeZoneLabel(tz?: TargetTimeZone): string {
  if (!tz || tz === 'LOCAL') return '';
  if (tz === 'AMERICA_NEW_YORK' || tz === 'America/New_York') return 'US Eastern (MA)';
  if (tz === 'AFRICA_KAMPALA' || tz === 'Africa/Kampala') return 'Uganda (EAT)';
  return '';
}

export function formatDate(date: Date | string, tz?: TargetTimeZone): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const timeZone = getTimeZoneString(tz);
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric', timeZone });
}

export function formatTime(date: Date | string, tz?: TargetTimeZone, includeZoneLabel = false): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const timeZone = getTimeZoneString(tz);
  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone });
  const label = includeZoneLabel ? getTimeZoneLabel(tz) : '';
  return label ? `${timeStr} (${label})` : timeStr;
}

export function formatDateTime(date: Date | string, tz?: TargetTimeZone, includeZoneLabel = false): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${formatDate(d, tz)}, ${formatTime(d, tz, includeZoneLabel)}`;
}
