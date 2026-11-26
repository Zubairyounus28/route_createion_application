export interface LatLng {
  lat: number;
  lng: number;
}

export interface OriginPoint {
  name: string;
  lat: number;
  lng: number;
  isCurrentLocation?: boolean;
}

export type TargetCategory =
  | 'all_targets'
  | 'schools'
  | 'book_store'
  | 'library'
  | 'cafe'
  | 'supplies';

export type SchoolLevelFilter =
  | 'all'
  | 'preschool'
  | 'primary_school'
  | 'secondary_school'
  | 'university';

export type MapStyleId = 'daylight' | 'night' | 'terrain' | 'hybrid';

export type TravelModeOption = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';

export type RouteObjective = 'FASTEST_TRAFFIC' | 'SHORTEST_DISTANCE';

export interface SchoolPlace {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  primaryTypeDisplayName?: string;
  isOpenNow?: boolean;
  googleMapsURI?: string;
  distanceMeters?: number;
}

export interface TourStop {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  primaryType?: string;
}

export interface ComputedRouteStep {
  id: string;
  legIndex: number;
  stepIndex: number;
  instruction: string;
  maneuver: string;
  distanceMeters: number;
  distanceText: string;
  durationText: string;
  startLocation: LatLng | null;
  endLocation: LatLng | null;
}

export interface ComputedRouteLeg {
  legIndex: number;
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
  distanceText: string;
  durationMillis: number;
  durationText: string;
  staticDurationMillis: number;
  steps: ComputedRouteStep[];
}

export interface ComputedTourRoute {
  totalDistanceMeters: number;
  totalDurationMillis: number;
  staticDurationMillis: number;
  trafficDelayMinutes: number;
  routeLabels: string[];
  optimizedOrderIndices: number[];
  orderedStops: TourStop[];
  legs: ComputedRouteLeg[];
  encodedPolylinePoints: LatLng[];
  computedAt: number;
  routeFallbackNote?: string;
}

export interface LiveTelemetry {
  location: LatLng;
  heading: number | null;
  speedMps: number | null;
  accuracyMeters: number | null;
  distanceToNextTurnMeters: number | null;
  distanceOffRouteMeters: number | null;
  updatedAt: number;
}

export interface SyncedSchoolTour {
  id: string;
  ownerId: string;
  title: string;
  originName: string;
  originLat: number;
  originLng: number;
  radiusMiles: number;
  travelMode: TravelModeOption;
  routeObjective: RouteObjective;
  optimizeOrder: boolean;
  roundTrip: boolean;
  stops: TourStop[];
  totalDistanceMeters?: number;
  totalDurationMillis?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OfflineCachedTour {
  id: string;
  title: string;
  originName: string;
  originLat: number;
  originLng: number;
  radiusMiles: number;
  travelMode: TravelModeOption;
  routeObjective: RouteObjective;
  optimizeOrder: boolean;
  roundTrip: boolean;
  stops: TourStop[];
  route: ComputedTourRoute | null;
  cachedAt: number;
}

export interface UserPreferences {
  defaultRadiusMiles: number;
  preferredMapStyle: MapStyleId;
  voiceGuidanceEnabled: boolean;
}
