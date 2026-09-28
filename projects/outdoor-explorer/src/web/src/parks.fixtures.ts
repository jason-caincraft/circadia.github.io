import type { DataResult, Park } from './parks';
// Synthetic normalized API fixtures. No provider requests or third-party images.
export const hiking = {
  id: 'B33DC9B6-0B7D-4322-BAD7-A13A34C584A3',
  name: 'Hiking',
};
export const park: Park = {
  id: 'nps:crla',
  provider: 'nps',
  providerId: 'fixture-crla',
  parkCode: 'crla',
  name: 'Crater Lake National Park',
  designation: 'National Park',
  states: ['OR'],
  coordinates: null,
  description: 'A deep lake in a volcanic landscape.',
  officialUrl: 'https://www.nps.gov/crla/',
  activities: [hiking],
  photos: [],
  operatingInformation: [
    {
      name: 'Visitor center',
      description: 'Seasonal hours.',
      standardHours: { monday: '9 AM – 5 PM' },
      exceptions: [
        {
          name: 'Winter closure',
          startDate: '2026-12-01',
          endDate: null,
          hours: { monday: 'Closed' },
        },
      ],
    },
  ],
  retrievedAt: '2026-09-26T12:00:00Z',
};
export const secondPark: Park = {
  ...park,
  id: 'nps:nepe',
  providerId: 'fixture-nepe',
  parkCode: 'nepe',
  name: 'Nez Perce National Historical Park',
  designation: null,
  states: ['ID', 'OR', 'WA', 'MT'],
  description: null,
  activities: [],
  operatingInformation: [],
  officialUrl: 'https://www.nps.gov/nepe/',
};
export function envelope<T>(
  data: T,
  status: DataResult<T>['status'] = 'fresh',
): DataResult<T> {
  return { data, status, retrievedAt: park.retrievedAt, warnings: [] };
}
