import React, {useMemo, useState} from 'react';
import {
  Check,
  Filter,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Star,
} from 'lucide-react';
import {metersToMilesText} from '../lib/formatters';
import type {
  OriginPoint,
  SchoolLevelFilter,
  SchoolPlace,
  TourStop,
} from '../types/navigation';
import {AreaSearchInput} from './AreaSearchInput';

interface SidebarDiscoverProps {
  origin: OriginPoint | null;
  onSelectOrigin: (origin: OriginPoint) => void;
  onUseCurrentLocation: () => void;
  isLocating: boolean;
  radiusMiles: number;
  onChangeRadius: (miles: number) => void;
  levelFilter: SchoolLevelFilter;
  onChangeLevelFilter: (level: SchoolLevelFilter) => void;
  schools: SchoolPlace[];
  isSearching: boolean;
  searchError: string | null;
  onRefreshSearch: () => void;
  tourStops: TourStop[];
  onToggleStop: (school: SchoolPlace) => void;
  focusedSchoolId: string | null;
  onFocusSchool: (placeId: string) => void;
  isOnline: boolean;
}

export const SidebarDiscover: React.FC<SidebarDiscoverProps> = ({
  origin,
  onSelectOrigin,
  onUseCurrentLocation,
  isLocating,
  radiusMiles,
  onChangeRadius,
  levelFilter,
  onChangeLevelFilter,
  schools,
  isSearching,
  searchError,
  onRefreshSearch,
  tourStops,
  onToggleStop,
  focusedSchoolId,
  onFocusSchool,
  isOnline,
}) => {
  const [minRating, setMinRating] = useState<number>(0);
  const [operationalOnly, setOperationalOnly] = useState<boolean>(false);
  const [keyword, setKeyword] = useState<string>('');
  const [sortBy, setSortBy] = useState<'distance' | 'rating'>('distance');

  const stopOrderMap: Record<string, number> = {};
  tourStops.forEach((s, idx) => {
    stopOrderMap[s.placeId] = idx + 1;
  });

  const filteredSchools = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return schools
      .filter(s => {
        if (minRating > 0 && (s.rating ?? 0) < minRating) return false;
        if (operationalOnly && !s.isOpenNow) return false;
        if (
          q &&
          !s.name.toLowerCase().includes(q) &&
          !s.address.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') {
          return (b.rating ?? 0) - (a.rating ?? 0);
        }
        return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0);
      });
  }, [schools, minRating, operationalOnly, keyword, sortBy]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-4">
        <AreaSearchInput
          origin={origin}
          onSelectOrigin={onSelectOrigin}
          onUseCurrentLocation={onUseCurrentLocation}
          isLocating={isLocating}
          isOnline={isOnline}
        />

        {/* Radius Selector (5-mile default) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
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
                className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
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

        {/* School Level Segmented Filter */}
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            School Type
          </span>
          <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
            {(
              [
                {id: 'all', label: 'All'},
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
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  levelFilter === level.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary User-Friendly Filters */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="Filter name..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              aria-label="Minimum rating filter"
              value={minRating}
              onChange={e => setMinRating(Number(e.target.value))}
              className="w-full py-1.5 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value={0}>Any Rating</option>
              <option value={3.5}>3.5+ Stars</option>
              <option value={4.0}>4.0+ Stars</option>
              <option value={4.5}>4.5+ Stars</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={operationalOnly}
              onChange={e => setOperationalOnly(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Operational only
          </label>

          <div className="flex items-center gap-2">
            <select
              aria-label="Sort schools"
              value={sortBy}
              onChange={e =>
                setSortBy(e.target.value as 'distance' | 'rating')
              }
              className="py-1 px-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              <option value="distance">Nearest</option>
              <option value="rating">Top Rated</option>
            </select>

            <button
              type="button"
              onClick={onRefreshSearch}
              disabled={!isOnline || isSearching || !origin}
              title="Refresh schools"
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto">
        {searchError && (
          <div className="m-4 p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {searchError}
          </div>
        )}

        {isSearching && (
          <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
            Searching schools within {radiusMiles} miles...
          </div>
        )}

        {!isSearching && filteredSchools.length === 0 && (
          <div className="p-6 text-center space-y-2">
            <MapPin className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No schools match your filters
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try expanding the radius or resetting the school level and rating filters.
            </p>
          </div>
        )}

        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {filteredSchools.map(school => {
            const stopNum = stopOrderMap[school.placeId];
            const isFocused = focusedSchoolId === school.placeId;

            return (
              <li
                key={school.placeId}
                className={`p-4 transition-colors ${
                  isFocused
                    ? 'bg-teal-50/60 dark:bg-teal-950/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onFocusSchool(school.placeId)}
                    className="text-left min-w-0 flex-1"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {school.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {school.address}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <span>
                        {school.primaryTypeDisplayName || 'School'}
                      </span>
                      {typeof school.rating === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {school.rating.toFixed(1)}
                            {typeof school.userRatingCount === 'number' && (
                              <span className="text-slate-400">
                                ({school.userRatingCount})
                              </span>
                            )}
                          </span>
                        </>
                      )}
                      {typeof school.distanceMeters === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400 font-medium">
                            {metersToMilesText(school.distanceMeters)}
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleStop(school)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      stopNum
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                        : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {stopNum ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Stop #{stopNum}
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
      </div>
    </div>
  );
};
