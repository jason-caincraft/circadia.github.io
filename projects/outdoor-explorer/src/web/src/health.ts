export async function checkHealth(signal: AbortSignal): Promise<void> {
  const response = await fetch(
    `${__API_BASE_URL__.replace(/\/$/, '')}/health`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      headers: { Accept: 'application/json' },
    },
  );
  if (!response.ok || (await response.json()).status !== 'ok') {
    throw new Error('Service unavailable');
  }
}
