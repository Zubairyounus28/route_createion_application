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

export function pointToSegmentDistanceMeters(
  p: {lat: number; lng: number},
  a: {lat: number; lng: number},
  b: {lat: number; lng: number}
): number {
  const latScale = 111320;
  const lngScale = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lng - p.lng) * lngScale;
  const ay = (a.lat - p.lat) * latScale;
  const bx = (b.lng - p.lng) * lngScale;
  const by = (b.lat - p.lat) * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(ax, ay);
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(projX, projY);
}

export function distanceToPolylineMeters(
  p: {lat: number; lng: number},
  path: {lat: number; lng: number}[]
): number {
  if (path.length === 0) return 0;
  if (path.length === 1) return haversineMeters(p, path[0]);
  let minDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = pointToSegmentDistanceMeters(p, path[i], path[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export function mpsToMphText(speedMps: number | null): string {
  if (speedMps === null || Number.isNaN(speedMps) || speedMps < 0.4) {
    return '0 mph';
  }
  const mph = Math.round(speedMps * 2.23694);
  return `${mph} mph`;
}

export function metersToTurnCue(meters: number): string {
  if (meters < 30) return 'now';
  const feet = Math.round((meters * 3.28084) / 50) * 50;
  if (feet < 950) {
    return `in ${Math.max(50, feet)} ft`;
  }
  return `in ${(meters / 1609.344).toFixed(1)} mi`;
}
