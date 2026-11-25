import type {OfflineCachedTour} from '../types/navigation';

const STORAGE_KEY = 'campusroute_offline_tours_v1';
const LAST_SESSION_KEY = 'campusroute_last_session_v1';
const TOS_MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30-day ToS cache limit

export function getOfflineTours(): OfflineCachedTour[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineCachedTour[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const valid = parsed.filter(
      item =>
        item &&
        typeof item.id === 'string' &&
        typeof item.cachedAt === 'number' &&
        now - item.cachedAt < TOS_MAX_CACHE_AGE_MS
    );
    if (valid.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    }
    return valid.sort((a, b) => b.cachedAt - a.cachedAt);
  } catch {
    return [];
  }
}

export function saveOfflineTour(tour: OfflineCachedTour): OfflineCachedTour[] {
  const existing = getOfflineTours().filter(t => t.id !== tour.id);
  const next = [{...tour, cachedAt: Date.now()}, ...existing].slice(0, 15);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage quota full: trim oldest
    const trimmed = next.slice(0, 5);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }
  return next;
}

export function removeOfflineTour(id: string): OfflineCachedTour[] {
  const next = getOfflineTours().filter(t => t.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearOfflineCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function saveLastActiveSession(session: OfflineCachedTour): void {
  try {
    localStorage.setItem(
      LAST_SESSION_KEY,
      JSON.stringify({...session, cachedAt: Date.now()})
    );
  } catch {
    // ignore
  }
}

export function loadLastActiveSession(): OfflineCachedTour | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineCachedTour;
    if (
      !parsed ||
      typeof parsed.cachedAt !== 'number' ||
      Date.now() - parsed.cachedAt >= TOS_MAX_CACHE_AGE_MS
    ) {
      localStorage.removeItem(LAST_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
