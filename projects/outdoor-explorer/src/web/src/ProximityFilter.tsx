import { useEffect, useRef, useState } from 'react';
import { validCoordinates, type Proximity } from './geography';

export default function ProximityFilter({
  value,
  onChange,
}: {
  value: Proximity | null;
  onChange: (value: Proximity | null) => void;
}) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );

  function locate() {
    if (!navigator.geolocation) {
      setMessage(
        'Location is unavailable in this browser. Continue with state, keyword, and activity filters.',
      );
      return;
    }
    const id = ++request.current;
    setPending(true);
    setMessage('Waiting for location permission…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (id !== request.current) return;
        setPending(false);
        const origin = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        if (!validCoordinates(origin)) {
          setMessage(
            'Your browser returned an invalid location. Proximity filtering was not enabled.',
          );
          return;
        }
        onChange({ origin, radiusKm: value?.radiusKm ?? 100 });
        setMessage(
          'Location enabled for this session. Distances are approximate.',
        );
      },
      (error) => {
        if (id !== request.current) return;
        setPending(false);
        setMessage(
          error.code === 1
            ? 'Location permission was denied. Continue with other filters.'
            : 'Your location could not be found. Try again or continue with other filters.',
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <fieldset className="proximity-filter">
      <legend>Optional proximity filter</legend>
      <p>
        Your location is used only in this browser session. It is not stored or
        added to shared links. Reloading clears it.
      </p>
      <button type="button" disabled={pending} onClick={locate}>
        Use my location
      </button>
      {(value || pending) && (
        <button
          type="button"
          onClick={() => {
            request.current++;
            setPending(false);
            onChange(null);
            setMessage('Proximity filter cleared.');
          }}
        >
          Clear location filter
        </button>
      )}
      {value && (
        <label>
          Approximate radius
          <select
            value={value.radiusKm}
            onChange={(event) =>
              onChange({ ...value, radiusKm: Number(event.target.value) })
            }
          >
            {[50, 100, 250, 500, 1000].map((radius) => (
              <option key={radius} value={radius}>
                {radius} km
              </option>
            ))}
          </select>
        </label>
      )}
      {message && <p role="status">{message}</p>}
      {value && (
        <p>
          Matches use straight-line distance to NPS property coordinates, not
          entrances or driving routes. Parks without valid coordinates are
          excluded while this filter is active.
        </p>
      )}
    </fieldset>
  );
}
