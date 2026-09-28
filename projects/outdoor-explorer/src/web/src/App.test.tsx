import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import App from './App';
import { envelope, hiking, park, secondPark } from './parks.fixtures';
import { parseSearch } from './parks';

function mockApi() {
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname.endsWith('/crla')) return Response.json(envelope(park));
    if (url.pathname.endsWith('/nepe'))
      return Response.json(envelope(secondPark));
    if (url.pathname !== '/api/parks') return new Response('', { status: 404 });
    let parks = [park, secondPark];
    const states = url.searchParams.get('states')?.split(',');
    const q = url.searchParams.get('q')?.toLowerCase();
    const activityId = url.searchParams.get('activityId');
    if (states)
      parks = parks.filter((p) => p.states.some((s) => states.includes(s)));
    if (q)
      parks = parks.filter((p) =>
        `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q),
      );
    if (activityId)
      parks = parks.filter((p) =>
        p.activities.some((a) => a.id === activityId),
      );
    return Response.json(envelope(parks));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
beforeEach(() => {
  window.history.replaceState(null, '', '/');
});
describe('destination explorer', () => {
  it('loads NPS cards and activity choices from fixtures', async () => {
    mockApi();
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading destinations',
    );
    expect(
      await screen.findByRole('link', { name: park.name }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hiking' })).toBeInTheDocument();
    expect(screen.getByText('ID, OR, WA, MT')).toBeInTheDocument();
    expect(screen.getAllByText('Photo unavailable')).toHaveLength(2);
  });
  it('combines filters in the URL and preserves them through details and back', async () => {
    mockApi();
    render(<App />);
    await screen.findByRole('option', { name: 'Hiking' });
    fireEvent.click(screen.getByLabelText('Idaho'));
    fireEvent.change(screen.getByLabelText('Place or keyword'), {
      target: { value: 'lake' },
    });
    fireEvent.change(screen.getByLabelText('Activity'), {
      target: { value: hiking.id },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Search destinations' }),
    );
    expect(new URLSearchParams(window.location.search).get('states')).toBe(
      'OR,WA',
    );
    expect(new URLSearchParams(window.location.search).get('q')).toBe('lake');
    fireEvent.click(await screen.findByRole('link', { name: park.name }));
    expect(
      await screen.findByRole('heading', { name: park.name }),
    ).toBeInTheDocument();
    expect(screen.getByText('Winter closure')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /Back to destinations/ }));
    await screen.findByRole('link', { name: park.name });
    expect(screen.getByLabelText('Place or keyword')).toHaveValue('lake');
    expect(screen.getByLabelText('Activity')).toHaveValue(hiking.id);
    expect(screen.getByLabelText('Idaho')).not.toBeChecked();
  });
  it('loads a shared detail URL and labels missing information', async () => {
    window.history.replaceState(null, '', '?states=ID&park=nepe');
    mockApi();
    render(<App />);
    expect(
      await screen.findByText('Activities not supplied by NPS.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Operating information not supplied by NPS.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Description not supplied by NPS.'),
    ).toBeInTheDocument();
  });
  it('restores filters on browser history navigation', async () => {
    mockApi();
    render(<App />);
    await screen.findByRole('link', { name: park.name });
    window.history.pushState(null, '', '?states=WA&q=history');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(screen.getByLabelText('Washington')).toBeChecked();
    expect(screen.getByLabelText('Oregon')).not.toBeChecked();
    expect(screen.getByLabelText('Place or keyword')).toHaveValue('history');
    await screen.findByText(/No destinations match/);
  });
  it.each([
    '?states=XX',
    '?states=',
    '?q=' + 'x'.repeat(201),
    '?activityId=bad',
    '?park=../bad',
    '?states=ID&states=WA',
  ])('rejects invalid shared parameters: %s', async (search) => {
    window.history.replaceState(null, '', search);
    const fetch = mockApi();
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid/);
    expect(fetch.mock.calls.every(([url]) => url.endsWith('/api/parks'))).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Reset filters' }));
  });
  it('shows empty results and supports resetting filters', async () => {
    window.history.replaceState(null, '', '?q=nonexistent');
    mockApi();
    render(<App />);
    expect(
      await screen.findByText(/No destinations match/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Reset filters' }));
    expect(
      await screen.findByRole('link', { name: park.name }),
    ).toBeInTheDocument();
  });
  it.each([503, 429])('recovers from API failure %s', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status })),
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    mockApi();
    fireEvent.click(screen.getByRole('button', { name: 'Retry destinations' }));
    expect(
      await screen.findByRole('link', { name: park.name }),
    ).toBeInTheDocument();
  });
  it.each(['stale', 'partial'] as const)(
    'labels %s results',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementation(async () =>
            Response.json(envelope([park], status)),
          ),
      );
      render(<App />);
      expect(
        await screen.findByText(
          status === 'stale' ? /Showing saved NPS/ : /Results are incomplete/,
        ),
      ).toBeInTheDocument();
    },
  );
  it('credits approved photos and replaces broken images', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        Response.json(
          envelope([
            {
              ...park,
              photos: [
                {
                  url: 'https://www.nps.gov/test.jpg',
                  credit: 'NPS / Example',
                  caption: 'Lake view',
                  altText: 'Blue lake',
                  sourceUrl: park.officialUrl,
                },
              ],
            },
          ]),
        ),
      ),
    );
    render(<App />);
    const img = await screen.findByRole('img', { name: 'Blue lake' });
    expect(screen.getByText(/NPS \/ Example/)).toBeInTheDocument();
    fireEvent.error(img);
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument();
  });
  it('shows a missing destination without disguising it as empty results', async () => {
    window.history.replaceState(null, '', '?park=xxxx');
    mockApi();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not found');
  });
  it('cancels obsolete requests when navigating away', async () => {
    const signals: AbortSignal[] = [];
    const fetch = vi.fn((_input: string, options: RequestInit) => {
      signals.push(options.signal as AbortSignal);
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetch);
    const view = render(<App />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    view.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
describe('URL contract', () => {
  it('normalizes states and accepts UUID activity IDs', () => {
    const result = parseSearch(`?states=or,ID,or&activityId=${hiking.id}`);
    expect(result.selected).toEqual(['OR', 'ID']);
    expect(result.invalid).toBe(false);
  });
});
