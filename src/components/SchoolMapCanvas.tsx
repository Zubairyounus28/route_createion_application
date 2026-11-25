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
  ChevronLeft,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Layers,
  MapPin,
  Plus,
  Check,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {metersToMilesText} from '../lib/formatters';
import type {
  ComputedRouteStep,
  ComputedTourRoute,
  LatLng,
  MapStyleId,
  OriginPoint,
  SchoolPlace,
  TourStop,
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
  isNavigating: boolean;
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
}

const DEFAULT_CENTER: LatLng = {lat: 37.4419, lng: -122.143};

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
  isNavigating,
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

  // Build quick lookup Record (never use `new Map` in files that deal with Google Map!)
  const stopOrderByPlaceId: Record<string, number> = {};
  const displayedStops = computedRoute?.orderedStops.length
    ? computedRoute.orderedStops
    : tourStops;
  displayedStops.forEach((stop, index) => {
    stopOrderByPlaceId[stop.placeId] = index + 1;
  });

  const focusedSchool =
    schools.find(s => s.placeId === focusedSchoolId) || null;

  // Pan map when origin changes
  useEffect(() => {
    if (!map || !origin) return;
    map.panTo({lat: origin.lat, lng: origin.lng});
    if ((map.getZoom() ?? 12) < 11) {
      map.setZoom(12);
    }
  }, [map, origin?.lat, origin?.lng]);

  // Pan map to active turn step when navigating
  useEffect(() => {
    if (!map || !isNavigating || !activeStep?.startLocation) return;
    map.panTo(activeStep.startLocation);
    if ((map.getZoom() ?? 12) < 15) {
      map.setZoom(15);
    }
  }, [map, isNavigating, activeStep?.id]);

  // Draw 5-mile (or selected) radius circle around origin
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

  // Render route polylines (live SDK route or offline cached points)
  useEffect(() => {
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    if (!map || !mapsLib) return;

    if (sdkRoute && typeof sdkRoute.createPolylines === 'function') {
      const created = sdkRoute.createPolylines();
      created.forEach(polyline => {
        polyline.setOptions({
          strokeColor: '#0D9488',
          strokeOpacity: 0.9,
          strokeWeight: 6,
          zIndex: 20,
        });
        polyline.setMap(map);
      });
      polylinesRef.current = created;

      if (sdkRoute.viewport && !isNavigating) {
        map.fitBounds(sdkRoute.viewport, 64);
      }
    } else if (
      computedRoute &&
      computedRoute.encodedPolylinePoints.length > 1 &&
      coreLib
    ) {
      const polyline = new mapsLib.Polyline({
        path: computedRoute.encodedPolylinePoints,
        geodesic: true,
        strokeColor: '#0D9488',
        strokeOpacity: 0.9,
        strokeWeight: 6,
        zIndex: 20,
        map,
      });
      polylinesRef.current = [polyline];

      if (!isNavigating) {
        const bounds = new coreLib.LatLngBounds();
        computedRoute.encodedPolylinePoints.forEach(pt => bounds.extend(pt));
        map.fitBounds(bounds, 64);
      }
    }

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, mapsLib, coreLib, sdkRoute, computedRoute, isNavigating]);

  const handleRecenter = () => {
    if (!map) return;
    if (sdkRoute?.viewport) {
      map.fitBounds(sdkRoute.viewport, 64);
      return;
    }
    if (computedRoute?.encodedPolylinePoints.length && coreLib) {
      const bounds = new coreLib.LatLngBounds();
      computedRoute.encodedPolylinePoints.forEach(pt => bounds.extend(pt));
      map.fitBounds(bounds, 64);
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

  return (
    <div className="relative w-full h-full min-h-[400px] bg-slate-200 dark:bg-slate-900">
      <GoogleMap
        defaultCenter={origin ? {lat: origin.lat, lng: origin.lng} : DEFAULT_CENTER}
        defaultZoom={12}
        mapId="DEMO_MAP_ID"
        colorScheme={colorScheme}
        mapTypeId={mapTypeId}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={true}
        fullscreenControl={false}
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

        {/* Live GPS User Position during navigation */}
        {isNavigating && userLiveLocation && (
          <AdvancedMarker
            position={userLiveLocation}
            title="Your current location"
            zIndex={60}
          >
            <div className="w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow-lg ring-4 ring-sky-500/30" />
          </AdvancedMarker>
        )}

        {/* Active Navigation Step Turn Marker */}
        {isNavigating && activeStep?.startLocation && (
          <AdvancedMarker
            position={activeStep.startLocation}
            title={activeStep.instruction}
            zIndex={55}
          >
            <div className="w-6 h-6 rounded-full bg-amber-500 text-white border-2 border-white shadow-md flex items-center justify-center">
              <ManeuverIcon maneuver={activeStep.maneuver} className="w-3.5 h-3.5" />
            </div>
          </AdvancedMarker>
        )}

        {/* Discovered Schools (non-tour stops) */}
        {schools
          .filter(s => !stopOrderByPlaceId[s.placeId])
          .map(school => (
            <AdvancedMarker
              key={school.placeId}
              position={{lat: school.lat, lng: school.lng}}
              title={school.name}
              zIndex={10}
              onClick={e => {
                onFocusSchool(school.placeId);
                const el = e.target as google.maps.marker.AdvancedMarkerElement | null;
                setSelectedMarker(el ? {placeId: school.placeId, el} : null);
              }}
            >
              <Pin
                background={
                  focusedSchoolId === school.placeId ? '#0284C7' : '#334155'
                }
                borderColor="#FFFFFF"
                glyphColor="#FFFFFF"
                scale={focusedSchoolId === school.placeId ? 1.15 : 0.95}
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

        {/* School InfoWindow */}
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
            <div className="max-w-[260px] p-1 text-slate-900">
              <div className="font-semibold text-sm leading-snug">
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
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
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
                      Add to Tour
                    </>
                  )}
                </button>
                {focusedSchool.googleMapsURI && (
                  <a
                    href={focusedSchool.googleMapsURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
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

      {/* Top-Right Custom Map Style & Live Traffic Toolbar */}
      <div className="absolute top-3 right-3 z-20 flex flex-wrap items-center gap-2 max-w-[calc(100%-1.5rem)] justify-end">
        <div className="flex items-center gap-0.5 p-1 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur">
          {(
            [
              {id: 'daylight', label: 'Daylight'},
              {id: 'night', label: 'Night'},
              {id: 'terrain', label: 'Terrain'},
              {id: 'hybrid', label: 'Hybrid'},
            ] as {id: MapStyleId; label: string}[]
          ).map(item => (
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

        <button
          type="button"
          onClick={onToggleTraffic}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border shadow-sm transition-colors whitespace-nowrap shrink-0 ${
            showTraffic
              ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Live Traffic
        </button>

        <button
          type="button"
          onClick={handleRecenter}
          title="Recenter map"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* Active Turn-by-Turn Navigation HUD */}
      {isNavigating && activeStep && (
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:max-w-md z-20 rounded-xl bg-slate-900 text-white border border-slate-700 shadow-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
                <ManeuverIcon
                  maneuver={activeStep.maneuver}
                  className="w-5 h-5 text-white"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-teal-300 font-mono tabular-nums">
                  <span>
                    Step {activeStepIndex + 1} of {totalSteps}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeStep.distanceText}</span>
                </div>
                <p className="mt-1 text-sm font-semibold leading-snug text-white">
                  {activeStep.instruction}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onStopNavigation}
              aria-label="Exit navigation"
              className="text-slate-400 hover:text-white p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleVoice}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
              >
                {voiceEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                    Voice On
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    Muted
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onRepeatStep}
                className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
              >
                Repeat
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onPrevStep}
                disabled={activeStepIndex <= 0}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-white transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <button
                type="button"
                onClick={onNextStep}
                disabled={activeStepIndex >= totalSteps - 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-xs font-medium text-white transition-colors"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
