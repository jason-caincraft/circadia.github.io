import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

describe('service connection', () => {
  it('shows a connected state after the health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"status":"ok"}')),
    );
    render(<App />);
    expect(await screen.findByText(/Service connected/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search coming soon' }),
    ).toBeDisabled();
  });
  it.each([
    () => Promise.reject(new TypeError('network down')),
    () => Promise.resolve(new Response('{}', { status: 503 })),
    () => Promise.resolve(new Response('<html>wrong server</html>')),
    () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
  ])('shows unavailable and recovers through retry', async (failure) => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(failure)
      .mockResolvedValue(new Response('{"status":"ok"}'));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(
      await screen.findByText(/currently unavailable/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(await screen.findByText(/Service connected/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
