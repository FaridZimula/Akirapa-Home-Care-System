// Pins every date/time display to US ordering (M/D/YYYY, h:mm AM/PM)
// regardless of the browser's or server's default locale.

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US');
}

export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)}, ${formatTime(date)}`;
}
