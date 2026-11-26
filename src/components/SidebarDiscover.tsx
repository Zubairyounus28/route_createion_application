import React, {useMemo, useState} from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Coffee,
  Filter,
  GraduationCap,
  Layers,
  Library,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
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
import {AreaSearchInput} from './AreaSearchInput';

interface SidebarDiscoverProps {
  origin: OriginPoint | null;
  onSelectOrigin: (origin: OriginPoint) => void;
  onUseCurrentLocation: () => void;
  isLocating: boolean;
  radiusMiles: number;
  onChangeRadius: (miles: number) => void;
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
  {id: 'all_targets', label: 'All', icon: Layers},
  {id: 'schools', label: 'Schools', icon: GraduationCap},
  {id: 'book_store', label: 'Bookstores', icon: BookOpen},
  {id: 'library', label: 'Libraries', icon: Library},
  {id: 'cafe', label: 'Cafes', icon: Coffee},
  {id: 'supplies', label: 'Supplies', icon: ShoppingBag},
];

export const SidebarDiscover: React.FC<SidebarDiscoverProps> = ({
  origin,
  onSelectOrigin,
  onUseCurrentLocation,
  isLocating,
  radiusMiles,
  onChangeRadius,
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
  focusedSchoolId,
  onFocusSchool,
  onOpenTour,
  isOnline,
}) => {
  const [minRating, setMinRating] = useState<number>(0);
  const [operationalOnly, setOperationalOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'distance' | 'rating'>('distance');
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(false);

  const stopOrderMap: Record<string, number> = {};
  tourStops.forEach((s, idx) => {
    stopOrderMap[s.placeId] = idx + 1;
  });

  const activeFilterCount =
    (radiusMiles !== 5 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (operationalOnly ? 1 : 0) +
    (sortBy !== 'distance' ? 1 : 0);

  const filteredSchools = useMemo(() => {
    return schools
      .filter(s => {
        if (minRating > 0 && (s.rating ?? 0) < minRating) return false;
        if (operationalOnly && !s.isOpenNow) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') {
          return (b.rating ?? 0) - (a.rating ?? 0);
        }
        return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0);
      });
  }, [schools, minRating, operationalOnly, sortBy]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5 sm:space-y-3 shrink-0">
        <AreaSearchInput
          origin={origin}
          onSelectOrigin={onSelectOrigin}
          onUseCurrentLocation={onUseCurrentLocation}
          isLocating={isLocating}
          isOnline={isOnline}
        />

        {/* Custom Live Target Search Input (schools, bookstores, stationery, etc.) */}
        <div className="relative">
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
            placeholder="Find schools, bookstores, stationery, etc..."
            className="w-full pl-9 pr-10 py-2 text-base md:text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear place search"
              onClick={() => onChangeSearchQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Multi-Target Category Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 overflow-x-auto no-scrollbar">
          {CATEGORY_OPTIONS.map(item => {
            const Icon = item.icon;
            const active = targetCategory === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTargetCategory(item.id)}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] md:min-h-0 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
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
                className={`flex-1 min-h-[36px] md:min-h-0 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
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

        {/* Compact Collapsible Filter Summary Row */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFiltersExpanded(v => !v)}
            className={`inline-flex items-center gap-1.5 min-h-[36px] md:min-h-0 px-2.5 py-1.5 rounded-md border transition-colors ${
              filtersExpanded || activeFilterCount > 0
                ? 'border-teal-600/50 bg-teal-50/70 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 font-medium'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>
              Filters · {radiusMiles} mi ·{' '}
              {sortBy === 'distance' ? 'Nearest' : 'Top Rated'}
              {minRating > 0 ? ` · ${minRating}+★` : ''}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredSchools.length} found
            </span>
            <button
              type="button"
              onClick={onRefreshSearch}
              disabled={!isOnline || isSearching || !origin}
              title="Refresh nearby places"
              aria-label="Refresh nearby places"
              className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 md:p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Expandable Radius, Rating, Open & Sort Controls */}
        {filtersExpanded && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Search Radius
                </span>
                <span className="font-mono text-slate-500 dark:text-slate-400">
                  {radiusMiles} miles
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
                {[1, 3, 5, 10].map(miles => (
                  <button
                    key={miles}
                    type="button"
                    onClick={() => onChangeRadius(miles)}
                    className={`min-h-[36px] md:min-h-0 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      radiusMiles === miles
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {miles} mi
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  aria-label="Minimum rating filter"
                  value={minRating}
                  onChange={e => setMinRating(Number(e.target.value))}
                  className="w-full py-1.5 px-2 text-base md:text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value={0}>Any Rating</option>
                  <option value={3.5}>3.5+ Stars</option>
                  <option value={4.0}>4.0+ Stars</option>
                  <option value={4.5}>4.5+ Stars</option>
                </select>
              </div>

              <select
                aria-label="Sort results"
                value={sortBy}
                onChange={e =>
                  setSortBy(e.target.value as 'distance' | 'rating')
                }
                className="w-full py-1.5 px-2 text-base md:text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
              >
                <option value="distance">Nearest first</option>
                <option value="rating">Top rated first</option>
              </select>
            </div>

            <label className="inline-flex items-center gap-2 min-h-[32px] text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={operationalOnly}
                onChange={e => setOperationalOnly(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Open / operational locations only
            </label>
          </div>
        )}
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {searchError && (
          <div className="m-3 p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {searchError}
          </div>
        )}

        {isSearching && (
          <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
            Searching within {radiusMiles} miles...
          </div>
        )}

        {!isSearching && filteredSchools.length === 0 && (
          <div className="p-6 text-center space-y-2">
            <MapPin className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No places match your filters
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try clearing your search term, expanding the radius, or switching categories.
            </p>
          </div>
        )}

        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {filteredSchools.map(place => {
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
                            {typeof place.userRatingCount === 'number' && (
                              <span className="text-slate-400">
                                ({place.userRatingCount})
                              </span>
                            )}
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
                    className={`inline-flex items-center justify-center gap-1 min-h-[42px] md:min-h-0 px-3 md:px-2.5 py-2 md:py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
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
                        Add
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

      {/* Quick Sticky Tour Jump Footer when stops are selected */}
      {tourStops.length > 0 && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between gap-2 shrink-0">
          <div className="text-xs text-slate-700 dark:text-slate-200 font-medium truncate">
            {tourStops.length} stop{tourStops.length > 1 ? 's' : ''} in route
          </div>
          <button
            type="button"
            onClick={onOpenTour}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] md:min-h-0 px-3.5 py-2 md:py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Route & Go
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
