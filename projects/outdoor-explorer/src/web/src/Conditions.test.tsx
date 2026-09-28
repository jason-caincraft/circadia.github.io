import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import Conditions from './Conditions';
import { envelope, park } from './parks.fixtures';

it('distinguishes loading, failure and empty feeds and recovers independently', async () => {
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetch = vi.fn((url: string) =>
    url.endsWith('/alerts')
      ? pending
      : Promise.resolve(Response.json(envelope([]))),
  );
  vi.stubGlobal('fetch', fetch);
  render(<Conditions park={park} />);
  expect(screen.getByText('Loading visitor alerts…')).toBeInTheDocument();
  await screen.findByText('No road events returned by NPS for this park.');
  resolve(new Response('', { status: 503 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Visitor alerts temporarily unavailable',
  );
  expect(
    screen.queryByText('No alerts returned by NPS for this park.'),
  ).not.toBeInTheDocument();
  fetch.mockImplementation(async () => Response.json(envelope([])));
  fireEvent.click(screen.getByRole('button', { name: 'Retry visitor alerts' }));
  await screen.findByText('No alerts returned by NPS for this park.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('renders provider text literally and labels missing provider dates', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        envelope([
          {
            id: 'fixture',
            parkCode: park.parkCode,
            title: '<script>unsafe</script>',
            category: 'Caution',
            description: '<b>Provider text</b>',
            sourceUrl: park.officialUrl,
            providerDate: null,
            dateLabel: 'Provider last indexed',
          },
        ]),
      ),
    ),
  );
  const { container } = render(<Conditions park={park} />);
  expect(await screen.findAllByText('<script>unsafe</script>')).toHaveLength(2);
  expect(container.querySelector('script')).toBeNull();
  expect(screen.getAllByText('Provider date not supplied.')).toHaveLength(2);
});
