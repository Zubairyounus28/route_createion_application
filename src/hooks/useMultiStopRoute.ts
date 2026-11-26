import {useCallback, useEffect, useState} from 'react';
import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {stripHtmlToText} from '../lib/formatters';
import {checkAndDispatchQuotaError} from '../lib/quota';
import type {
  ComputedRouteLeg,
  ComputedRouteStep,
  ComputedTourRoute,
  LatLng,
  OriginPoint,
  RouteObjective,
  TourStop,
  TravelModeOption,
} from '../types/navigation';

interface UseMultiStopRouteParams {
  origin: OriginPoint | null;
  stops: TourStop[];
  travelMode: TravelModeOption;
  routeObjective: RouteObjective;
  optimizeOrder: boolean;
  roundTrip: boolean;
  isOnline: boolean;
}

function toLatLng(point: google.maps.LatLng | google.maps.LatLngAltitude | google.maps.LatLngLiteral): LatLng {
  const lat =
    typeof (point as google.maps.LatLng).lat === 'function'
      ? (point as google.maps.LatLng).lat()
      : Number((point as google.maps.LatLngLiteral).lat);
  const lng =
    typeof (point as google.maps.LatLng).lng === 'function'
      ? (point as google.maps.LatLng).lng()
      : Number((point as google.maps.LatLngLiteral).lng);
  return {lat, lng};
}

export function useMultiStopRoute({
  origin,
  stops,
  travelMode,
  routeObjective,
  optimizeOrder,
  roundTrip,
  isOnline,
}: UseMultiStopRouteParams) {
  const routesLib = useMapsLibrary('routes');
  const coreLib = useMapsLibrary('core');
  const [computedRoute, setComputedRoute] = useState<ComputedTourRoute | null>(
    null
  );
  const [sdkRoute, setSdkRoute] = useState<google.maps.routes.Route | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const recompute = useCallback(() => {
    setRefreshTick(t => t + 1);
  }, []);

  useEffect(() => {
    if (!isOnline) {
      return;
    }
    if (!routesLib || !origin || stops.length === 0) {
      setComputedRoute(null);
      setSdkRoute(null);
      setRouteError(null);
      return;
    }

    let cancelled = false;
    setIsComputing(true);
    setRouteError(null);

    const run = async () => {
      try {
        const sdkTravelMode =
          routesLib.TravelMode[
            travelMode as keyof typeof routesLib.TravelMode
          ] || routesLib.TravelMode.DRIVING;

        const baseFields = [
          'path',
          'distanceMeters',
          'durationMillis',
          'staticDurationMillis',
          'viewport',
          'legs',
          'localizedValues',
          'optimizedIntermediateWaypointIndices',
          'routeLabels',
        ];

        const originLatLng = {lat: origin.lat, lng: origin.lng};
        let orderedStops = [...stops];

        const canOptimize =
          optimizeOrder &&
          travelMode !== 'TRANSIT' &&
          (roundTrip ? stops.length >= 2 : stops.length >= 3);

        // Build destination & intermediates
        const buildWaypoints = (currentStops: TourStop[]) => {
          if (roundTrip) {
            return {
              destination: originLatLng,
              intermediates: currentStops.map(s => ({
                location: {lat: s.lat, lng: s.lng},
              })),
            };
          }
          const last = currentStops[currentStops.length - 1];
          return {
            destination: {lat: last.lat, lng: last.lng},
            intermediates: currentStops.slice(0, -1).map(s => ({
              location: {lat: s.lat, lng: s.lng},
            })),
          };
        };

        let {destination, intermediates} = buildWaypoints(orderedStops);

        const wantsShortest =
          routeObjective === 'SHORTEST_DISTANCE' && travelMode === 'DRIVING';

        // Step 1: Optimize waypoint order first if requested (SHORTER_DISTANCE cannot combine with optimizeWaypointOrder)
        let primaryRoute: google.maps.routes.Route | null = null;
        let optimizedIndices: number[] = [];
        let routeFallbackNote: string | undefined;

        const executeComputeRoutes = async (
          modeToUse: google.maps.TravelMode,
          withShortestRef = false
        ) => {
          const req: google.maps.routes.ComputeRoutesRequest = {
            origin: originLatLng,
            destination,
            intermediates: intermediates.length > 0 ? intermediates : undefined,
            travelMode: modeToUse,
            fields: baseFields,
            units: coreLib?.UnitSystem.IMPERIAL,
            optimizeWaypointOrder: withShortestRef ? false : canOptimize,
            internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
          };

          if (modeToUse === routesLib.TravelMode.DRIVING) {
            req.routingPreference = routesLib.RoutingPreference.TRAFFIC_AWARE;
          }
          if (withShortestRef) {
            req.requestedReferenceRoutes = [
              routesLib.ReferenceRoute.SHORTER_DISTANCE,
            ];
          }
          return routesLib.Route.computeRoutes(req);
        };

        if (canOptimize || !wantsShortest) {
          let res: Awaited<ReturnType<typeof executeComputeRoutes>> | null = null;
          try {
            res = await executeComputeRoutes(sdkTravelMode, false);
          } catch (err) {
            if (travelMode === 'BICYCLING') {
              res = await executeComputeRoutes(routesLib.TravelMode.DRIVING, false);
              routeFallbackNote =
                'Dedicated bike lanes unavailable here — using road bike route.';
            } else {
              throw err;
            }
          }

          if ((!res?.routes || res.routes.length === 0) && travelMode === 'BICYCLING') {
            res = await executeComputeRoutes(routesLib.TravelMode.DRIVING, false);
            routeFallbackNote =
              'Dedicated bike lanes unavailable here — using road bike route.';
          }

          const chosenRoute = res?.routes?.[0] ?? null;
          if (!chosenRoute) {
            throw new Error('No route found between the selected school stops.');
          }
          primaryRoute = chosenRoute;

          if (
            canOptimize &&
            Array.isArray(chosenRoute.optimizedIntermediateWaypointIndices) &&
            chosenRoute.optimizedIntermediateWaypointIndices.length > 0
          ) {
            optimizedIndices = [
              ...chosenRoute.optimizedIntermediateWaypointIndices,
            ];
            if (roundTrip) {
              orderedStops = optimizedIndices.map(idx => stops[idx]);
            } else {
              const reorderedPrefix = optimizedIndices.map(idx => stops[idx]);
              orderedStops = [...reorderedPrefix, stops[stops.length - 1]];
            }
          }
        }

        // Step 2: If Shortest Distance is requested (DRIVING), request SHORTER_DISTANCE without optimizeWaypointOrder
        if (wantsShortest) {
          const nextWaypoints = buildWaypoints(orderedStops);
          destination = nextWaypoints.destination;
          intermediates = nextWaypoints.intermediates;

          // Note: SHORTER_DISTANCE is incompatible with intermediate waypoints in some modes; handle gracefully
          if (intermediates.length === 0) {
            const shortReq: google.maps.routes.ComputeRoutesRequest = {
              origin: originLatLng,
              destination,
              travelMode: sdkTravelMode,
              fields: baseFields,
              units: coreLib?.UnitSystem.IMPERIAL,
              routingPreference: routesLib.RoutingPreference.TRAFFIC_AWARE,
              requestedReferenceRoutes: [
                routesLib.ReferenceRoute.SHORTER_DISTANCE,
              ],
              internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
            };
            const shortRes = await routesLib.Route.computeRoutes(shortReq);
            if (shortRes.routes && shortRes.routes.length > 0) {
              const shorter =
                shortRes.routes.find(r =>
                  r.routeLabels?.includes(
                    'SHORTER_DISTANCE' as google.maps.routes.RouteLabel
                  )
                ) || shortRes.routes[0];
              primaryRoute = shorter;
            }
          } else if (!primaryRoute) {
            const fallbackReq: google.maps.routes.ComputeRoutesRequest = {
              origin: originLatLng,
              destination,
              intermediates,
              travelMode: sdkTravelMode,
              fields: baseFields,
              units: coreLib?.UnitSystem.IMPERIAL,
              routingPreference: routesLib.RoutingPreference.TRAFFIC_UNAWARE,
              internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
            };
            const fallbackRes = await routesLib.Route.computeRoutes(fallbackReq);
            if (fallbackRes.routes && fallbackRes.routes.length > 0) {
              primaryRoute = fallbackRes.routes[0];
            }
          }
        }

        if (!primaryRoute) {
          throw new Error('Could not compute a route for the selected stops.');
        }

        const totalDistanceMeters = primaryRoute.distanceMeters ?? 0;
        const totalDurationMillis = primaryRoute.durationMillis ?? 0;
        const staticDurationMillis =
          primaryRoute.staticDurationMillis ?? totalDurationMillis;
        const trafficDelayMinutes = Math.max(
          0,
          Math.round((totalDurationMillis - staticDurationMillis) / 60000)
        );

        const rawLegs = primaryRoute.legs ?? [];
        const legs: ComputedRouteLeg[] = rawLegs.map((leg, legIndex) => {
          const fromLabel =
            legIndex === 0
              ? origin.name
              : orderedStops[legIndex - 1]?.name || `Stop ${legIndex}`;
          const toLabel =
            roundTrip && legIndex === orderedStops.length
              ? origin.name
              : orderedStops[legIndex]?.name || `Destination`;

          const steps: ComputedRouteStep[] = (leg.steps ?? []).map(
            (step, stepIndex) => {
              const startLoc = step.startLocation
                ? toLatLng(step.startLocation)
                : null;
              const endLoc = step.endLocation
                ? toLatLng(step.endLocation)
                : null;
              const stepDist = step.distanceMeters ?? 0;
              const stepStaticMs = step.staticDurationMillis ?? 0;

              return {
                id: `leg-${legIndex}-step-${stepIndex}`,
                legIndex,
                stepIndex,
                instruction:
                  stripHtmlToText(step.instructions ?? undefined) ||
                  `Proceed toward ${toLabel}`,
                maneuver: String(step.maneuver || 'STRAIGHT'),
                distanceMeters: stepDist,
                distanceText:
                  step.localizedValues?.distance ||
                  `${(stepDist / 1609.344).toFixed(2)} mi`,
                durationText:
                  step.localizedValues?.staticDuration ||
                  `${Math.max(1, Math.round(stepStaticMs / 60000))} min`,
                startLocation: startLoc,
                endLocation: endLoc,
              };
            }
          );

          return {
            legIndex,
            fromLabel,
            toLabel,
            distanceMeters: leg.distanceMeters ?? 0,
            distanceText: leg.localizedValues?.distance || '',
            durationMillis: leg.durationMillis ?? 0,
            durationText: leg.localizedValues?.duration || '',
            staticDurationMillis:
              leg.staticDurationMillis ?? leg.durationMillis ?? 0,
            steps,
          };
        });

        const pathPoints = (primaryRoute.path ?? []).map(p => toLatLng(p));

        if (!cancelled) {
          setSdkRoute(primaryRoute);
          setComputedRoute({
            totalDistanceMeters,
            totalDurationMillis,
            staticDurationMillis,
            trafficDelayMinutes,
            routeLabels: (primaryRoute.routeLabels ?? []).map(String),
            optimizedOrderIndices: optimizedIndices,
            orderedStops,
            legs,
            encodedPolylinePoints: pathPoints,
            computedAt: Date.now(),
            routeFallbackNote,
          });
        }
      } catch (err) {
        const hitQuota = checkAndDispatchQuotaError(err);
        if (!cancelled) {
          setSdkRoute(null);
          setRouteError(
            hitQuota
              ? 'Google Maps Platform quota reached while computing route.'
              : err instanceof Error
                ? err.message
                : 'Failed to calculate route.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsComputing(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    routesLib,
    coreLib,
    origin?.lat,
    origin?.lng,
    origin?.name,
    stops,
    travelMode,
    routeObjective,
    optimizeOrder,
    roundTrip,
    isOnline,
    refreshTick,
  ]);

  return {
    computedRoute,
    setComputedRoute,
    sdkRoute,
    isComputing,
    routeError,
    recompute,
  };
}
