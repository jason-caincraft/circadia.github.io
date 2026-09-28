import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProximityFilter from './ProximityFilter';

describe('opt-in browser location', () => {
  it('does not request location until clicked and tolerates unsupported browsers', () => {
    vi.stubGlobal('navigator', {});
    const change = vi.fn();
    render(<ProximityFilter value={null} onChange={change} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Location is unavailable',
    );
    expect(change).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3])('keeps filters unchanged on location error %s', (code) => {
    const locate = vi.fn((_success, fail) => fail({ code }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: locate } });
    const change = vi.fn();
    render(<ProximityFilter value={null} onChange={change} />);
    expect(locate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      code === 1 ? 'permission was denied' : 'could not be found',
    );
    expect(change).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Use my location' }),
    ).toBeEnabled();
  });

  it('rejects invalid browser coordinates', () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 100, longitude: 0 },
          } as GeolocationPosition),
      },
    });
    const change = vi.fn();
    render(<ProximityFilter value={null} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getByRole('status')).toHaveTextContent('invalid location');
    expect(change).not.toHaveBeenCalled();
  });

  it('ignores a late position after the user cancels', () => {
    let success!: PositionCallback;
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (callback: PositionCallback) => {
          success = callback;
        },
      },
    });
    const change = vi.fn();
    render(<ProximityFilter value={null} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear location filter' }),
    );
    success({
      coords: { latitude: 45, longitude: -120 },
    } as GeolocationPosition);
    expect(change).toHaveBeenCalledExactlyOnceWith(null);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Proximity filter cleared',
    );
  });
});
