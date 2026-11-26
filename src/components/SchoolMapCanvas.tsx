import React, {useEffect, useRef, useState} from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Bike,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Layers,
  Loader2,
  MapPin,
  Navigation,
  Navigation2,
  Palette,
  Plus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  formatPlaceTypeLabel,
  metersToMilesText,
  metersToTurnCue,
  millisToDurationText,
  mpsToMphText,
} from '../lib/formatters';
import type {
  ComputedRouteStep,
  ComputedTourRoute,
  LatLng,
  LiveTelemetry,
  MapStyleId,
  OriginPoint,
  SchoolPlace,
  TourStop,
  TravelModeOption,
} from '../types/navigation';
import {ManeuverIcon} from './ManeuverIcon';

interface SchoolMapCanvasProps {
  origin: OriginPoint | null;
  radiusMiles: number;
  schools: SchoolPlace[];
  tourStops: TourStop[];
  computedRoute: ComputedTourRoute | null;
  sdkRoute: google.maps.routes.Route | null;
  mapStyle: MapStyleId;
  onChangeMapStyle: (style: MapStyleId) => void;
  showTraffic: boolean;
  onToggleTraffic: () => void;
  focusedSchoolId: string | null;
  onFocusSchool: (placeId: string | null) => void;
  onToggleStop: (school: SchoolPlace) => void;
  travelMode: TravelModeOption;
  onChangeTravelMode: (mode: TravelModeOption) => void;
  isNavigating: boolean;
  onStartLiveGpsNavigation: () => void;
  onStopNavigation: () => void;
  activeStep: ComputedRouteStep | null;
  activeStepIndex: number;
  totalSteps: number;
  onPrevStep: () => void;
  onNextStep: () => void;
  onRepeatStep: () => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  userLiveLocation: LatLng | null;
  liveTelemetry: LiveTelemetry | null;
  gpsFollowEnabled: boolean;
  onToggleGpsFollow: () => void;
  onDisableGpsFollow: () => void;
  isRerouting: boolean;
  isComputing: boolean;
  isVisibleOnMobile: boolean;
  showMobileQuickLaunch?: boolean;
}

const DEFAULT_CENTER: LatLng = {lat: 37.4419, lng: -122.143};

const MAP_STYLE_OPTIONS: {id: MapStyleId; label: string}[] = [
  {id: 'daylight', label: 'Daylight'},
  {id: 'night', label: 'Night'},
  {id: 'terrain', label: 'Terrain'},
  {id: 'hybrid', label: 'Hybrid'},
];

function getCategoryPinColor(primaryType?: string, isFocused = false): string {
  if (isFocused) return '#0D9488';
  switch (primaryType) {
    case 'book_store':
      return '#7C3AED';
    case 'library':
      return '#0284C7';
    case 'cafe':
    case 'coffee_shop':
      return '#D97706';
    case 'department_store':
    case 'store':
    case 'electronics_store':
      return '#EA580C';
    default:
      return '#334155';
  }
}

export const SchoolMapCanvas: React.FC<SchoolMapCanvasProps> = ({
  origin,
  radiusMiles,
  schools,
  tourStops,
  computedRoute,
  sdkRoute,
  mapStyle,
  onChangeMapStyle,
  showTraffic,
  onToggleTraffic,
  focusedSchoolId,
  onFocusSchool,
  onToggleStop,
  travelMode,
  onChangeTravelMode,
  isNavigating,
  onStartLiveGpsNavigation,
  onStopNavigation,
  activeStep,
  activeStepIndex,
  totalSteps,
  onPrevStep,
  onNextStep,
  onRepeatStep,
  voiceEnabled,
  onToggleVoice,
  userLiveLocation,
  liveTelemetry,
  gpsFollowEnabled,
  onToggleGpsFollow,
  onDisableGpsFollow,
  isRerouting,
  isComputing,
  isVisibleOnMobile,
  showMobileQuickLaunch = false,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const coreLib = useMapsLibrary('core');

  const circleRef = useRef<google.maps.Circle | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<{
    placeId: string;
    el: google.maps.marker.AdvancedMarkerElement;
  } | null>(null);
  const [mobileStyleOpen, setMobileStyleOpen] = useState(false);

  const stopOrderByPlaceId: Record<string, number> = {};
  const displayedStops = computedRoute?.orderedStops.length
    ? computedRoute.orderedStops
    : tourStops;
  displayedStops.forEach((stop, index) => {
    stopOrderByPlaceId[stop.placeId] = index + 1;
  });

  // Look up focused place across discovered places first, falling back to saved tour stops
  const focusedSchool: SchoolPlace | null = (() => {
    if (!focusedSchoolId) return null;
    const found = schools.find(s => s.placeId === focusedSchoolId);
    if (found) return found;
    const stopMatch = displayedStops.find(s => s.placeId === focusedSchoolId);
    if (stopMatch) {
      return {
        placeId: stopMatch.placeId,
        name: stopMatch.name,
        address: stopMatch.address,
        lat: stopMatch.lat,
        lng: stopMatch.lng,
        rating: stopMatch.rating,
        primaryType: stopMatch.primaryType,
      };
    }
    return null;
  })();

  // Pan to focused place when selected from list
  useEffect(() => {
    if (!map || !focusedSchool || isNavigating) return;
    map.panTo({lat: focusedSchool.lat, lng: focusedSchool.lng});
  }, [map, focusedSchool?.placeId, isNavigating]);

  // Trigger resize/re-fit when mobile map visibility changes
  useEffect(() => {
    if (!map || !isVisibleOnMobile) return;
    const timer = window.setTimeout(() => {
      google.maps.event.trigger(map, 'resize');
      if (isNavigating && gpsFollowEnabled && userLiveLocation) {
        map.panTo(userLiveLocation);
      } else if (sdkRoute?.viewport && !isNavigating) {
        map.fitBounds(sdkRoute.viewport, 48);
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [map, isVisibleOnMobile]);

  // Pause GPS auto-follow if the driver/rider manually drags the map
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('dragstart', () => {
      if (isNavigating && gpsFollowEnabled) {
        onDisableGpsFollow();
      }
    });
    return () => {
      listener.remove();
    };
  }, [map, isNavigating, gpsFollowEnabled, onDisableGpsFollow]);

  // Pan map when origin changes (outside active live GPS follow)
  useEffect(() => {
    if (!map || !origin || (isNavigating && gpsFollowEnabled)) return;
    map.panTo({lat: origin.lat, lng: origin.lng});
    if ((map.getZoom() ?? 12) < 11) {
      map.setZoom(12);
    }
  }, [map, origin?.lat, origin?.lng, isNavigating, gpsFollowEnabled]);

  // Live GPS camera follow during active navigation
  useEffect(() => {
    if (!map || !isNavigating || !gpsFollowEnabled) return;
    const target = userLiveLocation || activeStep?.startLocation;
    if (!target) return;
    map.panTo(target);
    const targetZoom = travelMode === 'BICYCLING' ? 16 : 15;
    if ((map.getZoom() ?? 12) < targetZoom) {
      map.setZoom(targetZoom);
    }
  }, [
    map,
    isNavigating,
    gpsFollowEnabled,
    userLiveLocation?.lat,
    userLiveLocation?.lng,
    activeStep?.id,
    travelMode,
  ]);

  // Draw radius circle around origin
  useEffect(() => {
    if (!map || !mapsLib || !origin) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }

    if (!circleRef.current) {
      circleRef.current = new mapsLib.Circle({
        map,
        center: {lat: origin.lat, lng: origin.lng},
        radius: radiusMiles * 1609.344,
        strokeColor: '#0D9488',
        strokeOpacity: 0.65,
        strokeWeight: 1.5,
        fillColor: '#14B8A6',
        fillOpacity: 0.06,
        clickable: false,
      });
    } else {
      circleRef.current.setCenter({lat: origin.lat, lng: origin.lng});
      circleRef.current.setRadius(radiusMiles * 1609.344);
      circleRef.current.setMap(map);
    }

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
      }
    };
  }, [map, mapsLib, origin?.lat, origin?.lng, radiusMiles]);

  // Manage live TrafficLayer
  useEffect(() => {
    if (!map || !mapsLib) return;
    if (!trafficLayerRef.current) {
      trafficLayerRef.current = new mapsLib.TrafficLayer();
    }
    trafficLayerRef.current.setMap(showTraffic ? map : null);
    return () => {
      trafficLayerRef.current?.setMap(null);
    };
  }, [map, mapsLib, showTraffic]);

  // Render route polylines (live SDK route or stitched/cached polyline points)
  useEffect(() => {
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    if (!map || !mapsLib) return;

    const strokeColor = travelMode === 'BICYCLING' ? '#0284C7' : '#0D9488';

    if (sdkRoute && typeof sdkRoute.createPolylines === 'function') {
      const created = sdkRoute.createPolylines();
      created.forEach(polyline => {
        polyline.setOptions({
          strokeColor,
          strokeOpacity: 0.92,
          strokeWeight: 6,
          zIndex: 20,
        });
        polyline.setMap(map);
      });
      polylinesRef.current = created;

      if (sdkRoute.viewport && !isNavigating) {
        map.fitBounds(sdkRoute.viewport, 52);
      }
    } else if (
      computedRoute &&
      computedRoute.encodedPolylinePoints.length > 1 &&
      coreLib
    ) {
      const polyline = new mapsLib.Polyline({
        path: computedRoute.encodedPolylinePoints,
        geodesic: true,
        strokeColor,
        strokeOpacity: 0.92,
        strokeWeight: 6,
        zIndex: 20,
        map,
      });
      polylinesRef.current = [polyline];

      if (!isNavigating) {
        const bounds = new coreLib.LatLngBounds();
        computedRoute.encodedPolylinePoints.forEach(pt => bounds.extend(pt));
        map.fitBounds(bounds, 52);
      }
    }

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, mapsLib, coreLib, sdkRoute, computedRoute, isNavigating, travelMode]);

  const handleRecenter = () => {
    if (!map) return;
    if (isNavigating) {
      onToggleGpsFollow();
      const target = userLiveLocation || activeStep?.startLocation;
      if (target) {
        map.panTo(target);
        map.setZoom(travelMode === 'BICYCLING' ? 16 : 15);
      }
      return;
    }
    if (sdkRoute?.viewport) {
      map.fitBounds(sdkRoute.viewport, 52);
      return;
    }
    if (computedRoute?.encodedPolylinePoints.length && coreLib) {
      const bounds = new coreLib.LatLngBounds();
      computedRoute.encodedPolylinePoints.forEach(pt => bounds.extend(pt));
      map.fitBounds(bounds, 52);
      return;
    }
    if (origin) {
      map.panTo({lat: origin.lat, lng: origin.lng});
      map.setZoom(12);
    }
  };

  const colorScheme =
    mapStyle === 'night' || mapStyle === 'hybrid' ? 'DARK' : 'LIGHT';
  const mapTypeId =
    mapStyle === 'terrain'
      ? 'terrain'
      : mapStyle === 'hybrid'
        ? 'hybrid'
        : 'roadmap';

  const modeLabel =
    travelMode === 'DRIVING'
      ? 'Car'
      : travelMode === 'BICYCLING'
        ? 'Bike'
        : travelMode === 'WALKING'
          ? 'Walk'
          : 'Transit';

  const liveDistanceLabel =
    liveTelemetry?.distanceToNextTurnMeters != null
      ? metersToTurnCue(liveTelemetry.distanceToNextTurnMeters)
      : activeStep?.distanceText || '';

  return (
    <div className="relative w-full h-full min-h-[260px] bg-slate-200 dark:bg-slate-900">
      <GoogleMap
        defaultCenter={origin ? {lat: origin.lat, lng: origin.lng} : DEFAULT_CENTER}
        defaultZoom={12}
        mapId="DEMO_MAP_ID"
        colorScheme={colorScheme}
        mapTypeId={mapTypeId}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{width: '100%', height: '100%'}}
      >
        {/* Origin Pin */}
        {origin && (
          <AdvancedMarker
            position={{lat: origin.lat, lng: origin.lng}}
            title={`Start: ${origin.name}`}
            zIndex={40}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-white border-2 border-white shadow-md">
              <MapPin className="w-4 h-4" />
            </div>
          </AdvancedMarker>
        )}

        {/* Live Car / Bike GPS Position Puck with Compass Heading */}
        {userLiveLocation && (
          <AdvancedMarker
            position={userLiveLocation}
            title="Your live GPS location"
            zIndex={65}
          >
            <div className="relative flex items-center justify-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 border-white shadow-lg ring-4 ${
                  travelMode === 'BICYCLING'
                    ? 'bg-sky-600 ring-sky-500/30'
                    : 'bg-teal-600 ring-teal-500/30'
                }`}
                style={{
                  transform: `rotate(${liveTelemetry?.heading ?? 0}deg)`,
                }}
              >
                <Navigation2 className="w-4 h-4 text-white fill-white" />
              </div>
            </div>
          </AdvancedMarker>
        )}

        {/* Active Navigation Step Turn Marker */}
        {isNavigating && activeStep?.startLocation && (
          <AdvancedMarker
            position={activeStep.startLocation}
            title={activeStep.instruction}
            zIndex={55}
          >
            <div className="w-7 h-7 rounded-full bg-amber-500 text-white border-2 border-white shadow-md flex items-center justify-center">
              <ManeuverIcon maneuver={activeStep.maneuver} className="w-3.5 h-3.5" />
            </div>
          </AdvancedMarker>
        )}

        {/* Discovered Places (non-tour stops) */}
        {schools
          .filter(s => !stopOrderByPlaceId[s.placeId])
          .map(place => (
            <AdvancedMarker
              key={place.placeId}
              position={{lat: place.lat, lng: place.lng}}
              title={place.name}
              zIndex={focusedSchoolId === place.placeId ? 30 : 10}
              onClick={e => {
                onFocusSchool(place.placeId);
                const el = e.target as google.maps.marker.AdvancedMarkerElement | null;
                setSelectedMarker(el ? {placeId: place.placeId, el} : null);
              }}
            >
              <Pin
                background={getCategoryPinColor(
                  place.primaryType,
                  focusedSchoolId === place.placeId
                )}
                borderColor="#FFFFFF"
                glyphColor="#FFFFFF"
                scale={focusedSchoolId === place.placeId ? 1.15 : 0.95}
              />
            </AdvancedMarker>
          ))}

        {/* Numbered Tour Stop Pins (1, 2, 3...) */}
        {displayedStops.map((stop, idx) => (
          <AdvancedMarker
            key={`stop-${stop.placeId}`}
            position={{lat: stop.lat, lng: stop.lng}}
            title={`Stop ${idx + 1}: ${stop.name}`}
            zIndex={50}
            onClick={e => {
              onFocusSchool(stop.placeId);
              const el = e.target as google.maps.marker.AdvancedMarkerElement | null;
              setSelectedMarker(el ? {placeId: stop.placeId, el} : null);
            }}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-600 text-white font-mono text-xs font-bold border-2 border-white shadow-lg">
              {idx + 1}
            </div>
          </AdvancedMarker>
        ))}

        {/* Place InfoWindow */}
        {focusedSchool && (() => {
          const matchedAnchor =
            selectedMarker?.placeId === focusedSchool.placeId
              ? selectedMarker.el
              : null;
          return (
            <InfoWindow
              anchor={matchedAnchor}
              position={
                matchedAnchor
                  ? undefined
                  : {lat: focusedSchool.lat, lng: focusedSchool.lng}
              }
              onCloseClick={() => {
                onFocusSchool(null);
                setSelectedMarker(null);
              }}
            >
              <div className="max-w-[250px] p-1 text-slate-900">
                <div className="text-[11px] font-medium text-teal-700">
                  {formatPlaceTypeLabel(
                    focusedSchool.primaryType,
                    focusedSchool.primaryTypeDisplayName
                  )}
                </div>
                <div className="font-semibold text-sm leading-snug mt-0.5">
                  {focusedSchool.name}
                </div>
                <div className="mt-1 text-xs text-slate-600 leading-snug">
                  {focusedSchool.address}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  {typeof focusedSchool.rating === 'number' && (
                    <span>
                      ★ {focusedSchool.rating.toFixed(1)} (
                      {focusedSchool.userRatingCount ?? 0})
                    </span>
                  )}
                  {typeof focusedSchool.distanceMeters === 'number' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        {metersToMilesText(focusedSchool.distanceMeters)}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleStop(focusedSchool)}
                    className={`inline-flex items-center gap-1 px-3 py-2 rounded-md text-xs font-medium transition-colors min-h-[38px] ${
                      stopOrderByPlaceId[focusedSchool.placeId]
                        ? 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                        : 'bg-teal-600 text-white hover:bg-teal-700'
                    }`}
                  >
                    {stopOrderByPlaceId[focusedSchool.placeId] ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Stop #{stopOrderByPlaceId[focusedSchool.placeId]}
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        Add Stop
                      </>
                    )}
                  </button>
                  {focusedSchool.googleMapsURI && (
                    <a
                      href={focusedSchool.googleMapsURI}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline px-2 py-2"
                    >
                      Maps
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </InfoWindow>
          );
        })()}
      </GoogleMap>

      {/* Top-Right Responsive Map Style, Traffic & GPS Follow Toolbar */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 sm:gap-2 max-w-[calc(100%-1.5rem)] justify-end">
        {/* Desktop Map Style Segmented Control */}
        <div className="hidden sm:flex items-center gap-0.5 p-1 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur">
          {MAP_STYLE_OPTIONS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeMapStyle(item.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mapStyle === item.id
                  ? 'bg-slate-900 text-white dark:bg-teal-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Mobile Compact Map Style Picker */}
        <div className="relative sm:hidden">
          <button
            type="button"
            onClick={() => setMobileStyleOpen(v => !v)}
            className="inline-flex items-center justify-center gap-1 min-h-[40px] px-2.5 rounded-lg bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur text-xs font-medium whitespace-nowrap"
          >
            <Palette className="w-3.5 h-3.5 text-teal-600" />
            <span>{MAP_STYLE_OPTIONS.find(s => s.id === mapStyle)?.label}</span>
          </button>
          {mobileStyleOpen && (
            <div className="absolute right-0 mt-1.5 w-36 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-1 z-30">
              {MAP_STYLE_OPTIONS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onChangeMapStyle(item.id);
                    setMobileStyleOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium min-h-[40px] flex items-center justify-between ${
                    mapStyle === item.id
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{item.label}</span>
                  {mapStyle === item.id && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleTraffic}
          className={`inline-flex items-center justify-center gap-1 min-h-[40px] sm:min-h-0 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border shadow-sm transition-colors whitespace-nowrap shrink-0 backdrop-blur ${
            showTraffic
              ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Traffic</span>
        </button>

        <button
          type="button"
          onClick={handleRecenter}
          title={isNavigating ? 'Follow live GPS' : 'Recenter map'}
          aria-label={isNavigating ? 'Follow live GPS' : 'Recenter map'}
          className={`inline-flex items-center justify-center min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 sm:w-8 sm:h-8 rounded-lg border shadow-sm transition-colors backdrop-blur ${
            isNavigating && gpsFollowEnabled
              ? 'bg-sky-600 text-white border-sky-600'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* Top-Left Live Car / Bike Quick Switcher during active preview or navigation */}
      {tourStops.length > 0 && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1 p-1 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={() => onChangeTravelMode('DRIVING')}
            className={`inline-flex items-center gap-1 min-h-[34px] sm:min-h-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              travelMode === 'DRIVING'
                ? 'bg-teal-600 text-white'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>Car</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTravelMode('BICYCLING')}
            className={`inline-flex items-center gap-1 min-h-[34px] sm:min-h-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              travelMode === 'BICYCLING'
                ? 'bg-sky-600 text-white'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>Bike</span>
          </button>
        </div>
      )}

      {/* Optional Mobile Non-Navigating Quick Live Route Launch Card */}
      {showMobileQuickLaunch && !isNavigating && tourStops.length > 0 && (
        <div className="md:hidden absolute bottom-3 left-3 right-3 z-20 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-lg backdrop-blur p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {displayedStops.length} stop{displayedStops.length > 1 ? 's' : ''} ·{' '}
                {modeLabel} route
              </div>
              {isComputing ? (
                <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                  Calculating...
                </div>
              ) : computedRoute ? (
                <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {millisToDurationText(computedRoute.totalDurationMillis)} ·{' '}
                  {metersToMilesText(computedRoute.totalDistanceMeters)}
                </div>
              ) : (
                <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                  Ready to navigate
                </div>
              )}
              {computedRoute?.routeFallbackNote && (
                <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400 truncate">
                  {computedRoute.routeFallbackNote}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onStartLiveGpsNavigation}
              disabled={!computedRoute || computedRoute.legs.length === 0}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm whitespace-nowrap shrink-0"
            >
              <Navigation className="w-4 h-4" />
              Go Live
            </button>
          </div>
        </div>
      )}

      {/* Active Live Car/Bike Turn-by-Turn Navigation HUD */}
      {isNavigating && activeStep && (
        <div className="absolute bottom-3 left-3 right-3 md:bottom-4 md:left-4 md:right-auto md:w-[400px] z-20 rounded-2xl bg-slate-900/95 text-white border border-slate-700/90 shadow-2xl backdrop-blur p-3.5 md:p-4">
          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800 text-[11px] font-mono tabular-nums text-slate-300">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1 text-teal-300 font-semibold">
                {travelMode === 'BICYCLING' ? (
                  <Bike className="w-3.5 h-3.5" />
                ) : (
                  <Car className="w-3.5 h-3.5" />
                )}
                {modeLabel} Live
              </span>
              <span aria-hidden="true">·</span>
              <span>{mpsToMphText(liveTelemetry?.speedMps ?? null)}</span>
              {computedRoute && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {millisToDurationText(computedRoute.totalDurationMillis)} left
                  </span>
                </>
              )}
            </div>

            {isRerouting && (
              <span className="inline-flex items-center gap-1 text-amber-300 shrink-0">
                <Loader2 className="w-3 h-3 animate-spin" />
                Rerouting
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  travelMode === 'BICYCLING' ? 'bg-sky-600' : 'bg-teal-600'
                }`}
              >
                <ManeuverIcon
                  maneuver={activeStep.maneuver}
                  className="w-6 h-6 text-white"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-teal-300 font-mono tabular-nums">
                  <span>
                    Step {activeStepIndex + 1}/{totalSteps}
                  </span>
                  {liveDistanceLabel && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-white">
                        {liveDistanceLabel}
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-1 text-sm md:text-base font-semibold leading-snug text-white">
                  {activeStep.instruction}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onStopNavigation}
              aria-label="Exit navigation"
              className="text-slate-400 hover:text-white min-w-[44px] min-h-[44px] -mt-1 -mr-1 flex items-center justify-center rounded-lg shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!gpsFollowEnabled && (
            <button
              type="button"
              onClick={onToggleGpsFollow}
              className="mt-2.5 w-full min-h-[40px] rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-200 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-sky-600/30"
            >
              <Crosshair className="w-3.5 h-3.5" />
              Re-center on live GPS
            </button>
          )}

          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleVoice}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
              >
                {voiceEnabled ? (
                  <>
                    <Volume2 className="w-4 h-4 text-teal-400" />
                    <span>Voice</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-4 h-4 text-slate-400" />
                    <span>Muted</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onRepeatStep}
                className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
              >
                Repeat
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onPrevStep}
                disabled={activeStepIndex <= 0}
                className="inline-flex items-center justify-center gap-1 min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <button
                type="button"
                onClick={onNextStep}
                disabled={activeStepIndex >= totalSteps - 1}
                className="inline-flex items-center justify-center gap-1 min-h-[44px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-xs font-medium text-white transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
