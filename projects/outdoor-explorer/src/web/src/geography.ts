import type { Park } from './parks';

export type Coordinates = NonNullable<Park['coordinates']>;
export type Proximity = { origin: Coordinates; radiusKm: number };

export function validCoordinates(
  value: Park['coordinates'],
): value is Coordinates {
  return (
    !!value &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  );
}

// Great-circle distance to a provider-reported point, never driving distance.
export function distanceKm(a: Coordinates, b: Coordinates) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const h =
    Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function nearbyParks(parks: Park[], proximity: Proximity | null) {
  return proximity
    ? parks.filter(
        (park) =>
          validCoordinates(park.coordinates) &&
          distanceKm(proximity.origin, park.coordinates) <= proximity.radiusKm,
      )
    : parks;
}
