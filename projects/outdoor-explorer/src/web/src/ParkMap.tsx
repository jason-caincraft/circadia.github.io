import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Park } from './parks';
import { validCoordinates } from './geography';

export default function ParkMap({
  parks,
  filters,
  navigate,
}: {
  parks: Park[];
  filters: string;
  navigate: (query: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState('');
  const mapped = parks.filter((park) => validCoordinates(park.coordinates));
  useEffect(() => {
    if (
      !container.current ||
      !parks.some((park) => validCoordinates(park.coordinates))
    )
      return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    import('leaflet')
      .then((L) => {
        if (disposed || !container.current) return;
        const map = L.map(container.current, { scrollWheelZoom: false });
        cleanup = () => map.remove();
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          referrerPolicy: 'strict-origin-when-cross-origin',
        })
          .on('tileerror', () => {
            if (!disposed)
              setFailure(
                'Map tiles are unavailable. Markers and the destination list remain usable.',
              );
          })
          .addTo(map);
        const bounds = L.latLngBounds([]);
        for (const park of parks) {
          if (!validCoordinates(park.coordinates)) continue;
          const point: [number, number] = [
            park.coordinates.latitude,
            park.coordinates.longitude,
          ];
          bounds.extend(point);
          const popup = document.createElement('div');
          const link = document.createElement('a');
          link.textContent = `View ${park.name}`;
          link.href = `?${filters}&park=${encodeURIComponent(park.parkCode)}`;
          link.addEventListener('click', (event) => {
            if (
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              navigate(link.getAttribute('href')!);
            }
          });
          const location = document.createElement('p');
          location.textContent = `${park.states.join(', ')} · Approximate NPS property location`;
          popup.append(link, location);
          const marker = L.marker(point, {
            icon: L.divIcon({
              className: 'park-marker',
              html: '<span aria-hidden="true">●</span>',
              iconSize: [28, 28],
            }),
            title: park.name,
            alt: `Map marker: ${park.name}`,
            keyboard: true,
          });
          // Leaflet creates the icon only when the map first receives a view.
          marker.on('add', () => {
            marker
              .getElement()
              ?.setAttribute('aria-label', `Map marker: ${park.name}`);
          });
          marker.bindPopup(popup).addTo(map);
        }
        map.fitBounds(bounds, {
          padding: [30, 30],
          maxZoom: 10,
          animate: false,
        });
        const resize = new ResizeObserver(() => map.invalidateSize());
        resize.observe(container.current);
        cleanup = () => {
          resize.disconnect();
          map.remove();
        };
      })
      .catch(() => {
        cleanup?.();
        cleanup = undefined;
        if (!disposed)
          setFailure('The map could not load. Use the destination list below.');
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [parks, filters, navigate]);

  return (
    <section aria-label="Park map" className="map-panel">
      <h2>Map of matching destinations</h2>
      <p>
        {mapped.length} mapped; {parks.length - mapped.length} without valid
        coordinates. Multi-state parks have one marker at their NPS property
        location, which may be outside the selected state.
      </p>
      <p>
        Locations are approximate and are not verified entrances.{' '}
        <a href="#destination-list">Browse the equivalent destination list</a>.
      </p>
      {failure && <p role="status">{failure}</p>}
      {mapped.length ? (
        <div
          ref={container}
          className="park-map"
          role="group"
          aria-label="Interactive park map"
        />
      ) : (
        <p role="status">
          No matching destinations have valid map coordinates.
        </p>
      )}
      <p>
        Map data: ©{' '}
        <a href="https://www.openstreetmap.org/copyright">
          OpenStreetMap contributors
        </a>
        .{' '}
        <a href="https://www.openstreetmap.org/fixthemap">Report a map issue</a>
        .
      </p>
    </section>
  );
}
