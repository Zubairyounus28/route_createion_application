import {useCallback, useEffect, useMemo, useState} from 'react';
import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {
  haversineMeters,
  metersToMilesText,
  millisToDurationText,
  stripHtmlToText,
} from '../lib/formatters';
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

const DISTANT_STOP_THRESHOLD_METERS = 250_000; // ~155 miles

function toLatLng(
  point:
    | google.maps.LatLng
    | google.maps.LatLngAltitude
    | google.maps.LatLngLiteral
): LatLng {
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

function nearestNeighborSort(origin: LatLng, stops: TourStop[]): TourStop[] {
  if (stops.length <= 1) return [...stops];
  const remaining = [...stops];
  const ordered: TourStop[] = [];
  let current: LatLng = origin;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = haversineMeters(current, remaining[0]);
    for (let i = 1; i < remaining.length; i++) {
      const d = haversineMeters(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [picked] = remaining.splice(bestIdx, 1);
    ordered.push(picked);
    current = {lat: picked.lat, lng: picked.lng};
  }
  return ordered;
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
  const [sdkRoute, setSdkRoute] = useState<google.maps.routes.Route | null>(
    null
  );
  const [isComputing, setIsComputing] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const recompute = useCallback(() => {
    setRefreshTick(t => t + 1);
  }, []);

  const distantStops = useMemo(() => {
    if (!origin) return [];
    return stops.filter(
      s => haversineMeters(origin, s) > DISTANT_STOP_THRESHOLD_METERS
    );
  }, [origin, stops]);

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

    // Detect far-away stops from a previous city/continent before wasting route calls
    const extremeOutOfArea = stops.filter(
      s => haversineMeters(origin, s) > 800_000
    );
    if (extremeOutOfArea.length > 0) {
      setSdkRoute(null);
      setComputedRoute(null);
      setIsComputing(false);
      setRouteError(
        `${extremeOutOfArea.length} stop${extremeOutOfArea.length > 1 ? 's' : ''} (${extremeOutOfArea[0].name}) ${extremeOutOfArea.length > 1 ? 'are' : 'is'} outside this region (>500 mi from ${origin.name}). Clear distant stops to compute a local route.`
      );
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

        const standardFields = [
          'path',
          'distanceMeters',
          'durationMillis',
          'staticDurationMillis',
          'viewport',
          'legs',
          'localizedValues',
          'routeLabels',
        ];
        const optimizedFields = [
          ...standardFields,
          'optimizedIntermediateWaypointIndices',
        ];

        const originLatLng: LatLng = {lat: origin.lat, lng: origin.lng};
        let orderedStops = [...stops];

        const canOptimize =
          optimizeOrder &&
          travelMode !== 'TRANSIT' &&
          (roundTrip ? stops.length >= 2 : stops.length >= 3);

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

        const safeCompute = async (
          req: google.maps.routes.ComputeRoutesRequest
        ): Promise<google.maps.routes.Route | null> => {
          try {
            const res = await routesLib.Route.computeRoutes(req);
            if (res?.routes && res.routes.length > 0) {
              return res.routes[0];
            }
            return null;
          } catch (err) {
            if (checkAndDispatchQuotaError(err)) {
              throw err;
            }
            console.warn('Route.computeRoutes attempt failed:', err);
            return null;
          }
        };

        const runSingleRequest = async ({
          from = originLatLng,
          to,
          vias = [],
          mode,
          optimize = false,
          shortestRef = false,
          trafficPreference,
        }: {
          from?: LatLng;
          to: LatLng;
          vias?: google.maps.routes.Waypoint[];
          mode: google.maps.TravelMode;
          optimize?: boolean;
          shortestRef?: boolean;
          trafficPreference?: google.maps.routes.RoutingPreference;
        }): Promise<google.maps.routes.Route | null> => {
          const useOptimize =
            optimize &&
            !shortestRef &&
            vias.length > 0 &&
            mode !== routesLib.TravelMode.TRANSIT;

          const req: google.maps.routes.ComputeRoutesRequest = {
            origin: from,
            destination: to,
            intermediates: vias.length > 0 ? vias : undefined,
            travelMode: mode,
            fields: useOptimize ? optimizedFields : standardFields,
            units: coreLib?.UnitSystem.IMPERIAL,
            optimizeWaypointOrder: useOptimize ? true : undefined,
            internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
          };

          if (mode === routesLib.TravelMode.DRIVING) {
            req.routingPreference =
              trafficPreference || routesLib.RoutingPreference.TRAFFIC_AWARE;
          } else if (mode === routesLib.TravelMode.TRANSIT) {
            req.departureTime = new Date();
          }

          if (shortestRef && vias.length === 0 && mode === routesLib.TravelMode.DRIVING) {
            req.requestedReferenceRoutes = [
              routesLib.ReferenceRoute.SHORTER_DISTANCE,
            ];
            try {
              const res = await routesLib.Route.computeRoutes(req);
              if (res?.routes && res.routes.length > 0) {
                return (
                  res.routes.find(r =>
                    r.routeLabels?.includes(
                      'SHORTER_DISTANCE' as google.maps.routes.RouteLabel
                    )
                  ) || res.routes[0]
                );
              }
              return null;
            } catch (err) {
              if (checkAndDispatchQuotaError(err)) throw err;
              console.warn('SHORTER_DISTANCE attempt failed:', err);
              return null;
            }
          }

          return safeCompute(req);
        };

        const wantsShortest =
          routeObjective === 'SHORTEST_DISTANCE' && travelMode === 'DRIVING';
        const isMultiStopTransit =
          travelMode === 'TRANSIT' && (stops.length > 1 || roundTrip);

        let primaryRoute: google.maps.routes.Route | null = null;
        let optimizedIndices: number[] = [];
        let routeFallbackNote: string | undefined;

        // Multi-stop routes (except TRANSIT with >1 legs, since Transit API does not support intermediates)
        if (!isMultiStopTransit) {
          const {destination, intermediates} = buildWaypoints(orderedStops);

          if (canOptimize) {
            primaryRoute = await runSingleRequest({
              to: destination,
              vias: intermediates,
              mode: sdkTravelMode,
              optimize: true,
            });

            if (
              primaryRoute &&
              Array.isArray(primaryRoute.optimizedIntermediateWaypointIndices) &&
              primaryRoute.optimizedIntermediateWaypointIndices.length > 0
            ) {
              optimizedIndices = [
                ...primaryRoute.optimizedIntermediateWaypointIndices,
              ];
              if (roundTrip) {
                orderedStops = optimizedIndices.map(idx => stops[idx]);
              } else {
                const reorderedPrefix = optimizedIndices.map(
                  idx => stops[idx]
                );
                orderedStops = [...reorderedPrefix, stops[stops.length - 1]];
              }
            } else if (!primaryRoute) {
              // Retry same mode without waypoint optimization
              if (optimizeOrder) {
                orderedStops = nearestNeighborSort(originLatLng, stops);
              }
              const nextWp = buildWaypoints(orderedStops);
              primaryRoute = await runSingleRequest({
                to: nextWp.destination,
                vias: nextWp.intermediates,
                mode: sdkTravelMode,
                optimize: false,
              });
            }
          } else {
            // 1-2 stops (or optimization disabled)
            if (wantsShortest && intermediates.length === 0) {
              primaryRoute = await runSingleRequest({
                to: destination,
                mode: sdkTravelMode,
                shortestRef: true,
                trafficPreference: routesLib.RoutingPreference.TRAFFIC_AWARE,
              });
            }
            if (!primaryRoute) {
              primaryRoute = await runSingleRequest({
                to: destination,
                vias: intermediates,
                mode: sdkTravelMode,
                optimize: false,
                trafficPreference:
                  wantsShortest && sdkTravelMode === routesLib.TravelMode.DRIVING
                    ? routesLib.RoutingPreference.TRAFFIC_UNAWARE
                    : routesLib.RoutingPreference.TRAFFIC_AWARE,
              });
            }
          }

          // Re-run Shortest Distance on single-destination leg after stop optimization if applicable
          if (wantsShortest && primaryRoute) {
            const nextWp = buildWaypoints(orderedStops);
            if (nextWp.intermediates.length === 0) {
              const shorter = await runSingleRequest({
                to: nextWp.destination,
                mode: sdkTravelMode,
                shortestRef: true,
                trafficPreference: routesLib.RoutingPreference.TRAFFIC_AWARE,
              });
              if (shorter) {
                primaryRoute = shorter;
              }
            }
          }

          // Mode-level fallbacks if primary mode returned null
          if (!primaryRoute) {
            const wp = buildWaypoints(orderedStops);
            if (travelMode === 'DRIVING') {
              primaryRoute = await runSingleRequest({
                to: wp.destination,
                vias: wp.intermediates,
                mode: routesLib.TravelMode.DRIVING,
                optimize: false,
                trafficPreference: routesLib.RoutingPreference.TRAFFIC_UNAWARE,
              });
            } else if (travelMode === 'BICYCLING') {
              primaryRoute = await runSingleRequest({
                to: wp.destination,
                vias: wp.intermediates,
                mode: routesLib.TravelMode.DRIVING,
                optimize: false,
                trafficPreference: routesLib.RoutingPreference.TRAFFIC_UNAWARE,
              });
              if (primaryRoute) {
                routeFallbackNote =
                  'Dedicated bike lanes unavailable here — using road bike route.';
              }
            } else if (travelMode === 'WALKING') {
              primaryRoute = await runSingleRequest({
                to: wp.destination,
                vias: wp.intermediates,
                mode: routesLib.TravelMode.DRIVING,
                optimize: false,
                trafficPreference: routesLib.RoutingPreference.TRAFFIC_UNAWARE,
              });
              if (primaryRoute) {
                routeFallbackNote =
                  'Pedestrian path unavailable on a segment — using road route.';
              }
            }
          }
        }

        // If single-call multi-stop succeeded, build ComputedTourRoute
        if (primaryRoute) {
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
                : orderedStops[legIndex]?.name || 'Destination';

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
                    metersToMilesText(stepDist),
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
              distanceText:
                leg.localizedValues?.distance ||
                metersToMilesText(leg.distanceMeters ?? 0),
              durationMillis: leg.durationMillis ?? 0,
              durationText:
                leg.localizedValues?.duration ||
                millisToDurationText(leg.durationMillis ?? 0),
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
          return;
        }

        // Resilient Leg-by-Leg Stitching Fallback (handles multi-stop Transit & isolated pedestrian/plaza stops)
        if (optimizeOrder && travelMode !== 'TRANSIT') {
          orderedStops = nearestNeighborSort(originLatLng, stops);
        }

        interface SegmentSpec {
          fromLabel: string;
          fromLatLng: LatLng;
          toLabel: string;
          toLatLng: LatLng;
        }

        const segments: SegmentSpec[] = [];
        let cursorLabel = origin.name;
        let cursorPos = originLatLng;
        for (const stop of orderedStops) {
          segments.push({
            fromLabel: cursorLabel,
            fromLatLng: cursorPos,
            toLabel: stop.name,
            toLatLng: {lat: stop.lat, lng: stop.lng},
          });
          cursorLabel = stop.name;
          cursorPos = {lat: stop.lat, lng: stop.lng};
        }
        if (roundTrip) {
          segments.push({
            fromLabel: cursorLabel,
            fromLatLng: cursorPos,
            toLabel: origin.name,
            toLatLng: originLatLng,
          });
        }

        const stitchedLegs: ComputedRouteLeg[] = [];
        const stitchedPath: LatLng[] = [];
        let totalDist = 0;
        let totalDur = 0;
        let totalStaticDur = 0;
        let usedModeFallback = false;

        for (let legIdx = 0; legIdx < segments.length; legIdx++) {
          const seg = segments[legIdx];
          const straightDist = haversineMeters(seg.fromLatLng, seg.toLatLng);

          if (straightDist < 30) {
            stitchedLegs.push({
              legIndex: legIdx,
              fromLabel: seg.fromLabel,
              toLabel: seg.toLabel,
              distanceMeters: Math.round(straightDist),
              distanceText: metersToMilesText(straightDist),
              durationMillis: 60000,
              durationText: '1 min',
              staticDurationMillis: 60000,
              steps: [
                {
                  id: `leg-${legIdx}-step-0`,
                  legIndex: legIdx,
                  stepIndex: 0,
                  instruction: `Arrive at ${seg.toLabel}`,
                  maneuver: 'STRAIGHT',
                  distanceMeters: Math.round(straightDist),
                  distanceText: metersToMilesText(straightDist),
                  durationText: '1 min',
                  startLocation: seg.fromLatLng,
                  endLocation: seg.toLatLng,
                },
              ],
            });
            stitchedPath.push(seg.fromLatLng, seg.toLatLng);
            totalDist += Math.round(straightDist);
            totalDur += 60000;
            totalStaticDur += 60000;
            continue;
          }

          let segRoute = await runSingleRequest({
            from: seg.fromLatLng,
            to: seg.toLatLng,
            mode: sdkTravelMode,
            shortestRef: wantsShortest,
          });

          if (!segRoute && travelMode === 'DRIVING') {
            segRoute = await runSingleRequest({
              from: seg.fromLatLng,
              to: seg.toLatLng,
              mode: routesLib.TravelMode.DRIVING,
              trafficPreference: routesLib.RoutingPreference.TRAFFIC_UNAWARE,
            });
          }

          if (!segRoute && travelMode !== 'DRIVING') {
            segRoute = await runSingleRequest({
              from: seg.fromLatLng,
              to: seg.toLatLng,
              mode: routesLib.TravelMode.DRIVING,
              trafficPreference: routesLib.RoutingPreference.TRAFFIC_UNAWARE,
            });
            if (segRoute) usedModeFallback = true;
          }

          if (!segRoute) {
            segRoute = await runSingleRequest({
              from: seg.fromLatLng,
              to: seg.toLatLng,
              mode: routesLib.TravelMode.WALKING,
            });
            if (segRoute) usedModeFallback = true;
          }

          if (!segRoute) {
            throw new Error(
              `Could not find a route between "${seg.fromLabel}" and "${seg.toLabel}". Try removing one of these stops or choosing a closer starting point.`
            );
          }

          const rawLeg = segRoute.legs?.[0];
          const legDist = rawLeg?.distanceMeters ?? segRoute.distanceMeters ?? 0;
          const legDur = rawLeg?.durationMillis ?? segRoute.durationMillis ?? 0;
          const legStatic =
            rawLeg?.staticDurationMillis ??
            segRoute.staticDurationMillis ??
            legDur;

          const steps: ComputedRouteStep[] = (rawLeg?.steps ?? []).map(
            (step, stepIndex) => {
              const stepDist = step.distanceMeters ?? 0;
              const stepStaticMs = step.staticDurationMillis ?? 0;
              return {
                id: `leg-${legIdx}-step-${stepIndex}`,
                legIndex: legIdx,
                stepIndex,
                instruction:
                  stripHtmlToText(step.instructions ?? undefined) ||
                  `Proceed toward ${seg.toLabel}`,
                maneuver: String(step.maneuver || 'STRAIGHT'),
                distanceMeters: stepDist,
                distanceText:
                  step.localizedValues?.distance || metersToMilesText(stepDist),
                durationText:
                  step.localizedValues?.staticDuration ||
                  `${Math.max(1, Math.round(stepStaticMs / 60000))} min`,
                startLocation: step.startLocation
                  ? toLatLng(step.startLocation)
                  : null,
                endLocation: step.endLocation
                  ? toLatLng(step.endLocation)
                  : null,
              };
            }
          );

          if (steps.length === 0) {
            steps.push({
              id: `leg-${legIdx}-step-0`,
              legIndex: legIdx,
              stepIndex: 0,
              instruction: `Head toward ${seg.toLabel}`,
              maneuver: 'STRAIGHT',
              distanceMeters: legDist,
              distanceText: metersToMilesText(legDist),
              durationText: millisToDurationText(legDur),
              startLocation: seg.fromLatLng,
              endLocation: seg.toLatLng,
            });
          }

          stitchedLegs.push({
            legIndex: legIdx,
            fromLabel: seg.fromLabel,
            toLabel: seg.toLabel,
            distanceMeters: legDist,
            distanceText:
              rawLeg?.localizedValues?.distance || metersToMilesText(legDist),
            durationMillis: legDur,
            durationText:
              rawLeg?.localizedValues?.duration || millisToDurationText(legDur),
            staticDurationMillis: legStatic,
            steps,
          });

          const segPts = (segRoute.path ?? []).map(p => toLatLng(p));
          if (segPts.length > 0) {
            stitchedPath.push(...segPts);
          } else {
            stitchedPath.push(seg.fromLatLng, seg.toLatLng);
          }

          totalDist += legDist;
          totalDur += legDur;
          totalStaticDur += legStatic;
        }

        if (!cancelled) {
          setSdkRoute(null);
          setComputedRoute({
            totalDistanceMeters: totalDist,
            totalDurationMillis: totalDur,
            staticDurationMillis: totalStaticDur,
            trafficDelayMinutes: Math.max(
              0,
              Math.round((totalDur - totalStaticDur) / 60000)
            ),
            routeLabels: [],
            optimizedOrderIndices: [],
            orderedStops,
            legs: stitchedLegs,
            encodedPolylinePoints: stitchedPath,
            computedAt: Date.now(),
            routeFallbackNote: isMultiStopTransit
              ? 'Multi-stop transit legs stitched stop-by-stop.'
              : usedModeFallback
                ? 'Combined road & pedestrian segments to connect all selected stops.'
                : routeFallbackNote,
          });
        }
      } catch (err) {
        const hitQuota = checkAndDispatchQuotaError(err);
        if (!cancelled) {
          setSdkRoute(null);
          setComputedRoute(null);
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
    distantStops,
    recompute,
  };
}
