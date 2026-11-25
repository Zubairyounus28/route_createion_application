import {initializeApp} from 'firebase/app';
import {getAuth, GoogleAuthProvider} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  MapStyleId,
  SyncedSchoolTour,
  TourStop,
  UserPreferences,
} from '../types/navigation';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function sanitizeStops(stops: TourStop[]): TourStop[] {
  return stops.slice(0, 12).map(stop => {
    const cleaned: TourStop = {
      placeId: stop.placeId.slice(0, 200),
      name: stop.name.trim().slice(0, 160) || 'School Stop',
      address: (stop.address || '').trim().slice(0, 300),
      lat: Math.max(-90, Math.min(90, Number(stop.lat) || 0)),
      lng: Math.max(-180, Math.min(180, Number(stop.lng) || 0)),
    };
    if (typeof stop.rating === 'number' && stop.rating >= 0 && stop.rating <= 5) {
      cleaned.rating = Number(stop.rating.toFixed(1));
    }
    if (stop.primaryType) {
      cleaned.primaryType = stop.primaryType.slice(0, 64);
    }
    return cleaned;
  });
}

function formatTimestamp(ts: Timestamp | undefined): string | undefined {
  if (!ts) return undefined;
  try {
    return ts.toDate().toISOString();
  } catch {
    return undefined;
  }
}

export async function ensureUserProfile(
  uid: string,
  displayName: string | null,
  email: string | null
): Promise<UserPreferences> {
  if (!VALID_ID_REGEX.test(uid)) {
    throw new Error('Invalid user identifier');
  }
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        defaultRadiusMiles:
          typeof data.defaultRadiusMiles === 'number' ? data.defaultRadiusMiles : 5,
        preferredMapStyle: (data.preferredMapStyle as MapStyleId) || 'daylight',
        voiceGuidanceEnabled:
          typeof data.voiceGuidanceEnabled === 'boolean'
            ? data.voiceGuidanceEnabled
            : true,
      };
    }

    const payload: Record<string, unknown> = {
      uid,
      defaultRadiusMiles: 5,
      preferredMapStyle: 'daylight',
      voiceGuidanceEnabled: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (displayName) payload.displayName = displayName.slice(0, 120);
    if (email) payload.email = email.slice(0, 254);

    await setDoc(userRef, payload);
    return {
      defaultRadiusMiles: 5,
      preferredMapStyle: 'daylight',
      voiceGuidanceEnabled: true,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function updateUserPreferences(
  uid: string,
  prefs: Partial<UserPreferences>
): Promise<void> {
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await ensureUserProfile(
        uid,
        auth.currentUser?.displayName || null,
        auth.currentUser?.email || null
      );
    }
    const updates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (typeof prefs.defaultRadiusMiles === 'number') {
      updates.defaultRadiusMiles = Math.max(1, Math.min(15, prefs.defaultRadiusMiles));
    }
    if (prefs.preferredMapStyle) {
      updates.preferredMapStyle = prefs.preferredMapStyle;
    }
    if (typeof prefs.voiceGuidanceEnabled === 'boolean') {
      updates.voiceGuidanceEnabled = prefs.voiceGuidanceEnabled;
    }
    await setDoc(userRef, updates, {merge: true});
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export function subscribeUserTours(
  uid: string,
  onData: (tours: SyncedSchoolTour[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const toursPath = `users/${uid}/tours`;
  const q = query(
    collection(db, 'users', uid, 'tours'),
    where('ownerId', '==', uid)
  );

  return onSnapshot(
    q,
    snapshot => {
      const tours: SyncedSchoolTour[] = snapshot.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId || uid),
            title: String(data.title || 'School Tour'),
            originName: String(data.originName || 'Selected Area'),
            originLat: Number(data.originLat || 0),
            originLng: Number(data.originLng || 0),
            radiusMiles: Number(data.radiusMiles || 5),
            travelMode: data.travelMode || 'DRIVING',
            routeObjective: data.routeObjective || 'FASTEST_TRAFFIC',
            optimizeOrder: Boolean(data.optimizeOrder),
            roundTrip: Boolean(data.roundTrip),
            stops: Array.isArray(data.stops) ? (data.stops as TourStop[]) : [],
            totalDistanceMeters:
              typeof data.totalDistanceMeters === 'number'
                ? data.totalDistanceMeters
                : undefined,
            totalDurationMillis:
              typeof data.totalDurationMillis === 'number'
                ? data.totalDurationMillis
                : undefined,
            createdAt: formatTimestamp(data.createdAt as Timestamp | undefined),
            updatedAt: formatTimestamp(data.updatedAt as Timestamp | undefined),
          };
        })
        .sort((a, b) => {
          const timeA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
          const timeB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
          return timeB - timeA;
        });
      onData(tours);
    },
    error => {
      try {
        handleFirestoreError(error, OperationType.LIST, toursPath);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveSyncedTour(
  uid: string,
  tour: Omit<SyncedSchoolTour, 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const safeTourId =
    tour.id && VALID_ID_REGEX.test(tour.id)
      ? tour.id.slice(0, 128)
      : `tour_${Date.now()}`;
  const tourPath = `users/${uid}/tours/${safeTourId}`;

  try {
    const userRef = doc(db, 'users', uid);
    const tourRef = doc(db, 'users', uid, 'tours', safeTourId);
    const [userSnap, tourSnap] = await Promise.all([
      getDoc(userRef),
      getDoc(tourRef),
    ]);

    const batch = writeBatch(db);
    if (!userSnap.exists()) {
      const profilePayload: Record<string, unknown> = {
        uid,
        defaultRadiusMiles: 5,
        preferredMapStyle: 'daylight',
        voiceGuidanceEnabled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (auth.currentUser?.displayName) {
        profilePayload.displayName = auth.currentUser.displayName.slice(0, 120);
      }
      if (auth.currentUser?.email) {
        profilePayload.email = auth.currentUser.email.slice(0, 254);
      }
      batch.set(userRef, profilePayload);
    }

    const sanitizedStops = sanitizeStops(tour.stops);
    const basePayload: Record<string, unknown> = {
      ownerId: uid,
      title: tour.title.trim().slice(0, 120) || 'School Tour',
      originName: tour.originName.trim().slice(0, 240) || 'Starting Point',
      originLat: Math.max(-90, Math.min(90, Number(tour.originLat) || 0)),
      originLng: Math.max(-180, Math.min(180, Number(tour.originLng) || 0)),
      radiusMiles: Math.max(1, Math.min(15, Number(tour.radiusMiles) || 5)),
      travelMode: tour.travelMode,
      routeObjective: tour.routeObjective,
      optimizeOrder: Boolean(tour.optimizeOrder),
      roundTrip: Boolean(tour.roundTrip),
      stops: sanitizedStops,
      updatedAt: serverTimestamp(),
    };

    if (typeof tour.totalDistanceMeters === 'number') {
      basePayload.totalDistanceMeters = Math.max(
        0,
        Math.min(10000000, Math.round(tour.totalDistanceMeters))
      );
    }
    if (typeof tour.totalDurationMillis === 'number') {
      basePayload.totalDurationMillis = Math.max(
        0,
        Math.min(864000000, Math.round(tour.totalDurationMillis))
      );
    }

    if (tourSnap.exists()) {
      batch.update(tourRef, basePayload);
    } else {
      batch.set(tourRef, {
        ...basePayload,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return safeTourId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      tourPath
    );
  }
}

export async function deleteSyncedTour(uid: string, tourId: string): Promise<void> {
  const tourPath = `users/${uid}/tours/${tourId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'tours', tourId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, tourPath);
  }
}
