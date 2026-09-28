import { useEffect, useState } from 'react';

export type Photo = {
  url: string;
  credit: string;
  caption: string | null;
  altText: string | null;
  sourceUrl: string;
};
export type Park = {
  id: string;
  provider: string;
  providerId: string;
  parkCode: string;
  name: string;
  designation: string | null;
  states: string[];
  coordinates: { latitude: number; longitude: number } | null;
  description: string | null;
  officialUrl: string;
  activities: { id: string; name: string }[];
  photos: Photo[];
  retrievedAt: string;
  operatingInformation: {
    name: string | null;
    description: string | null;
    standardHours: Record<string, string>;
    exceptions: {
      name: string | null;
      startDate: string | null;
      endDate: string | null;
      hours: Record<string, string>;
    }[];
  }[];
};
export type DataResult<T> = {
  data: T;
  status: 'fresh' | 'stale' | 'partial';
  retrievedAt: string;
  warnings: string[];
};
export const states = ['ID', 'OR', 'WA'];
export function parseSearch(search: string) {
  const params = new URLSearchParams(search);
  const selected = [
    ...new Set(
      (params.get('states') ?? states.join(','))
        .split(',')
        .map((s) => s.trim().toUpperCase()),
    ),
  ];
  const q = (params.get('q') ?? '').trim();
  const activityId = (params.get('activityId') ?? '').trim();
  const park = (params.get('park') ?? '').trim().toLowerCase();
  const invalid =
    selected.some((s) => !states.includes(s)) ||
    q.length > 200 ||
    (activityId !== '' &&
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(activityId)) ||
    (park !== '' && !/^[a-z0-9]{4,10}$/.test(park)) ||
    ['states', 'q', 'activityId', 'park'].some(
      (key) => params.getAll(key).length > 1,
    );
  const filters = new URLSearchParams({
    states: selected.join(','),
    q,
    activityId,
  });
  return { selected, q, activityId, park, invalid, filters };
}
export function useData<T>(path: string | null, attempt: number) {
  const [result, setResult] = useState<{
    key: string;
    data?: DataResult<T>;
    error?: string;
  }>();
  const key = `${path}:${attempt}`;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    fetch(`${__API_BASE_URL__.replace(/\/$/, '')}${path}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]),
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? 'This destination was not found in the regional catalog.'
              : response.status === 429
                ? 'Too many requests. Please wait a minute and try again.'
                : 'Park data is temporarily unavailable. Please try again.',
          );
        const data = (await response.json()) as DataResult<T>;
        if (
          !data ||
          !['fresh', 'stale', 'partial'].includes(data.status) ||
          !data.data ||
          !Array.isArray(data.warnings)
        )
          throw new Error(
            'Park data is temporarily unavailable. Please try again.',
          );
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              error instanceof Error &&
              !['TypeError', 'SyntaxError', 'TimeoutError'].includes(error.name)
                ? error.message
                : 'Park data is temporarily unavailable. Please try again.',
          });
      });
    return () => controller.abort();
  }, [path, attempt, key]);
  return result?.key === key ? result : undefined;
}
