import React from 'react';
import {
  Bike,
  Car,
  Crosshair,
  Navigation,
  Play,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {metersToMilesText, millisToDurationText} from '../lib/formatters';
import type {
  ComputedRouteStep,
  ComputedTourRoute,
  TravelModeOption,
} from '../types/navigation';
import {ManeuverIcon} from './ManeuverIcon';

interface SidebarNavigationProps {
  computedRoute: ComputedTourRoute | null;
  travelMode: TravelModeOption;
  onChangeTravelMode: (mode: TravelModeOption) => void;
  isNavigating: boolean;
  onStartNavigation: () => void;
  onStopNavigation: () => void;
  activeStepIndex: number;
  onSelectStep: (globalIndex: number) => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  voiceRate: number;
  onChangeVoiceRate: (rate: number) => void;
  voiceSupported: boolean;
  onSpeakStep: (step: ComputedRouteStep) => void;
  gpsFollowEnabled: boolean;
  onToggleGpsFollow: () => void;
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  computedRoute,
  travelMode,
  onChangeTravelMode,
  isNavigating,
  onStartNavigation,
  onStopNavigation,
  activeStepIndex,
  onSelectStep,
  voiceEnabled,
  onToggleVoice,
  voiceRate,
  onChangeVoiceRate,
  voiceSupported,
  onSpeakStep,
  gpsFollowEnabled,
  onToggleGpsFollow,
}) => {
  if (!computedRoute || computedRoute.legs.length === 0) {
    return (
      <div className="p-6 text-center space-y-2">
        <Navigation className="w-6 h-6 text-slate-400 mx-auto" />
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
          No active turn-by-turn directions
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Select at least one stop (school, bookstore, library, or cafe) to view leg-by-leg maneuvers and launch live Car or Bike navigation.
        </p>
      </div>
    );
  }

  let runningIndex = 0;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      {/* Voice, Car/Bike Switch & Live GPS Controls */}
      <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5 sm:space-y-3 shrink-0">
        {/* Quick Car vs Bike Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => onChangeTravelMode('DRIVING')}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] md:min-h-0 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              travelMode === 'DRIVING'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            Car Directions
          </button>
          <button
            type="button"
            onClick={() => onChangeTravelMode('BICYCLING')}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] md:min-h-0 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              travelMode === 'BICYCLING'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            Bike Directions
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          {isNavigating ? (
            <button
              type="button"
              onClick={onStopNavigation}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] md:min-h-0 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              End Navigation
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartNavigation}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] md:min-h-0 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              Start Voice Guidance
            </button>
          )}

          <button
            type="button"
            onClick={onToggleVoice}
            disabled={!voiceSupported}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] md:min-h-0 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              voiceEnabled && voiceSupported
                ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-teal-50/70 dark:bg-teal-950/30'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            {voiceEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                Voice On
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                Muted
              </>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs">
          <label className="inline-flex items-center gap-2 min-h-[36px] md:min-h-0 text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gpsFollowEnabled}
              onChange={onToggleGpsFollow}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <Crosshair className="w-3.5 h-3.5 text-slate-500" />
            Live GPS auto-follow
          </label>

          {voiceSupported && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400">Speed</span>
              <select
                aria-label="Voice speed"
                value={voiceRate}
                onChange={e => onChangeVoiceRate(Number(e.target.value))}
                className="py-1.5 md:py-1 px-2 text-base md:text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono"
              >
                <option value={0.9}>0.9x</option>
                <option value={1.0}>1.0x</option>
                <option value={1.15}>1.15x</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Leg-by-Leg & Step-by-Step Instructions */}
      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {computedRoute.legs.map(leg => (
          <div key={leg.legIndex} className="pb-2">
            <div className="sticky top-0 z-10 px-4 py-2.5 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                Leg {leg.legIndex + 1}: {leg.fromLabel} → {leg.toLabel}
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {leg.durationText || millisToDurationText(leg.durationMillis)} ·{' '}
                {leg.distanceText || metersToMilesText(leg.distanceMeters)} ·{' '}
                {leg.steps.length} steps
              </div>
            </div>

            <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {leg.steps.map(step => {
                const currentIdx = runningIndex++;
                const isActive = isNavigating && activeStepIndex === currentIdx;

                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStep(currentIdx);
                        onSpeakStep(step);
                      }}
                      className={`w-full text-left px-4 py-3.5 md:py-3 min-h-[56px] md:min-h-0 flex items-start gap-3 transition-colors ${
                        isActive
                          ? 'bg-teal-50 dark:bg-teal-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                          isActive
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <ManeuverIcon
                          maneuver={step.maneuver}
                          className="w-4 h-4"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                          {step.instruction}
                        </div>
                        <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {step.distanceText} · {step.durationText}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};
