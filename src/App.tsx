import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
import {onAuthStateChanged, signInWithPopup, signOut, type User} from 'firebase/auth';
import {LogIn, LogOut} from 'lucide-react';
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
import {haversineMeters} from './lib/formatters';
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
  MapStyleId,
  OfflineCachedTour,
  OriginPoint,
  RouteObjective,
  SchoolLevelFilter,
  SchoolPlace,
  SyncedSchoolTour,
  TourStop,
  TravelModeOption,
} from './types/navigation';

type SidebarTab = 'discover' | 'tour' | 'navigation' | 'saved';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const DEFAULT_ORIGIN: OriginPoint = {
  name: 'Palo Alto, CA',
  lat: 37.4419,
  lng: -122.143,
  isCurrentLocation: false,
};

function CampusRouteWorkspace({
  quotaExceeded,
}: {
  quotaExceeded: boolean;
}) {
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<SidebarTab>('discover');

  // Auth & Sync state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncedTours, setSyncedTours] = useState<SyncedSchoolTour[]>([]);
  const [offlineTours, setOfflineTours] = useState<OfflineCachedTour[]>(() =>
    getOfflineTours()
  );

  // Origin & Discovery Filters
  const [origin, setOrigin] = useState<OriginPoint>(() => {
    const last = loadLastActiveSession();
    if (last) {
      return {
        name: last.originName,
        lat: last.originLat,
        lng: last.originLng,
      };
    }
    return DEFAULT_ORIGIN;
  });
  const [isLocating, setIsLocating] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState<number>(() => {
    const last = loadLastActiveSession();
    return last?.radiusMiles ?? 5;
  });
  const [levelFilter, setLevelFilter] = useState<SchoolLevelFilter>('all');
  const [focusedSchoolId, setFocusedSchoolId] = useState<string | null>(null);

  // Tour Planning State
  const [tourStops, setTourStops] = useState<TourStop[]>(() => {
    const last = loadLastActiveSession();
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
    return last?.title ?? 'School Tour Route';
  });
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [isSavingTour, setIsSavingTour] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Map Style & Traffic
  const [mapStyle, setMapStyle] = useState<MapStyleId>('daylight');
  const [showTraffic, setShowTraffic] = useState<boolean>(true);

  // Active Navigation & Voice State
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [gpsFollowEnabled, setGpsFollowEnabled] = useState(true);
  const [userLiveLocation, setUserLiveLocation] = useState<LatLng | null>(null);
  const voice = useVoiceGuidance(true);

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
    recompute,
  } = useMultiStopRoute({
    origin,
    stops: tourStops,
    travelMode,
    routeObjective,
    optimizeOrder,
    roundTrip,
    isOnline,
  });

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
      originName: origin.name,
      originLat: origin.lat,
      originLng: origin.lng,
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
    origin,
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

  // Firestore real-time tours listener (only when auth is ready & user signed in)
  useEffect(() => {
    if (!authReady || !user) return;
    const unsub = subscribeUserTours(
      user.uid,
      tours => setSyncedTours(tours),
      err => console.error('Tour sync error:', err)
    );
    return () => unsub();
  }, [authReady, user]);

  // Search schools automatically when online and origin/radius/level changes
  useEffect(() => {
    if (!isOnline) return;
    void searchNearbySchools(
      {lat: origin.lat, lng: origin.lng},
      radiusMiles,
      levelFilter
    );
  }, [isOnline, origin.lat, origin.lng, radiusMiles, levelFilter, searchNearbySchools]);

  // Request user's current GPS position
  const handleUseCurrentLocation = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setOrigin({
          name: 'My Current Location',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          isCurrentLocation: true,
        });
        setUserLiveLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  }, []);

  // Attempt initial GPS lock once on mount if permitted
  useEffect(() => {
    if (!loadLastActiveSession() && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setOrigin({
            name: 'My Current Location',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            isCurrentLocation: true,
          });
        },
        () => {
          // Keep DEFAULT_ORIGIN seamlessly
        },
        {timeout: 5000}
      );
    }
  }, []);

  // Flatten turn-by-turn steps across legs
  const allSteps: ComputedRouteStep[] = useMemo(() => {
    if (!computedRoute) return [];
    return computedRoute.legs.flatMap(leg => leg.steps);
  }, [computedRoute]);

  const activeStep = allSteps[activeStepIndex] || null;

  // Live GPS follow during active navigation
  useEffect(() => {
    if (!isNavigating || !gpsFollowEnabled || !('geolocation' in navigator)) {
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const currentPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLiveLocation(currentPos);

        const targetEnd = allSteps[activeStepIndex]?.endLocation;
        if (targetEnd && haversineMeters(currentPos, targetEnd) < 45) {
          if (activeStepIndex < allSteps.length - 1) {
            const nextIdx = activeStepIndex + 1;
            setActiveStepIndex(nextIdx);
            const nextStep = allSteps[nextIdx];
            if (nextStep) {
              voice.speak(
                `${nextStep.instruction}. In ${nextStep.distanceText}.`
              );
            }
          } else {
            voice.speak('You have arrived at your final school stop.');
          }
        }
      },
      () => {
        // Ignore transient GPS watch warnings
      },
      {enableHighAccuracy: true, maximumAge: 2000}
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isNavigating, gpsFollowEnabled, allSteps, activeStepIndex, voice]);

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

  const handleToggleVoice = useCallback(() => {
    const next = !voice.enabled;
    voice.setEnabled(next);
    if (!next) voice.stop();
    if (user && isOnline) {
      void updateUserPreferences(user.uid, {voiceGuidanceEnabled: next});
    }
  }, [voice, user, isOnline]);

  const handleStartNavigation = useCallback(() => {
    if (allSteps.length === 0) return;
    setActiveStepIndex(0);
    setIsNavigating(true);
    setActiveTab('navigation');
    const first = allSteps[0];
    if (first) {
      voice.speak(
        `Starting navigation. ${first.instruction}. For ${first.distanceText}.`,
        true
      );
    }
  }, [allSteps, voice]);

  const handleStopNavigation = useCallback(() => {
    setIsNavigating(false);
    voice.stop();
  }, [voice]);

  const handleSelectStep = useCallback(
    (index: number) => {
      setActiveStepIndex(index);
      setIsNavigating(true);
    },
    []
  );

  const handleSaveTour = useCallback(async () => {
    setIsSavingTour(true);
    setSaveFeedback(null);
    const localId = activeTourId || `tour_${Date.now()}`;

    const nextOffline = saveOfflineTour({
      id: localId,
      title: tourTitle.trim() || 'School Tour',
      originName: origin.name,
      originLat: origin.lat,
      originLng: origin.lng,
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
          title: tourTitle.trim() || 'School Tour',
          originName: origin.name,
          originLat: origin.lat,
          originLng: origin.lng,
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
    origin,
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
    setOrigin({
      name: tour.originName,
      lat: tour.originLat,
      lng: tour.originLng,
    });
    setRadiusMiles(tour.radiusMiles);
    setTravelMode(tour.travelMode);
    setRouteObjective(tour.routeObjective);
    setOptimizeOrder(tour.optimizeOrder);
    setRoundTrip(tour.roundTrip);
    setTourStops(tour.stops);
    setIsNavigating(false);
    setActiveTab('tour');
  }, []);

  const handleLoadOfflineTour = useCallback(
    (tour: OfflineCachedTour) => {
      setActiveTourId(tour.id);
      setTourTitle(tour.title);
      setOrigin({
        name: tour.originName,
        lat: tour.originLat,
        lng: tour.originLng,
      });
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

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Case A Quota Defense Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
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
      <header className="h-14 shrink-0 px-4 md:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line brand wordmark */}
        <a
          href="/"
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          CampusRoute
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Workspace sections"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {(
            [
              {id: 'discover', label: 'Discover'},
              {id: 'tour', label: `Tour Stops (${tourStops.length})`},
              {id: 'navigation', label: 'Turn-by-Turn'},
              {id: 'saved', label: 'Saved Tours'},
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

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="max-w-[140px] truncate">
                {user.displayName || user.email || 'Sign out'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignIn()}
              disabled={!isOnline}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sync Devices
            </button>
          )}
        </div>
      </header>

      {/* Mobile Tab Switcher (only shown on small viewports) */}
      <div className="md:hidden grid grid-cols-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium shrink-0">
        {(
          [
            {id: 'discover', label: 'Discover'},
            {id: 'tour', label: `Tour (${tourStops.length})`},
            {id: 'navigation', label: 'Steps'},
            {id: 'saved', label: 'Saved'},
          ] as {id: SidebarTab; label: string}[]
        ).map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`py-2.5 text-center border-b-2 transition-colors whitespace-nowrap ${
              activeTab === item.id
                ? 'border-teal-600 text-teal-700 dark:text-teal-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Split Workspace */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left Sidebar Planner */}
        <aside className="w-full md:w-[410px] lg:w-[430px] h-[46vh] md:h-full shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col min-h-0">
          {activeTab === 'discover' && (
            <SidebarDiscover
              origin={origin}
              onSelectOrigin={next => {
                setOrigin(next);
                setFocusedSchoolId(null);
              }}
              onUseCurrentLocation={handleUseCurrentLocation}
              isLocating={isLocating}
              radiusMiles={radiusMiles}
              onChangeRadius={handleChangeRadius}
              levelFilter={levelFilter}
              onChangeLevelFilter={setLevelFilter}
              schools={schools}
              isSearching={isSearching}
              searchError={searchError}
              onRefreshSearch={() =>
                void searchNearbySchools(
                  {lat: origin.lat, lng: origin.lng},
                  radiusMiles,
                  levelFilter
                )
              }
              tourStops={tourStops}
              onToggleStop={handleToggleStop}
              focusedSchoolId={focusedSchoolId}
              onFocusSchool={id => setFocusedSchoolId(id)}
              isOnline={isOnline}
            />
          )}

          {activeTab === 'tour' && (
            <SidebarTour
              origin={origin}
              stops={tourStops}
              computedRoute={computedRoute}
              isComputing={isComputing}
              routeError={routeError}
              travelMode={travelMode}
              onChangeTravelMode={setTravelMode}
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
              isNavigating={isNavigating}
              onStartNavigation={handleStartNavigation}
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
        </aside>

        {/* Right Interactive Google Map Viewport */}
        <section className="flex-1 h-full min-h-[320px] relative">
          <SchoolMapCanvas
            origin={origin}
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
            isNavigating={isNavigating}
            onStopNavigation={handleStopNavigation}
            activeStep={activeStep}
            activeStepIndex={activeStepIndex}
            totalSteps={allSteps.length}
            onPrevStep={() => {
              const prev = Math.max(0, activeStepIndex - 1);
              setActiveStepIndex(prev);
              const step = allSteps[prev];
              if (step) {
                voice.speak(`${step.instruction}. ${step.distanceText}.`, true);
              }
            }}
            onNextStep={() => {
              const next = Math.min(allSteps.length - 1, activeStepIndex + 1);
              setActiveStepIndex(next);
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
          />
        </section>
      </main>

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
            CampusRoute Setup Required
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
      region="US"
      libraries={['places', 'routes', 'geometry', 'marker']}
    >
      <CampusRouteWorkspace quotaExceeded={quotaExceeded} />
    </APIProvider>
  );
}
