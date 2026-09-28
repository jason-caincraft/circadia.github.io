import { describe, expect, it } from 'vitest';
import { distanceKm, nearbyParks, validCoordinates } from './geography';
import { park, secondPark } from './parks.fixtures';

describe('geographic filtering', () => {
  it.each([
    null,
    { latitude: NaN, longitude: 10 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 },
    { latitude: 0, longitude: Infinity },
  ])('rejects missing and invalid coordinates: %s', (point) => {
    expect(validCoordinates(point)).toBe(false);
  });
  it('accepts zero and boundary coordinates without inventing positions', () => {
    expect(validCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
    expect(validCoordinates({ latitude: -90, longitude: 180 })).toBe(true);
  });
  it('computes approximate great-circle distances including antimeridian and antipodes', () => {
    expect(
      distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }),
    ).toBeCloseTo(111.195, 2);
    expect(
      distanceKm(
        { latitude: 0, longitude: 179 },
        { latitude: 0, longitude: -179 },
      ),
    ).toBeCloseTo(222.39, 2);
    expect(
      distanceKm(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 180 },
      ),
    ).toBeCloseTo(20015.09, 1);
  });
  it('keeps missing coordinates without proximity; excludes them only when enabled', () => {
    const located = { ...park, coordinates: { latitude: 0, longitude: 1 } };
    const parks = [located, secondPark];
    expect(nearbyParks(parks, null)).toEqual(parks);
    expect(
      nearbyParks(parks, {
        origin: { latitude: 0, longitude: 0 },
        radiusKm: 100,
      }),
    ).toEqual([]);
    expect(
      nearbyParks(parks, {
        origin: { latitude: 0, longitude: 0 },
        radiusKm: 250,
      }),
    ).toEqual([located]);
  });
});
