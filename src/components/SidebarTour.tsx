import React, {useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bike,
  Bus,
  Car,
  Cloud,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {metersToMilesText, millisToDurationText} from '../lib/formatters';
import type {
  ComputedTourRoute,
  OriginPoint,
  RouteObjective,
  TourStop,
  TravelModeOption,
} from '../types/navigation';

interface SidebarTourProps {
  origin: OriginPoint | null;
  stops: TourStop[];
  computedRoute: ComputedTourRoute | null;
  isComputing: boolean;
  routeError: string | null;
  travelMode: TravelModeOption;
  onChangeTravelMode: (mode: TravelModeOption) => void;
  routeObjective: RouteObjective;
  onChangeRouteObjective: (obj: RouteObjective) => void;
  optimizeOrder: boolean;
  onToggleOptimizeOrder: () => void;
  roundTrip: boolean;
  onToggleRoundTrip: () => void;
  onMoveStop: (index: number, direction: -1 | 1) => void;
  onRemoveStop: (placeId: string) => void;
  onClearStops: () => void;
  onRefreshTraffic: () => void;
  onStartNavigation: () => void;
  tourTitle: string;
  onChangeTourTitle: (title: string) => void;
  onSaveTour: () => Promise<void>;
  isSavingTour: boolean;
  saveFeedback: string | null;
  isSignedIn: boolean;
  isOnline: boolean;
}

export const SidebarTour: React.FC<SidebarTourProps> = ({
  origin,
  stops,
  computedRoute,
  isComputing,
  routeError,
  travelMode,
  onChangeTravelMode,
  routeObjective,
  onChangeRouteObjective,
  optimizeOrder,
  onToggleOptimizeOrder,
  roundTrip,
  onToggleRoundTrip,
  onMoveStop,
  onRemoveStop,
  onClearStops,
  onRefreshTraffic,
  onStartNavigation,
  tourTitle,
  onChangeTourTitle,
  onSaveTour,
  isSavingTour,
  saveFeedback,
  isSignedIn,
  isOnline,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  const displayedStops =
    computedRoute?.orderedStops.length ? computedRoute.orderedStops : stops;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-4">
        {/* Travel Mode Selector */}
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Travel Mode
          </span>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
            {(
              [
                {id: 'DRIVING', label: 'Drive', icon: Car},
                {id: 'WALKING', label: 'Walk', icon: Footprints},
                {id: 'BICYCLING', label: 'Bike', icon: Bike},
                {id: 'TRANSIT', label: 'Transit', icon: Bus},
              ] as {
                id: TravelModeOption;
                label: string;
                icon: React.ComponentType<{className?: string}>;
              }[]
            ).map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTravelMode(item.id)}
                  className={`inline-flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    travelMode === item.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Route Objective */}
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Routing Priority
          </span>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => onChangeRouteObjective('FASTEST_TRAFFIC')}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                routeObjective === 'FASTEST_TRAFFIC'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Fastest · Live Traffic
            </button>
            <button
              type="button"
              onClick={() => onChangeRouteObjective('SHORTEST_DISTANCE')}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                routeObjective === 'SHORTEST_DISTANCE'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Shortest Distance
            </button>
          </div>
        </div>

        {/* Optimization & Round Trip toggles */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={optimizeOrder}
              disabled={travelMode === 'TRANSIT'}
              onChange={onToggleOptimizeOrder}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Auto-optimize stop order
          </label>

          <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={roundTrip}
              onChange={onToggleRoundTrip}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Round trip
          </label>
        </div>

        {/* Live Route Metrics Summary */}
        {computedRoute && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {millisToDurationText(computedRoute.totalDurationMillis)}
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  ({metersToMilesText(computedRoute.totalDistanceMeters)})
                </span>
              </div>

              <button
                type="button"
                onClick={onRefreshTraffic}
                disabled={!isOnline || isComputing}
                title="Refresh real-time traffic"
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isComputing ? 'animate-spin' : ''}`}
                />
                Refresh Traffic
              </button>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>{displayedStops.length} school stops</span>
              <span aria-hidden="true">·</span>
              {computedRoute.trafficDelayMinutes > 0 ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  +{computedRoute.trafficDelayMinutes} min traffic delay
                </span>
              ) : (
                <span className="text-teal-700 dark:text-teal-400">
                  Clear traffic flow
                </span>
              )}
              {computedRoute.optimizedOrderIndices.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Optimized order</span>
                </>
              )}
            </div>
          </div>
        )}

        {isComputing && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
            Calculating optimized multi-stop route...
          </div>
        )}

        {routeError && (
          <div className="p-2.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {routeError}
          </div>
        )}
      </div>

      {/* Ordered Itinerary List */}
      <div className="flex-1 overflow-y-auto">
        {stops.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <Navigation className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Your school tour is empty
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add 1 or more schools from the Discover tab to build an optimized multi-stop tour route.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {/* Origin Row */}
            {origin && (
              <div className="px-4 py-3 flex items-center gap-3 bg-slate-50/70 dark:bg-slate-900/40">
                <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-slate-700 text-white flex items-center justify-center shrink-0">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Start: {origin.name}
                  </div>
                </div>
              </div>
            )}

            {/* School Stops */}
            {displayedStops.map((stop, idx) => {
              const leg = computedRoute?.legs[idx];
              return (
                <div
                  key={stop.placeId}
                  className="px-4 py-3 flex items-start gap-3"
                >
                  <div className="w-6 h-6 rounded-full bg-teal-600 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                      {stop.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {stop.address}
                    </div>
                    {leg && (
                      <div className="mt-1 text-xs font-mono tabular-nums text-teal-700 dark:text-teal-400">
                        Leg {idx + 1}: {leg.durationText || millisToDurationText(leg.durationMillis)} ·{' '}
                        {leg.distanceText || metersToMilesText(leg.distanceMeters)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!optimizeOrder && (
                      <>
                        <button
                          type="button"
                          onClick={() => onMoveStop(idx, -1)}
                          disabled={idx === 0}
                          aria-label="Move stop up"
                          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveStop(idx, 1)}
                          disabled={idx === displayedStops.length - 1}
                          aria-label="Move stop down"
                          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveStop(stop.placeId)}
                      aria-label={`Remove ${stop.name}`}
                      className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Round Trip Return */}
            {roundTrip && origin && (
              <div className="px-4 py-3 flex items-center gap-3 bg-slate-50/70 dark:bg-slate-900/40">
                <div className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0">
                  <RotateCcw className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Return to {origin.name}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions: Save/Sync + Start Navigation */}
      {stops.length > 0 && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tourTitle}
              onChange={e => onChangeTourTitle(e.target.value)}
              maxLength={120}
              placeholder="Name this school tour..."
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <button
              type="button"
              onClick={() => void onSaveTour()}
              disabled={isSavingTour}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {isSavingTour ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isSignedIn && isOnline ? (
                <Cloud className="w-3.5 h-3.5 text-teal-600" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {isSignedIn && isOnline ? 'Save & Sync' : 'Cache Offline'}
            </button>
          </div>

          {saveFeedback && (
            <p className="text-xs text-teal-700 dark:text-teal-400">
              {saveFeedback}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onStartNavigation}
              disabled={!computedRoute || computedRoute.legs.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Navigation className="w-4 h-4" />
              Start Turn-by-Turn
            </button>

            {confirmClear ? (
              <button
                type="button"
                onClick={() => {
                  onClearStops();
                  setConfirmClear(false);
                }}
                onMouseLeave={() => setConfirmClear(false)}
                className="px-3 py-2.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
              >
                Confirm Clear
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
