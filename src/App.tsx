import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
import {onAuthStateChanged, signInWithPopup, signOut, type User} from 'firebase/auth';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Compass,
  ListOrdered,
  LogIn,
  LogOut,
  Map as MapIcon,
  Navigation,
} from 'lucide-react';
import {AppFooter} from './components/AppFooter';
import {OfflineIndicator} from './components/OfflineIndicator';
import {SchoolMapCanvas} from './components/SchoolMapCanvas';
import {SidebarDiscover} from './components/SidebarDiscover';
import {SidebarNavigation} from './components/SidebarNavigation';
import {SidebarSaved} from './components/SidebarSaved';
import {SidebarTour} from './components/SidebarTour';
import {useMultiStopRoute} from './hooks/useMultiStopRoute';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import {useSchoolSearch} from './hooks/useSchoolSearch';
import {useVoiceGuidance} from './hooks/useVoiceGuidance';
import {
  auth,
  deleteSyncedTour,
  ensureUserProfile,
  googleProvider,
  saveSyncedTour,
  subscribeUserTours,
  updateUserPreferences,
} from './lib/firebase';
import {
  distanceToPolylineMeters,
  haversineMeters,
  metersToMilesText,
  metersToTurnCue,
  millisToDurationText,
} from './lib/formatters';
import {
  clearOfflineCache,
  getOfflineTours,
  loadLastActiveSession,
  removeOfflineTour,
  saveLastActiveSession,
  saveOfflineTour,
} from './lib/offlineCache';
import type {
  ComputedRouteStep,
  LatLng,
  LiveTelemetry,
  MapStyleId,
  OfflineCachedTour,
  OriginPoint,
  RouteObjective,
  SchoolLevelFilter,
  SchoolPlace,
  SyncedSchoolTour,
  TargetCategory,
  TourStop,
  TravelModeOption,
} from './types/navigation';

type SidebarTab = 'discover' | 'tour' | 'navigation' | 'saved';
type SheetSnap = 'peek' | 'half' | 'full';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const DEFAULT_SEARCH_AREA: OriginPoint = {
  name: 'Karachi, Pakistan',
  lat: 24.8607,
  lng: 67.0011,
  isCurrentLocation: false,
};

function getInitialValidSession() {
  const last = loadLastActiveSession();
  if (!last) return null;
  if (last.originName === 'Palo Alto, CA' && last.stops.length === 0) {
    return null;
  }
  return last;
}

function CampusRouteWorkspace({
  quotaExceeded,
}: {
  quotaExceeded: boolean;
}) {
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<SidebarTab>('discover');
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half');

  // Auth & Sync state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncedTours, setSyncedTours] = useState<SyncedSchoolTour[]>([]);
  const [offlineTours, setOfflineTours] = useState<OfflineCachedTour[]>(() =>
    getOfflineTours()
  );

  // Target Area (where to find schools/places) & User Starting Location (route origin)
  const [searchArea, setSearchArea] = useState<OriginPoint>(() => {
    const last = getInitialValidSession();
    if (last) {
      if (last.stops.length > 0 && last.originName.startsWith('My ')) {
        return {
          name: last.stops[0].name,
          lat: last.stops[0].lat,
          lng: last.stops[0].lng,
          isCurrentLocation: false,
        };
      }
      if (!last.originName.startsWith('My ')) {
        return {
          name: last.originName,
          lat: last.originLat,
          lng: last.originLng,
          isCurrentLocation: false,
        };
      }
    }
    return DEFAULT_SEARCH_AREA;
  });
  const [myLocation, setMyLocation] = useState<OriginPoint | null>(() => {
    const last = getInitialValidSession();
    if (last && last.stops.length > 0) {
      return {
        name: last.originName,
        lat: last.originLat,
        lng: last.originLng,
        isCurrentLocation: last.originName.startsWith('My '),
      };
    }
    return null;
  });
  const [isLocating, setIsLocating] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState<number>(() => {
    const last = getInitialValidSession();
    return last?.radiusMiles ?? 5;
  });
  const [targetCategory, setTargetCategory] =
    useState<TargetCategory>('schools');
  const [levelFilter, setLevelFilter] = useState<SchoolLevelFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [focusedSchoolId, setFocusedSchoolId] = useState<string | null>(null);

  // Tour Planning State
  const [tourStops, setTourStops] = useState<TourStop[]>(() => {
    const last = getInitialValidSession();
    return last?.stops ?? [];
  });
  const [travelMode, setTravelMode] = useState<TravelModeOption>(() => {
    const last = loadLastActiveSession();
    return last?.travelMode ?? 'DRIVING';
  });
  const [routeObjective, setRouteObjective] = useState<RouteObjective>(() => {
    const last = loadLastActiveSession();
    return last?.routeObjective ?? 'FASTEST_TRAFFIC';
  });
  const [optimizeOrder, setOptimizeOrder] = useState<boolean>(() => {
    const last = loadLastActiveSession();
    return last?.optimizeOrder ?? true;
  });
  const [roundTrip, setRoundTrip] = useState<boolean>(() => {
    const last = loadLastActiveSession();
    return last?.roundTrip ?? false;
  });
  const [tourTitle, setTourTitle] = useState<string>(() => {
    const last = loadLastActiveSession();
    return last?.title ?? 'Multi-Stop Route';
  });
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [isSavingTour, setIsSavingTour] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Map Style & Traffic
  const [mapStyle, setMapStyle] = useState<MapStyleId>('daylight');
  const [showTraffic, setShowTraffic] = useState<boolean>(true);

  // Active Live Navigation & Voice State
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [gpsFollowEnabled, setGpsFollowEnabled] = useState(true);
  const [userLiveLocation, setUserLiveLocation] = useState<LatLng | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetry | null>(null);
  const [isRerouting, setIsRerouting] = useState(false);
  const voice = useVoiceGuidance(true);

  const approachedStepIdRef = useRef<string | null>(null);
  const offRouteTicksRef = useRef<number>(0);
  const lastRerouteAtRef = useRef<number>(0);
  const pendingLiveStartRef = useRef<boolean>(false);
  const touchStartYRef = useRef<number | null>(null);

  const routeOrigin = myLocation ?? searchArea;
  const hasCustomStartLocation = Boolean(myLocation);

  // Google Maps Hooks
  const {
    schools,
    setSchools,
    isSearching,
    searchError,
    searchNearbySchools,
  } = useSchoolSearch();

  const {
    computedRoute,
    setComputedRoute,
    sdkRoute,
    isComputing,
    routeError,
    distantStops,
    recompute,
  } = useMultiStopRoute({
    origin: routeOrigin,
    stops: tourStops,
    travelMode,
    routeObjective,
    optimizeOrder,
    roundTrip,
    isOnline,
  });

  // Clear rerouting indicator once route finishes recomputing
  useEffect(() => {
    if (!isComputing && isRerouting) {
      setIsRerouting(false);
      setActiveStepIndex(0);
      approachedStepIdRef.current = null;
    }
  }, [isComputing, isRerouting]);

  // Restore offline computed route on initial load if offline
  const restoredOfflineRef = useRef(false);
  useEffect(() => {
    if (restoredOfflineRef.current) return;
    restoredOfflineRef.current = true;
    if (!isOnline) {
      const last = loadLastActiveSession();
      if (last?.route) {
        setComputedRoute(last.route);
      }
      if (last?.stops.length) {
        setSchools(
          last.stops.map(s => ({
            placeId: s.placeId,
            name: s.name,
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            rating: s.rating,
            primaryType: s.primaryType,
          }))
        );
      }
    }
  }, [isOnline, setComputedRoute, setSchools]);

  // Sync Tailwind dark mode with Night map style
  useEffect(() => {
    const root = document.documentElement;
    if (mapStyle === 'night') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [mapStyle]);

  // Persist active session for seamless offline fallback
  useEffect(() => {
    saveLastActiveSession({
      id: activeTourId || 'last_active',
      title: tourTitle,
      originName: routeOrigin.name,
      originLat: routeOrigin.lat,
      originLng: routeOrigin.lng,
      radiusMiles,
      travelMode,
      routeObjective,
      optimizeOrder,
      roundTrip,
      stops: tourStops,
      route: computedRoute,
      cachedAt: Date.now(),
    });
  }, [
    activeTourId,
    tourTitle,
    routeOrigin,
    radiusMiles,
    travelMode,
    routeObjective,
    optimizeOrder,
    roundTrip,
    tourStops,
    computedRoute,
  ]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async nextUser => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        try {
          const prefs = await ensureUserProfile(
            nextUser.uid,
            nextUser.displayName,
            nextUser.email
          );
          setRadiusMiles(prefs.defaultRadiusMiles);
          setMapStyle(prefs.preferredMapStyle);
          voice.setEnabled(prefs.voiceGuidanceEnabled);
        } catch {
          // Handled cleanly via ErrorBoundary / console
        }
      } else {
        setSyncedTours([]);
      }
    });
    return () => unsub();
  }, []);

  // Firestore real-time tours listener
  useEffect(() => {
    if (!authReady || !user) return;
    const unsub = subscribeUserTours(
      user.uid,
      tours => setSyncedTours(tours),
      err => console.error('Tour sync error:', err)
    );
    return () => unsub();
  }, [authReady, user]);

  // Search nearby / text targets around selected searchArea (debounced for text input)
  useEffect(() => {
    if (!isOnline || isRerouting) return;
    const delay = searchQuery.trim().length >= 2 ? 360 : 0;
    const timer = window.setTimeout(() => {
      void searchNearbySchools(
        {lat: searchArea.lat, lng: searchArea.lng},
        radiusMiles,
        levelFilter,
        targetCategory,
        searchQuery
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    isOnline,
    isRerouting,
    searchArea.lat,
    searchArea.lng,
    radiusMiles,
    levelFilter,
    targetCategory,
    searchQuery,
    searchNearbySchools,
  ]);

  // Request user's current GPS position as their Starting Location (preserves Target Area)
  const handleUseCurrentLocation = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setMyLocation({
          name: 'My Current Location',
          lat: coords.lat,
          lng: coords.lng,
          isCurrentLocation: true,
        });
        setUserLiveLocation(coords);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  }, []);

  // Flatten turn-by-turn steps across legs
  const allSteps: ComputedRouteStep[] = useMemo(() => {
    if (!computedRoute) return [];
    return computedRoute.legs.flatMap(leg => leg.steps);
  }, [computedRoute]);

  const activeStep = allSteps[activeStepIndex] || null;

  // Keep phone screen awake during active Car / Bike navigation
  useEffect(() => {
    if (!isNavigating || !('wakeLock' in navigator)) return;
    let wakeLock: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        // Ignore if battery saver / browser denies wake lock
      }
    };

    void acquire();
    const onVisibility = () => {
      if (!disposed && document.visibilityState === 'visible') {
        void acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void wakeLock?.release();
    };
  }, [isNavigating]);

  // Live GPS tracking, approach voice cues, step advancement & off-route rerouting for Car & Bike
  useEffect(() => {
    if (!isNavigating || !('geolocation' in navigator)) {
      return;
    }

    const advanceThreshold = travelMode === 'DRIVING' ? 50 : 30;
    const approachThreshold = travelMode === 'DRIVING' ? 180 : 95;
    const offRouteThreshold = travelMode === 'DRIVING' ? 140 : 90;

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const currentPos: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLiveLocation(currentPos);

        const currentStep = allSteps[activeStepIndex];
        const targetEnd = currentStep?.endLocation;
        const distToTurn = targetEnd
          ? haversineMeters(currentPos, targetEnd)
          : null;
        const distOffRoute =
          computedRoute?.encodedPolylinePoints.length
            ? distanceToPolylineMeters(
                currentPos,
                computedRoute.encodedPolylinePoints
              )
            : null;

        setLiveTelemetry({
          location: currentPos,
          heading:
            typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading)
              ? pos.coords.heading
              : null,
          speedMps:
            typeof pos.coords.speed === 'number' && !Number.isNaN(pos.coords.speed)
              ? pos.coords.speed
              : null,
          accuracyMeters:
            typeof pos.coords.accuracy === 'number'
              ? pos.coords.accuracy
              : null,
          distanceToNextTurnMeters: distToTurn,
          distanceOffRouteMeters: distOffRoute,
          updatedAt: Date.now(),
        });

        if (
          currentStep &&
          distToTurn !== null &&
          currentStep.distanceMeters > 240 &&
          distToTurn <= approachThreshold &&
          distToTurn > advanceThreshold &&
          approachedStepIdRef.current !== currentStep.id
        ) {
          approachedStepIdRef.current = currentStep.id;
          const nextStep = allSteps[activeStepIndex + 1];
          if (nextStep) {
            voice.speak(
              `${metersToTurnCue(distToTurn)}, ${nextStep.instruction}`
            );
          }
        }

        let advanced = false;
        if (distToTurn !== null && distToTurn <= advanceThreshold) {
          advanced = true;
          if (activeStepIndex < allSteps.length - 1) {
            const nextIdx = activeStepIndex + 1;
            setActiveStepIndex(nextIdx);
            const nextStep = allSteps[nextIdx];
            if (nextStep) {
              voice.speak(
                `${nextStep.instruction}. ${nextStep.distanceText}.`
              );
            }
          } else {
            voice.speak('You have arrived at your final stop.');
          }
        } else if (
          activeStepIndex < allSteps.length - 1 &&
          distToTurn !== null &&
          distToTurn > 80
        ) {
          for (
            let lookIdx = activeStepIndex + 1;
            lookIdx < Math.min(allSteps.length, activeStepIndex + 4);
            lookIdx++
          ) {
            const candidateEnd = allSteps[lookIdx]?.endLocation;
            if (
              candidateEnd &&
              haversineMeters(currentPos, candidateEnd) < advanceThreshold
            ) {
              advanced = true;
              setActiveStepIndex(lookIdx);
              const nextStep = allSteps[lookIdx];
              if (nextStep) {
                voice.speak(`${nextStep.instruction}.`);
              }
              break;
            }
          }
        }

        if (advanced) {
          offRouteTicksRef.current = 0;
          return;
        }

        if (
          gpsFollowEnabled &&
          isOnline &&
          !isRerouting &&
          !isComputing &&
          distOffRoute !== null &&
          distOffRoute > offRouteThreshold
        ) {
          offRouteTicksRef.current += 1;
          const now = Date.now();
          if (
            offRouteTicksRef.current >= 2 &&
            now - lastRerouteAtRef.current > 15000
          ) {
            offRouteTicksRef.current = 0;
            lastRerouteAtRef.current = now;
            setIsRerouting(true);
            voice.speak('Off route. Recalculating directions.');
            setMyLocation({
              name: 'My Live GPS',
              lat: currentPos.lat,
              lng: currentPos.lng,
              isCurrentLocation: true,
            });
          }
        } else {
          offRouteTicksRef.current = 0;
        }
      },
      () => {
        // Ignore transient GPS watch warnings
      },
      {enableHighAccuracy: true, maximumAge: 1500, timeout: 10000}
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [
    isNavigating,
    gpsFollowEnabled,
    isOnline,
    isRerouting,
    isComputing,
    travelMode,
    allSteps,
    activeStepIndex,
    computedRoute?.encodedPolylinePoints,
    voice,
  ]);

  // Handlers
  const handleToggleStop = useCallback((school: SchoolPlace) => {
    setTourStops(prev => {
      const exists = prev.some(s => s.placeId === school.placeId);
      if (exists) {
        return prev.filter(s => s.placeId !== school.placeId);
      }
      if (prev.length >= 12) return prev;
      return [
        ...prev,
        {
          placeId: school.placeId,
          name: school.name,
          address: school.address,
          lat: school.lat,
          lng: school.lng,
          rating: school.rating,
          primaryType: school.primaryType,
        },
      ];
    });
  }, []);

  const handleMoveStop = useCallback((index: number, direction: -1 | 1) => {
    setTourStops(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const handleRemoveStop = useCallback((placeId: string) => {
    setTourStops(prev => prev.filter(s => s.placeId !== placeId));
  }, []);

  const handleRemoveDistantStops = useCallback(() => {
    const distantIds = new Set(distantStops.map(d => d.placeId));
    setTourStops(prev => prev.filter(s => !distantIds.has(s.placeId)));
  }, [distantStops]);

  const handleChangeMapStyle = useCallback(
    (style: MapStyleId) => {
      setMapStyle(style);
      if (user && isOnline) {
        void updateUserPreferences(user.uid, {preferredMapStyle: style});
      }
    },
    [user, isOnline]
  );

  const handleChangeRadius = useCallback(
    (miles: number) => {
      setRadiusMiles(miles);
      if (user && isOnline) {
        void updateUserPreferences(user.uid, {defaultRadiusMiles: miles});
      }
    },
    [user, isOnline]
  );

  const handleChangeTravelMode = useCallback((mode: TravelModeOption) => {
    setTravelMode(mode);
    setActiveStepIndex(0);
    approachedStepIdRef.current = null;
  }, []);

  const handleToggleVoice = useCallback(() => {
    const next = !voice.enabled;
    voice.setEnabled(next);
    if (!next) voice.stop();
    if (user && isOnline) {
      void updateUserPreferences(user.uid, {voiceGuidanceEnabled: next});
    }
  }, [voice, user, isOnline]);

  const beginNavigationSession = useCallback(
    (stepsToSpeak: ComputedRouteStep[]) => {
      if (stepsToSpeak.length === 0) return;
      setActiveStepIndex(0);
      approachedStepIdRef.current = null;
      offRouteTicksRef.current = 0;
      setGpsFollowEnabled(true);
      setIsNavigating(true);
      setActiveTab('navigation');
      setSheetSnap('peek');
      const first = stepsToSpeak[0];
      if (first) {
        const modeWord =
          travelMode === 'BICYCLING'
            ? 'bike'
            : travelMode === 'DRIVING'
              ? 'car'
              : 'route';
        voice.speak(
          `Starting live ${modeWord} navigation. ${first.instruction}. For ${first.distanceText}.`,
          true
        );
      }
    },
    [travelMode, voice]
  );

  const handleStartNavigation = useCallback(() => {
    beginNavigationSession(allSteps);
  }, [allSteps, beginNavigationSession]);

  const handleStartLiveGpsNavigation = useCallback(() => {
    if (!myLocation?.isCurrentLocation && isOnline && 'geolocation' in navigator) {
      pendingLiveStartRef.current = true;
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        pos => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setUserLiveLocation(coords);
          setMyLocation({
            name: 'My Live GPS',
            lat: coords.lat,
            lng: coords.lng,
            isCurrentLocation: true,
          });
          setIsLocating(false);
        },
        () => {
          pendingLiveStartRef.current = false;
          setIsLocating(false);
          beginNavigationSession(allSteps);
        },
        {enableHighAccuracy: true, timeout: 4500}
      );
      return;
    }
    beginNavigationSession(allSteps);
  }, [myLocation?.isCurrentLocation, isOnline, allSteps, beginNavigationSession]);

  useEffect(() => {
    if (pendingLiveStartRef.current && !isComputing && allSteps.length > 0) {
      pendingLiveStartRef.current = false;
      beginNavigationSession(allSteps);
    }
  }, [isComputing, allSteps, beginNavigationSession]);

  const handleStopNavigation = useCallback(() => {
    setIsNavigating(false);
    setIsRerouting(false);
    pendingLiveStartRef.current = false;
    voice.stop();
  }, [voice]);

  const handleSelectStep = useCallback((index: number) => {
    setActiveStepIndex(index);
    setIsNavigating(true);
    setSheetSnap('peek');
  }, []);

  const handleSaveTour = useCallback(async () => {
    setIsSavingTour(true);
    setSaveFeedback(null);
    const localId = activeTourId || `tour_${Date.now()}`;

    const nextOffline = saveOfflineTour({
      id: localId,
      title: tourTitle.trim() || 'Multi-Stop Route',
      originName: routeOrigin.name,
      originLat: routeOrigin.lat,
      originLng: routeOrigin.lng,
      radiusMiles,
      travelMode,
      routeObjective,
      optimizeOrder,
      roundTrip,
      stops: computedRoute?.orderedStops.length
        ? computedRoute.orderedStops
        : tourStops,
      route: computedRoute,
      cachedAt: Date.now(),
    });
    setOfflineTours(nextOffline);

    try {
      if (user && isOnline) {
        const savedId = await saveSyncedTour(user.uid, {
          id: localId,
          title: tourTitle.trim() || 'Multi-Stop Route',
          originName: routeOrigin.name,
          originLat: routeOrigin.lat,
          originLng: routeOrigin.lng,
          radiusMiles,
          travelMode,
          routeObjective,
          optimizeOrder,
          roundTrip,
          stops: computedRoute?.orderedStops.length
            ? computedRoute.orderedStops
            : tourStops,
          totalDistanceMeters: computedRoute?.totalDistanceMeters,
          totalDurationMillis: computedRoute?.totalDurationMillis,
        });
        setActiveTourId(savedId);
        setSaveFeedback('Synced across your devices and cached offline.');
      } else {
        setActiveTourId(localId);
        setSaveFeedback('Saved to offline device cache.');
      }
    } catch {
      setSaveFeedback('Cached locally. Sign in online to sync across devices.');
    } finally {
      setIsSavingTour(false);
    }
  }, [
    activeTourId,
    tourTitle,
    routeOrigin,
    radiusMiles,
    travelMode,
    routeObjective,
    optimizeOrder,
    roundTrip,
    tourStops,
    computedRoute,
    user,
    isOnline,
  ]);

  const handleLoadSyncedTour = useCallback((tour: SyncedSchoolTour) => {
    setActiveTourId(tour.id);
    setTourTitle(tour.title);
    setMyLocation({
      name: tour.originName,
      lat: tour.originLat,
      lng: tour.originLng,
      isCurrentLocation: tour.originName.startsWith('My '),
    });
    if (tour.stops.length > 0) {
      setSearchArea({
        name: tour.stops[0].name,
        lat: tour.stops[0].lat,
        lng: tour.stops[0].lng,
        isCurrentLocation: false,
      });
    } else if (!tour.originName.startsWith('My ')) {
      setSearchArea({
        name: tour.originName,
        lat: tour.originLat,
        lng: tour.originLng,
        isCurrentLocation: false,
      });
    }
    setRadiusMiles(tour.radiusMiles);
    setTravelMode(tour.travelMode);
    setRouteObjective(tour.routeObjective);
    setOptimizeOrder(tour.optimizeOrder);
    setRoundTrip(tour.roundTrip);
    setTourStops(tour.stops);
    setIsNavigating(false);
    setActiveTab('tour');
    setSheetSnap('half');
  }, []);

  const handleLoadOfflineTour = useCallback(
    (tour: OfflineCachedTour) => {
      setActiveTourId(tour.id);
      setTourTitle(tour.title);
      setMyLocation({
        name: tour.originName,
        lat: tour.originLat,
        lng: tour.originLng,
        isCurrentLocation: tour.originName.startsWith('My '),
      });
      if (tour.stops.length > 0) {
        setSearchArea({
          name: tour.stops[0].name,
          lat: tour.stops[0].lat,
          lng: tour.stops[0].lng,
          isCurrentLocation: false,
        });
      } else if (!tour.originName.startsWith('My ')) {
        setSearchArea({
          name: tour.originName,
          lat: tour.originLat,
          lng: tour.originLng,
          isCurrentLocation: false,
        });
      }
      setRadiusMiles(tour.radiusMiles);
      setTravelMode(tour.travelMode);
      setRouteObjective(tour.routeObjective);
      setOptimizeOrder(tour.optimizeOrder);
      setRoundTrip(tour.roundTrip);
      setTourStops(tour.stops);
      if (tour.route) {
        setComputedRoute(tour.route);
      }
      setIsNavigating(false);
      setActiveTab('tour');
      setSheetSnap('half');
    },
    [setComputedRoute]
  );

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Sign in failed:', err);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  // Touch swipe handlers for Mobile Bottom Sheet handle
  const handleSheetTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleSheetTouchEnd = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartYRef.current = null;
    if (deltaY < -36) {
      setSheetSnap(prev => (prev === 'peek' ? 'half' : 'full'));
    } else if (deltaY > 36) {
      setSheetSnap(prev => (prev === 'full' ? 'half' : 'peek'));
    }
  };

  const cycleSheetSnap = () => {
    setSheetSnap(prev =>
      prev === 'peek' ? 'half' : prev === 'half' ? 'full' : 'peek'
    );
  };

  const activeTabContent = (
    <>
      {activeTab === 'discover' && (
        <SidebarDiscover
          searchArea={searchArea}
          onSelectSearchArea={next => {
            setSearchArea(next);
            setFocusedSchoolId(null);
          }}
          myLocation={myLocation}
          onSelectMyLocation={next => {
            setMyLocation(next);
          }}
          onUseCurrentLocation={handleUseCurrentLocation}
          isLocating={isLocating}
          radiusMiles={radiusMiles}
          onChangeRadius={handleChangeRadius}
          targetCategory={targetCategory}
          onChangeTargetCategory={setTargetCategory}
          levelFilter={levelFilter}
          onChangeLevelFilter={setLevelFilter}
          searchQuery={searchQuery}
          onChangeSearchQuery={setSearchQuery}
          schools={schools}
          isSearching={isSearching}
          searchError={searchError}
          onRefreshSearch={() =>
            void searchNearbySchools(
              {lat: searchArea.lat, lng: searchArea.lng},
              radiusMiles,
              levelFilter,
              targetCategory,
              searchQuery
            )
          }
          tourStops={tourStops}
          onToggleStop={handleToggleStop}
          focusedSchoolId={focusedSchoolId}
          onFocusSchool={id => {
            setFocusedSchoolId(id);
            if (sheetSnap === 'full') {
              setSheetSnap('half');
            }
          }}
          onOpenTour={() => {
            setActiveTab('tour');
            setSheetSnap('half');
          }}
          isOnline={isOnline}
        />
      )}

      {activeTab === 'tour' && (
        <SidebarTour
          origin={routeOrigin}
          searchArea={searchArea}
          hasCustomStartLocation={hasCustomStartLocation}
          onSelectMyLocation={next => setMyLocation(next)}
          onUseCurrentLocation={handleUseCurrentLocation}
          isLocating={isLocating}
          stops={tourStops}
          computedRoute={computedRoute}
          isComputing={isComputing}
          routeError={routeError}
          distantStopsCount={distantStops.length}
          onRemoveDistantStops={handleRemoveDistantStops}
          travelMode={travelMode}
          onChangeTravelMode={handleChangeTravelMode}
          routeObjective={routeObjective}
          onChangeRouteObjective={setRouteObjective}
          optimizeOrder={optimizeOrder}
          onToggleOptimizeOrder={() => setOptimizeOrder(v => !v)}
          roundTrip={roundTrip}
          onToggleRoundTrip={() => setRoundTrip(v => !v)}
          onMoveStop={handleMoveStop}
          onRemoveStop={handleRemoveStop}
          onClearStops={() => {
            setTourStops([]);
            setIsNavigating(false);
          }}
          onRefreshTraffic={recompute}
          onStartNavigation={handleStartNavigation}
          onStartLiveGpsNavigation={handleStartLiveGpsNavigation}
          tourTitle={tourTitle}
          onChangeTourTitle={setTourTitle}
          onSaveTour={handleSaveTour}
          isSavingTour={isSavingTour}
          saveFeedback={saveFeedback}
          isSignedIn={Boolean(user)}
          isOnline={isOnline}
        />
      )}

      {activeTab === 'navigation' && (
        <SidebarNavigation
          computedRoute={computedRoute}
          travelMode={travelMode}
          onChangeTravelMode={handleChangeTravelMode}
          isNavigating={isNavigating}
          onStartNavigation={handleStartLiveGpsNavigation}
          onStopNavigation={handleStopNavigation}
          activeStepIndex={activeStepIndex}
          onSelectStep={handleSelectStep}
          voiceEnabled={voice.enabled}
          onToggleVoice={handleToggleVoice}
          voiceRate={voice.rate}
          onChangeVoiceRate={voice.setRate}
          voiceSupported={voice.isSupported}
          onSpeakStep={step =>
            voice.speak(`${step.instruction}. ${step.distanceText}.`, true)
          }
          gpsFollowEnabled={gpsFollowEnabled}
          onToggleGpsFollow={() => setGpsFollowEnabled(v => !v)}
        />
      )}

      {activeTab === 'saved' && (
        <SidebarSaved
          isSignedIn={Boolean(user)}
          userEmail={user?.email || null}
          onSignIn={() => void handleSignIn()}
          syncedTours={syncedTours}
          onLoadSyncedTour={handleLoadSyncedTour}
          onDeleteSyncedTour={tourId => {
            if (user) {
              void deleteSyncedTour(user.uid, tourId);
            }
          }}
          offlineTours={offlineTours}
          onLoadOfflineTour={handleLoadOfflineTour}
          onRemoveOfflineTour={id => setOfflineTours(removeOfflineTour(id))}
          onClearOfflineCache={() => {
            clearOfflineCache();
            setOfflineTours([]);
          }}
          isOnline={isOnline}
        />
      )}
    </>
  );

  const showMobileSheet = !(isNavigating && sheetSnap === 'peek');

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Case A Quota Defense Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Three-Zone Top Bar Contract */}
      <header className="h-12 md:h-14 shrink-0 px-4 md:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-4 md:gap-8">
        <a
          href="/"
          className="font-display text-base md:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          Route Creator
        </a>

        <nav
          aria-label="Workspace sections"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {(
            [
              {id: 'discover', label: 'Discover'},
              {id: 'tour', label: `Tour Stops (${tourStops.length})`},
              {id: 'navigation', label: 'Turn-by-Turn'},
              {id: 'saved', label: 'Saved Routes'},
            ] as {id: SidebarTab; label: string}[]
          ).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'border-teal-600 text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="max-w-[110px] md:max-w-[140px] truncate">
                {user.displayName || user.email || 'Sign out'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignIn()}
              disabled={!isOnline}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 md:px-4 py-1.5 md:py-2 rounded-lg bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sync Devices
            </button>
          )}
        </div>
      </header>

      {/* Main Split Workspace: Always-Visible Map + Desktop Sidebar + Mobile Interactive Bottom Sheet */}
      <main className="flex-1 relative flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-[410px] lg:w-[430px] h-full shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex-col min-h-0">
          {activeTabContent}
        </aside>

        {/* Persistent Full-Height Interactive Map Viewport */}
        <section className="flex-1 h-full relative min-h-0">
          <SchoolMapCanvas
            origin={routeOrigin}
            searchArea={searchArea}
            hasCustomStartLocation={hasCustomStartLocation}
            radiusMiles={radiusMiles}
            schools={schools}
            tourStops={tourStops}
            computedRoute={computedRoute}
            sdkRoute={sdkRoute}
            mapStyle={mapStyle}
            onChangeMapStyle={handleChangeMapStyle}
            showTraffic={showTraffic}
            onToggleTraffic={() => setShowTraffic(v => !v)}
            focusedSchoolId={focusedSchoolId}
            onFocusSchool={setFocusedSchoolId}
            onToggleStop={handleToggleStop}
            travelMode={travelMode}
            onChangeTravelMode={handleChangeTravelMode}
            isNavigating={isNavigating}
            onStartLiveGpsNavigation={handleStartLiveGpsNavigation}
            onStopNavigation={handleStopNavigation}
            activeStep={activeStep}
            activeStepIndex={activeStepIndex}
            totalSteps={allSteps.length}
            onPrevStep={() => {
              const prev = Math.max(0, activeStepIndex - 1);
              setActiveStepIndex(prev);
              approachedStepIdRef.current = null;
              const step = allSteps[prev];
              if (step) {
                voice.speak(`${step.instruction}. ${step.distanceText}.`, true);
              }
            }}
            onNextStep={() => {
              const next = Math.min(allSteps.length - 1, activeStepIndex + 1);
              setActiveStepIndex(next);
              approachedStepIdRef.current = null;
              const step = allSteps[next];
              if (step) {
                voice.speak(`${step.instruction}. ${step.distanceText}.`, true);
              }
            }}
            onRepeatStep={() => {
              if (activeStep) {
                voice.speak(
                  `${activeStep.instruction}. ${activeStep.distanceText}.`,
                  true
                );
              }
            }}
            voiceEnabled={voice.enabled}
            onToggleVoice={handleToggleVoice}
            userLiveLocation={userLiveLocation}
            liveTelemetry={liveTelemetry}
            gpsFollowEnabled={gpsFollowEnabled}
            onToggleGpsFollow={() => setGpsFollowEnabled(v => !v)}
            onDisableGpsFollow={() => setGpsFollowEnabled(false)}
            isRerouting={isRerouting}
            isComputing={isComputing}
            isVisibleOnMobile={sheetSnap === 'peek' || sheetSnap === 'half'}
            showMobileQuickLaunch={false}
          />
        </section>

        {/* Mobile Resizable Bottom Sheet over Live Map */}
        {showMobileSheet && (
          <div
            className={`md:hidden absolute left-0 right-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-white/97 dark:bg-slate-950/97 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-[0_-10px_32px_rgba(15,23,42,0.14)] overflow-hidden ${
              sheetSnap === 'full'
                ? 'h-[92%]'
                : sheetSnap === 'half'
                  ? 'h-[56%]'
                  : 'h-auto'
            }`}
          >
            {/* Drag Handle + Quick Summary Header */}
            <div
              onTouchStart={handleSheetTouchStart}
              onTouchEnd={handleSheetTouchEnd}
              className="shrink-0 border-b border-slate-100 dark:border-slate-800/80 select-none"
            >
              <button
                type="button"
                onClick={cycleSheetSnap}
                aria-label="Resize panel"
                className="w-full pt-2 pb-1 flex justify-center"
              >
                <span className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              </button>

              <div className="px-4 pb-2.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSheetSnap(prev => (prev === 'peek' ? 'half' : 'peek'))
                  }
                  className="text-left min-w-0 flex-1 py-0.5"
                >
                  {tourStops.length > 0 && computedRoute ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white truncate">
                      <span>
                        {tourStops.length} stop{tourStops.length > 1 ? 's' : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
                        {millisToDurationText(computedRoute.totalDurationMillis)} ·{' '}
                        {metersToMilesText(computedRoute.totalDistanceMeters)}
                      </span>
                    </div>
                  ) : tourStops.length > 0 ? (
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {tourStops.length} stop{tourStops.length > 1 ? 's' : ''} selected
                      {isComputing ? ' · Routing...' : routeError ? ' · Needs review' : ''}
                    </div>
                  ) : (
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {schools.length} places in {searchArea.name}
                      {!hasCustomStartLocation ? ' · Set your location' : ''}
                    </div>
                  )}
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {tourStops.length > 0 && computedRoute && !isNavigating && (
                    <button
                      type="button"
                      onClick={handleStartLiveGpsNavigation}
                      className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold whitespace-nowrap"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Go Live
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={cycleSheetSnap}
                    aria-label={
                      sheetSnap === 'full' ? 'Collapse sheet' : 'Expand sheet'
                    }
                    className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {sheetSnap === 'full' ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronUp className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Sheet Body (Hidden cleanly when in Peek state) */}
            {sheetSnap !== 'peek' && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {activeTabContent}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur pb-safe z-30"
      >
        <div className="grid grid-cols-5 h-14">
          {(
            [
              {id: 'map', label: 'Map', icon: MapIcon},
              {id: 'discover', label: 'Discover', icon: Compass},
              {
                id: 'tour',
                label: tourStops.length > 0 ? `Tour (${tourStops.length})` : 'Tour',
                icon: ListOrdered,
              },
              {id: 'navigation', label: 'Steps', icon: Navigation},
              {id: 'saved', label: 'Saved', icon: Bookmark},
            ] as {
              id: 'map' | SidebarTab;
              label: string;
              icon: React.ComponentType<{className?: string}>;
            }[]
          ).map(item => {
            const Icon = item.icon;
            const isActive =
              item.id === 'map'
                ? sheetSnap === 'peek'
                : sheetSnap !== 'peek' && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'map') {
                    setSheetSnap('peek');
                  } else {
                    setActiveTab(item.id);
                    setSheetSnap(prev =>
                      prev === 'peek' || activeTab !== item.id ? 'half' : prev
                    );
                  }
                }}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] px-1 transition-colors ${
                  isActive
                    ? 'text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] leading-none whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <AppFooter variant="bar" />

      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  if (!MAPS_API_KEY) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full rounded-xl bg-white border border-slate-200 p-6 shadow-sm">
          <h1 className="font-display text-lg font-bold text-slate-900">
            Route Creator Setup Required
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            The Google Maps Platform API key is not configured in{' '}
            <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
              VITE_GOOGLE_MAPS_API_KEY
            </code>
            . Please configure your Maps API key to load interactive maps and routing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      language="en"
      region="PK"
      libraries={['places', 'routes', 'geometry', 'marker']}
    >
      <CampusRouteWorkspace quotaExceeded={quotaExceeded} />
    </APIProvider>
  );
}
