export function metersToMilesText(meters?: number): string {
  if (typeof meters !== 'number' || Number.isNaN(meters)) return '0.0 mi';
  const miles = meters / 1609.344;
  if (miles < 0.1) {
    const feet = Math.round(meters * 3.28084);
    return `${feet} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

export function millisToDurationText(millis?: number): string {
  if (typeof millis !== 'number' || Number.isNaN(millis) || millis <= 0) {
    return '0 min';
  }
  const totalMinutes = Math.round(millis / 60000);
  if (totalMinutes < 60) {
    return `${Math.max(1, totalMinutes)} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

export function stripHtmlToText(input?: string): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatManeuverLabel(maneuver?: string): string {
  if (!maneuver || maneuver === 'MANEUVER_UNSPECIFIED') return 'Continue';
  return maneuver
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function haversineMeters(
  a: {lat: number; lng: number},
  b: {lat: number; lng: number}
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
