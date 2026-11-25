import React, {useCallback, useState} from 'react';
import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {Crosshair, Loader2, MapPin, Search, X} from 'lucide-react';
import {useAutocompleteSuggestions} from '../hooks/useAutocompleteSuggestions';
import {checkAndDispatchQuotaError} from '../lib/quota';
import type {OriginPoint} from '../types/navigation';

interface AreaSearchInputProps {
  origin: OriginPoint | null;
  onSelectOrigin: (origin: OriginPoint) => void;
  onUseCurrentLocation: () => void;
  isLocating: boolean;
  isOnline: boolean;
}

export const AreaSearchInput: React.FC<AreaSearchInputProps> = ({
  origin,
  onSelectOrigin,
  onUseCurrentLocation,
  isLocating,
  isOnline,
}) => {
  const placesLib = useMapsLibrary('places');
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const {suggestions, isLoading, resetSession} = useAutocompleteSuggestions(
    query,
    origin ? {lat: origin.lat, lng: origin.lng} : null
  );

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });
        if (place.location) {
          const lat =
            typeof place.location.lat === 'function'
              ? place.location.lat()
              : Number(place.location.lat);
          const lng =
            typeof place.location.lng === 'function'
              ? place.location.lng()
              : Number(place.location.lng);
          const label =
            place.displayName ||
            place.formattedAddress ||
            suggestion.placePrediction.text.text;
          onSelectOrigin({
            name: label,
            lat,
            lng,
            isCurrentLocation: false,
          });
          setQuery('');
          setIsOpen(false);
          resetSession();
        }
      } catch (err) {
        checkAndDispatchQuotaError(err);
      }
    },
    [placesLib, onSelectOrigin, resetSession]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="area-search-input"
          className="text-xs font-semibold text-slate-700 dark:text-slate-300"
        >
          Target Area or Starting Location
        </label>
        <button
          type="button"
          onClick={onUseCurrentLocation}
          disabled={isLocating}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          {isLocating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Crosshair className="w-3.5 h-3.5" />
          )}
          Use My GPS
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id="area-search-input"
          type="text"
          value={query}
          disabled={!isOnline}
          onFocus={() => setIsOpen(true)}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder={
            isOnline
              ? 'Search neighborhood, city, or address...'
              : 'Search unavailable offline'
          }
          className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 disabled:opacity-60"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear area search"
            onClick={() => {
              setQuery('');
              resetSession();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {isOpen && (suggestions.length > 0 || isLoading) && (
          <div className="absolute z-30 mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
            {isLoading && suggestions.length === 0 && (
              <div className="px-3 py-2.5 text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Searching places...
              </div>
            )}
            <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {suggestions.map((suggestion, idx) => (
                <li key={suggestion.placePrediction?.placeId || idx}>
                  <button
                    type="button"
                    onClick={() => void handleSelectSuggestion(suggestion)}
                    className="w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors flex items-start gap-2"
                  >
                    <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                    <span className="text-slate-800 dark:text-slate-200 leading-snug">
                      {suggestion.placePrediction?.text.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {origin && (
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 truncate">
          <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="truncate font-medium text-slate-800 dark:text-slate-200">
            {origin.name}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-[11px] shrink-0">
            {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}
          </span>
        </div>
      )}
    </div>
  );
};
