import { useState } from 'react';
import { type Park, useData } from './parks';

type Notice = {
  id: string;
  parkCode: string;
  category: string;
  title: string;
  description: string | null;
  sourceUrl: string;
  providerDate: string | null;
  dateLabel: string;
};

function Feed({ park, roads }: { park: Park; roads: boolean }) {
  const [attempt, retry] = useState(0);
  const label = roads ? 'Road events' : 'Visitor alerts';
  const result = useData<Notice[]>(
    `/api/parks/${park.parkCode}/${roads ? 'road-events' : 'alerts'}`,
    attempt,
  );
  return (
    <section aria-label={label}>
      <h3>{label}</h3>
      {!result && <p role="status">Loading {label.toLowerCase()}…</p>}
      {result?.error && (
        <div role="alert">
          <p>{label} temporarily unavailable. Check the official NPS source.</p>
          <button onClick={() => retry((value) => value + 1)}>
            Retry {label.toLowerCase()}
          </button>
        </div>
      )}
      {result?.data && (
        <>
          <p role="status">
            Data: National Park Service · Retrieved{' '}
            {new Date(result.data.retrievedAt).toLocaleString()}
          </p>
          {result.data.data.length === 0 ? (
            <p>
              No {roads ? 'road events' : 'alerts'} returned by NPS for this
              park.
            </p>
          ) : (
            result.data.data.map((notice) => (
              <article key={notice.id}>
                <h4>{notice.title}</h4>
                <p>{notice.category}</p>
                <p>
                  {notice.description ?? 'Description not supplied by NPS.'}
                </p>
                <p>
                  {notice.providerDate
                    ? `${notice.dateLabel}: ${notice.providerDate}`
                    : 'Provider date not supplied.'}
                </p>
                <a href={notice.sourceUrl}>NPS source: {notice.title}</a>
              </article>
            ))
          )}
        </>
      )}
    </section>
  );
}

export default function Conditions({ park }: { park: Park }) {
  return (
    <section aria-label="Alerts and road events">
      <h2>Alerts and road events</h2>
      <p>
        NPS feeds may be delayed or incomplete. Missing alerts or road events do
        not mean safe travel or open roads. Confirm current access with the park
        before visiting.
      </p>
      <a href={park.officialUrl}>
        Check official NPS conditions for {park.name}
      </a>
      <Feed key={`${park.parkCode}:alerts`} park={park} roads={false} />
      <Feed key={`${park.parkCode}:roads`} park={park} roads />
    </section>
  );
}
