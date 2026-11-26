import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Coffee,
  Crosshair,
  GraduationCap,
  Layers,
  Library,
  Loader2,
  MapPin,
  MapPinPlus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Star,
  X,
} from 'lucide-react';
import {formatPlaceTypeLabel, metersToMilesText} from '../lib/formatters';
import type {
  OriginPoint,
  SchoolLevelFilter,
  SchoolPlace,
  TargetCategory,
  TourStop,
} from '../types/navigation';
import {AppFooter} from './AppFooter';

interface SidebarAddStopsProps {
  searchArea: OriginPoint;
  myLocation: OriginPoint | null;
  onUseCurrentLocation: () => void;
  isLocating: boolean;
  onGoToDiscover: () => void;
  radiusMiles: number;
  targetCategory: TargetCategory;
  onChangeTargetCategory: (cat: TargetCategory) => void;
  levelFilter: SchoolLevelFilter;
  onChangeLevelFilter: (level: SchoolLevelFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  schools: SchoolPlace[];
  isSearching: boolean;
  searchError: string | null;
  onRefreshSearch: () => void;
  tourStops: TourStop[];
  onToggleStop: (school: SchoolPlace) => void;
  onRemoveStop: (placeId: string) => void;
  onClearStops: () => void;
  focusedSchoolId: string | null;
  onFocusSchool: (placeId: string) => void;
  onOpenTour: () => void;
  isOnline: boolean;
}

const CATEGORY_OPTIONS: {
  id: TargetCategory;
  label: string;
  icon: React.ComponentType<{className?: string}>;
}[] = [
  {id: 'schools', label: 'Schools', icon: GraduationCap},
  {id: 'all_targets', label: 'All', icon: Layers},
  {id: 'book_store', label: 'Bookstores', icon: BookOpen},
  {id: 'library', label: 'Libraries', icon: Library},
  {id: 'cafe', label: 'Cafes', icon: Coffee},
  {id: 'supplies', label: 'Supplies', icon: ShoppingBag},
];

export const SidebarAddStops: React.FC<SidebarAddStopsProps> = ({
  searchArea,
  myLocation,
  onUseCurrentLocation,
  isLocating,
  onGoToDiscover,
  radiusMiles,
  targetCategory,
  onChangeTargetCategory,
  levelFilter,
  onChangeLevelFilter,
  searchQuery,
  onChangeSearchQuery,
  schools,
  isSearching,
  searchError,
  onRefreshSearch,
  tourStops,
  onToggleStop,
  onRemoveStop,
  onClearStops,
  focusedSchoolId,
  onFocusSchool,
  onOpenTour,
  isOnline,
}) => {
  const stopOrderMap: Record<string, number> = {};
  tourStops.forEach((s, idx) => {
    stopOrderMap[s.placeId] = idx + 1;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Slim Pinned Search Bar Only — preserves full scroll space on mobile */}
      <div className="px-3 py-2 sm:px-4 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-950">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => onChangeSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onRefreshSearch();
                }
              }}
              placeholder="Search schools, bookstores, or stops..."
              className="w-full pl-9 pr-9 py-1.5 sm:py-2 text-base md:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear stop search"
                onClick={() => onChangeSearchQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[34px] min-h-[34px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onRefreshSearch}
            disabled={!isOnline || isSearching}
            title="Refresh places"
            aria-label="Refresh places"
            className="inline-flex items-center justify-center min-w-[38px] min-h-[38px] md:min-w-[34px] md:min-h-[34px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors shrink-0"
          >
            <RefreshCw
              className={`w-4 h-4 md:w-3.5 md:h-3.5 ${isSearching ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Unified Scrollable Area: Filters + Selected Chips + Place List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 py-2.5 sm:px-4 border-b border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/60 dark:bg-slate-900/30">
          {/* Compact Target Area + GPS Start Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="min-w-0 flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
              <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                {searchArea.name}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[11px] shrink-0 text-slate-500 dark:text-slate-400">
                {radiusMiles} mi
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!myLocation && (
                <button
                  type="button"
                  onClick={onUseCurrentLocation}
                  disabled={isLocating}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[11px] font-medium hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors whitespace-nowrap"
                >
                  {isLocating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Crosshair className="w-3 h-3" />
                  )}
                  Set GPS Start
                </button>
              )}
              <button
                type="button"
                onClick={onGoToDiscover}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Change Area
              </button>
            </div>
          </div>

          {/* Category Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 overflow-x-auto no-scrollbar">
            {CATEGORY_OPTIONS.map(item => {
              const Icon = item.icon;
              const active = targetCategory === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTargetCategory(item.id)}
                  className={`inline-flex items-center justify-center gap-1.5 min-h-[34px] md:min-h-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
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

          {/* Conditional School Sub-Level Filter */}
          {targetCategory === 'schools' && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 overflow-x-auto no-scrollbar">
              {(
                [
                  {id: 'all', label: 'All Schools'},
                  {id: 'preschool', label: 'Preschool'},
                  {id: 'primary_school', label: 'Primary'},
                  {id: 'secondary_school', label: 'Secondary'},
                  {id: 'university', label: 'College'},
                ] as {id: SchoolLevelFilter; label: string}[]
              ).map(level => (
                <button
                  key={level.id}
                  type="button"
                  onClick={() => onChangeLevelFilter(level.id)}
                  className={`flex-1 min-h-[32px] md:min-h-0 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    levelFilter === level.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          )}

          {/* Quick Selected Stops Strip */}
          {tourStops.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
              {tourStops.map((stop, idx) => (
                <span
                  key={stop.placeId}
                  className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 whitespace-nowrap shrink-0"
                >
                  <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                    #{idx + 1}
                  </span>
                  <span className="max-w-[130px] truncate font-medium">
                    {stop.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveStop(stop.placeId)}
                    aria-label={`Remove ${stop.name}`}
                    className="p-0.5 rounded hover:bg-teal-200/70 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {searchError && (
          <div className="m-3 p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {searchError}
          </div>
        )}

        {isSearching && (
          <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
            Finding places in {searchArea.name}...
          </div>
        )}

        {!isSearching && schools.length === 0 && (
          <div className="p-6 text-center space-y-2">
            <MapPinPlus className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No places found here yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try searching by name above, switching categories, or expanding your radius in Discover.
            </p>
          </div>
        )}

        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {schools.map(place => {
            const stopNum = stopOrderMap[place.placeId];
            const isFocused = focusedSchoolId === place.placeId;

            return (
              <li
                key={place.placeId}
                className={`px-3.5 py-3 sm:p-4 transition-colors ${
                  isFocused
                    ? 'bg-teal-50/70 dark:bg-teal-950/25'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => onFocusSchool(place.placeId)}
                    className="text-left min-w-0 flex-1"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {place.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {place.address}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <span>
                        {formatPlaceTypeLabel(
                          place.primaryType,
                          place.primaryTypeDisplayName
                        )}
                      </span>
                      {typeof place.rating === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {place.rating.toFixed(1)}
                          </span>
                        </>
                      )}
                      {typeof place.distanceMeters === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400 font-medium">
                            {metersToMilesText(place.distanceMeters)}
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleStop(place)}
                    className={`inline-flex items-center justify-center gap-1 min-h-[42px] md:min-h-0 px-3 py-2 md:py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      stopNum
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                        : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {stopNum ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        #{stopNum}
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        Add Stop
                      </>
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="md:hidden mt-2">
          <AppFooter variant="compact" />
        </div>
      </div>

      {/* Bottom Action Footer — shown only when stops are added */}
      {tourStops.length > 0 && (
        <div className="p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
              {tourStops.length} stop{tourStops.length > 1 ? 's' : ''} added
            </span>
            <button
              type="button"
              onClick={onClearStops}
              className="text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 underline"
            >
              Clear
            </button>
          </div>
          <button
            type="button"
            onClick={onOpenTour}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] md:min-h-0 px-3.5 py-2 md:py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Create Route
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
