import {useCallback, useState} from 'react';
import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {haversineMeters} from '../lib/formatters';
import {checkAndDispatchQuotaError} from '../lib/quota';
import type {LatLng, SchoolLevelFilter, SchoolPlace} from '../types/navigation';

const SCHOOL_TYPE_MAP: Record<SchoolLevelFilter, string[]> = {
  all: ['school', 'primary_school', 'secondary_school', 'preschool', 'university'],
  preschool: ['preschool'],
  primary_school: ['primary_school'],
  secondary_school: ['secondary_school'],
  university: ['university'],
};

export function useSchoolSearch() {
  const placesLib = useMapsLibrary('places');
  const geoLib = useMapsLibrary('geometry');
  const [schools, setSchools] = useState<SchoolPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchNearbySchools = useCallback(
    async (
      center: LatLng,
      radiusMiles: number,
      levelFilter: SchoolLevelFilter = 'all'
    ): Promise<SchoolPlace[]> => {
      if (!placesLib) {
        return [];
      }

      setIsSearching(true);
      setSearchError(null);

      try {
        const radiusMeters = Math.min(
          Math.max(radiusMiles * 1609.344, 500),
          50000
        );

        const request: google.maps.places.SearchNearbyRequest = {
          fields: [
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
          ],
          locationRestriction: {
            center,
            radius: radiusMeters,
          },
          includedPrimaryTypes: SCHOOL_TYPE_MAP[levelFilter],
          maxResultCount: 20,
          rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
          internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
        };

        const {places} = await placesLib.Place.searchNearby(request);

        const mapped: SchoolPlace[] = (places ?? [])
          .filter(place => place.location)
          .map(place => {
            const loc = place.location!;
            const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
            const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);

            let distanceMeters = haversineMeters(center, {lat, lng});
            if (geoLib?.spherical) {
              distanceMeters = geoLib.spherical.computeDistanceBetween(
                center,
                {lat, lng}
              );
            }

            return {
              placeId: place.id,
              name: place.displayName || 'Unnamed School',
              address: place.formattedAddress || 'Address unavailable',
              lat,
              lng,
              rating: typeof place.rating === 'number' ? place.rating : undefined,
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
          .filter(s => (s.distanceMeters ?? 0) <= radiusMeters + 400);

        setSchools(mapped);
        return mapped;
      } catch (err) {
        const hitQuota = checkAndDispatchQuotaError(err);
        const message = hitQuota
          ? 'Google Maps Platform quota limit reached while searching nearby schools.'
          : err instanceof Error
            ? err.message
            : 'Unable to search nearby schools right now.';
        setSearchError(message);
        return [];
      } finally {
        setIsSearching(false);
      }
    },
    [placesLib, geoLib]
  );

  return {
    schools,
    setSchools,
    isSearching,
    searchError,
    searchNearbySchools,
  };
}
