import {useCallback, useRef, useState} from 'react';
import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {haversineMeters} from '../lib/formatters';
import {checkAndDispatchQuotaError} from '../lib/quota';
import type {
  LatLng,
  SchoolLevelFilter,
  SchoolPlace,
  TargetCategory,
} from '../types/navigation';

const SCHOOL_TYPE_MAP: Record<SchoolLevelFilter, string[]> = {
  all: ['school', 'primary_school', 'secondary_school', 'preschool', 'university'],
  preschool: ['preschool'],
  primary_school: ['primary_school'],
  secondary_school: ['secondary_school'],
  university: ['university'],
};

const PLACE_FIELDS = [
  'id',
  'displayName',
  'location',
  'formattedAddress',
  'rating',
  'userRatingCount',
  'primaryType',
  'primaryTypeDisplayName',
  'businessStatus',
  'googleMapsURI',
];

function computeCircleBounds(
  center: LatLng,
  radiusMeters: number
): google.maps.LatLngBoundsLiteral | null {
  const latDelta = radiusMeters / 111320;
  const lngScale = Math.max(0.15, Math.cos((center.lat * Math.PI) / 180));
  const lngDelta = radiusMeters / (111320 * lngScale);

  const south = Math.max(-89.9, center.lat - latDelta);
  const north = Math.min(89.9, center.lat + latDelta);
  const west = center.lng - lngDelta;
  const east = center.lng + lngDelta;

  if (west < -180 || east > 180) {
    return null;
  }
  return {south, north, west, east};
}

export function useSchoolSearch() {
  const placesLib = useMapsLibrary('places');
  const geoLib = useMapsLibrary('geometry');
  const [schools, setSchools] = useState<SchoolPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);

  const mapPlaceResults = useCallback(
    (
      places: google.maps.places.Place[] | undefined,
      center: LatLng,
      radiusMeters: number
    ): SchoolPlace[] => {
      return (places ?? [])
        .filter(place => place.location)
        .map(place => {
          const loc = place.location!;
          const lat =
            typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
          const lng =
            typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);

          let distanceMeters = haversineMeters(center, {lat, lng});
          if (geoLib?.spherical) {
            distanceMeters = geoLib.spherical.computeDistanceBetween(center, {
              lat,
              lng,
            });
          }

          return {
            placeId: place.id,
            name: place.displayName || 'Unnamed Place',
            address: place.formattedAddress || 'Address unavailable',
            lat,
            lng,
            rating:
              typeof place.rating === 'number' ? place.rating : undefined,
            userRatingCount:
              typeof place.userRatingCount === 'number'
                ? place.userRatingCount
                : undefined,
            primaryType: place.primaryType || undefined,
            primaryTypeDisplayName: place.primaryTypeDisplayName || undefined,
            isOpenNow:
              place.businessStatus === 'OPERATIONAL' ? true : undefined,
            googleMapsURI: place.googleMapsURI || undefined,
            distanceMeters,
          };
        })
        .filter(s => (s.distanceMeters ?? 0) <= radiusMeters + 800);
    },
    [geoLib]
  );

  const searchNearbySchools = useCallback(
    async (
      center: LatLng,
      radiusMiles: number,
      levelFilter: SchoolLevelFilter = 'all',
      category: TargetCategory = 'all_targets',
      customQuery = ''
    ): Promise<SchoolPlace[]> => {
      if (!placesLib) {
        return [];
      }

      const requestId = ++latestRequestIdRef.current;
      setIsSearching(true);
      setSearchError(null);

      try {
        const radiusMeters = Math.min(
          Math.max(radiusMiles * 1609.344, 500),
          50000
        );
        const trimmedQuery = customQuery.trim();

        let results: SchoolPlace[] = [];

        if (trimmedQuery.length >= 2 || category === 'supplies') {
          const queryText =
            trimmedQuery.length >= 2
              ? trimmedQuery
              : 'stationery bookstore school office supplies';
          const bounds = computeCircleBounds(center, radiusMeters);
          const textReq: google.maps.places.SearchByTextRequest = {
            textQuery: queryText,
            fields: PLACE_FIELDS,
            maxResultCount: 20,
            rankPreference: placesLib.SearchByTextRankPreference.DISTANCE,
            internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
            ...(bounds
              ? {locationRestriction: bounds}
              : {locationBias: {center, radius: radiusMeters}}),
          };

          if (
            trimmedQuery.length >= 2 &&
            (category === 'book_store' ||
              category === 'library' ||
              category === 'cafe')
          ) {
            textReq.includedType = category;
          }

          const {places} = await placesLib.Place.searchByText(textReq);
          results = mapPlaceResults(places, center, radiusMeters);

          // If strict bounds returned nothing for a specific niche term, broaden once with locationBias
          if (results.length === 0 && bounds && trimmedQuery.length >= 2) {
            const broadRes = await placesLib.Place.searchByText({
              textQuery: queryText,
              fields: PLACE_FIELDS,
              maxResultCount: 20,
              locationBias: {center, radius: radiusMeters},
              internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
            });
            results = mapPlaceResults(
              broadRes.places,
              center,
              Math.max(radiusMeters * 1.5, 8000)
            );
          }
        } else if (category === 'all_targets') {
          // Run two lightweight nearby searches in parallel so schools AND bookstores/libraries/cafes both surface
          const [schoolsRes, studySpotsRes] = await Promise.all([
            placesLib.Place.searchNearby({
              fields: PLACE_FIELDS,
              locationRestriction: {center, radius: radiusMeters},
              includedPrimaryTypes: SCHOOL_TYPE_MAP.all,
              maxResultCount: 12,
              rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
              internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
            }),
            placesLib.Place.searchNearby({
              fields: PLACE_FIELDS,
              locationRestriction: {center, radius: radiusMeters},
              includedPrimaryTypes: ['book_store', 'library', 'cafe'],
              maxResultCount: 12,
              rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
              internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
            }),
          ]);

          const merged = [
            ...mapPlaceResults(schoolsRes.places, center, radiusMeters),
            ...mapPlaceResults(studySpotsRes.places, center, radiusMeters),
          ];
          const seen = new Set<string>();
          results = merged.filter(item => {
            if (seen.has(item.placeId)) return false;
            seen.add(item.placeId);
            return true;
          });
        } else {
          const includedPrimaryTypes =
            category === 'schools' ? SCHOOL_TYPE_MAP[levelFilter] : [category];

          const {places} = await placesLib.Place.searchNearby({
            fields: PLACE_FIELDS,
            locationRestriction: {center, radius: radiusMeters},
            includedPrimaryTypes,
            maxResultCount: 20,
            rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
            internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
          });
          results = mapPlaceResults(places, center, radiusMeters);
        }

        results.sort(
          (a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0)
        );

        if (requestId === latestRequestIdRef.current) {
          setSchools(results);
        }
        return results;
      } catch (err) {
        const hitQuota = checkAndDispatchQuotaError(err);
        if (requestId === latestRequestIdRef.current) {
          const message = hitQuota
            ? 'Google Maps Platform quota limit reached while searching nearby places.'
            : err instanceof Error
              ? err.message
              : 'Unable to search nearby places right now.';
          setSearchError(message);
        }
        return [];
      } finally {
        if (requestId === latestRequestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [placesLib, mapPlaceResults]
  );

  return {
    schools,
    setSchools,
    isSearching,
    searchError,
    searchNearbySchools,
  };
}
