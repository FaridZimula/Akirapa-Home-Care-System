// Attendance policy constants for clock-in / clock-out enforcement.
// Kept in one place so the geofence, the caregiver UI, and the escalation
// sweep all agree on the same numbers.

/** Fallback radius when a client record has no geofenceRadiusMeter set. */
export const GEOFENCE_DEFAULT_RADIUS_METERS = 100;

/**
 * A GPS fix worse than this is not trustworthy enough to prove presence at a
 * 100m geofence, so it is refused rather than silently accepted.
 */
export const MAX_GPS_ACCURACY_METERS = 100;

/** Clock-ins later than this past scheduled start must carry a written reason. */
export const LATE_GRACE_MINUTES = 5;

/** Admins are alerted once a shift is this far past start with no clock-in. */
export const MISSED_CLOCK_IN_ALERT_MINUTES = 15;

/** A shift still un-clocked-in this far past start is auto-marked NO_SHOW. */
export const NO_SHOW_MINUTES = 60;

/** Whole minutes `actual` falls after `scheduled` (negative when early). */
export function minutesLateFrom(scheduled: Date | string, actual: Date): number {
  return Math.floor((actual.getTime() - new Date(scheduled).getTime()) / 60000);
}
