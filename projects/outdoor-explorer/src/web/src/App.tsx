import { useEffect, useRef, useState } from 'react';
import {
  type DataResult,
  type Park,
  type Photo,
  parseSearch,
  states,
  useData,
} from './parks';

function ParkPhoto({ photo }: { photo?: Photo }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure>
      {photo && !failed ? (
        <>
          <img
            src={photo.url}
            alt={
              photo.altText ??
              photo.caption ??
              'Park photograph supplied by NPS'
            }
            loading="lazy"
            onError={() => setFailed(true)}
          />
          <figcaption>
            {photo.caption} Photo: {photo.credit || 'Credit not supplied'}.{' '}
            <a href={photo.sourceUrl}>NPS photo source</a>
          </figcaption>
        </>
      ) : (
        <div className="photo-placeholder">Photo unavailable</div>
      )}
    </figure>
  );
}
function Freshness({ result }: { result: DataResult<unknown> }) {
  return (
    <div className="service" role="status">
      {result.status === 'partial' && (
        <p>
          Results are incomplete. Some NPS destinations or information may be
          missing.
        </p>
      )}
      {result.status === 'stale' && (
        <p>
          Showing saved NPS information while updates are unavailable. Details
          may be out of date.
        </p>
      )}
      <p>
        Source: National Park Service · Retrieved{' '}
        {new Date(result.retrievedAt).toLocaleString()}
      </p>
    </div>
  );
}
function Hours({ hours }: { hours: Record<string, string> }) {
  return Object.keys(hours).length ? (
    <dl>
      {Object.entries(hours).map(([day, value]) => (
        <div key={day}>
          <dt>{day}</dt>
          <dd>{value || 'Hours not supplied'}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p>Hours not supplied by NPS.</p>
  );
}
function Details({ park }: { park: Park }) {
  return (
    <article>
      <h1>{park.name}</h1>
      <p>
        {park.designation ?? 'Designation not supplied'} ·{' '}
        {park.states.join(', ') || 'Location not supplied'}
      </p>
      <ParkPhoto key={park.photos[0]?.url ?? park.id} photo={park.photos[0]} />
      <p>{park.description ?? 'Description not supplied by NPS.'}</p>
      <h2>Activities</h2>
      {park.activities.length ? (
        <ul>
          {park.activities.map((a) => (
            <li key={a.id}>{a.name}</li>
          ))}
        </ul>
      ) : (
        <p>Activities not supplied by NPS.</p>
      )}
      <h2>Operating information</h2>
      {park.operatingInformation.length ? (
        park.operatingInformation.map((info, index) => (
          <section key={index}>
            <h3>{info.name ?? 'Park operations'}</h3>
            <p>
              {info.description ?? 'Operating description not supplied by NPS.'}
            </p>
            <Hours hours={info.standardHours} />
            {info.exceptions.map((exception, i) => (
              <section key={i}>
                <h4>{exception.name ?? 'Schedule exception'}</h4>
                <p>
                  {exception.startDate ?? 'Start date not supplied'} –{' '}
                  {exception.endDate ?? 'End date not supplied'}
                </p>
                <Hours hours={exception.hours} />
              </section>
            ))}
          </section>
        ))
      ) : (
        <p>Operating information not supplied by NPS.</p>
      )}
      <a href={park.officialUrl}>Visit the official NPS destination page ↗</a>
    </article>
  );
}
function Search({
  search,
  navigate,
}: {
  search: string;
  navigate: (query: string) => void;
}) {
  const parsed = parseSearch(search);
  const [selected, setSelected] = useState(parsed.selected);
  const [query, setQuery] = useState(parsed.q);
  const [activity, setActivity] = useState(parsed.activityId);
  const [attempt, setAttempt] = useState(0);
  const catalog = useData<Park[]>('/api/parks', attempt);
  const result = useData<Park[]>(
    parsed.invalid ? null : `/api/parks?${parsed.filters}`,
    attempt,
  );
  const activities = [
    ...new Map(
      (catalog?.data?.data ?? [])
        .flatMap((p) => p.activities)
        .map((a) => [a.id.toLowerCase(), a]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <section className="intro">
        <p className="eyebrow">A little farther outside</p>
        <h1>Find your next place to explore.</h1>
        <p>
          Discover National Park Service places across Idaho, Oregon, and
          Washington.
        </p>
      </section>
      <section className="search-panel" aria-labelledby="search-title">
        <h2 id="search-title">Where will you go?</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            navigate(
              `?${new URLSearchParams({ states: selected.join(','), q: query.trim(), activityId: activity })}`,
            );
          }}
        >
          <fieldset>
            <legend>States</legend>
            {states.map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={selected.includes(s)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, s]
                        : selected.filter((value) => value !== s),
                    )
                  }
                />
                {{ ID: 'Idaho', OR: 'Oregon', WA: 'Washington' }[s]}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="query">Place or keyword</label>
            <input
              id="query"
              type="search"
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="activity">Activity</label>
            <select
              id="activity"
              value={
                activities.find(
                  (a) => a.id.toLowerCase() === activity.toLowerCase(),
                )?.id ?? activity
              }
              onChange={(event) => setActivity(event.target.value)}
            >
              <option value="">All activities</option>
              {activity &&
                !activities.some(
                  (a) => a.id.toLowerCase() === activity.toLowerCase(),
                ) && (
                  <option value={activity}>
                    Activity from shared link (not in catalog)
                  </option>
                )}
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <button disabled={!selected.length}>Search destinations</button>
        </form>
        {!selected.length && <p role="status">Choose at least one state.</p>}
        {catalog?.error && (
          <p>
            Activity choices are unavailable.{' '}
            <button onClick={() => setAttempt((a) => a + 1)}>
              Retry activities
            </button>
          </p>
        )}
        {catalog?.data && catalog.data.status !== 'fresh' && (
          <p>Activity choices may be incomplete or out of date.</p>
        )}
        <a
          href="?"
          onClick={(event) => {
            event.preventDefault();
            navigate('?');
          }}
        >
          Reset filters
        </a>
      </section>
      {parsed.invalid ? (
        <p role="alert">
          This link contains invalid filters. Reset filters to continue.
        </p>
      ) : !result ? (
        <p role="status">Loading destinations…</p>
      ) : result.error ? (
        <div role="alert">
          <p>{result.error}</p>
          <button onClick={() => setAttempt((a) => a + 1)}>
            Retry destinations
          </button>
        </div>
      ) : (
        result.data && (
          <section aria-label="Destinations">
            <Freshness result={result.data} />
            <p role="status">{result.data.data.length} destinations found</p>
            {!result.data.data.length && (
              <p>
                No destinations match these filters. Try another state, keyword,
                or activity.
              </p>
            )}
            <div className="park-grid">
              {result.data.data.map((park) => {
                const href = `?${parsed.filters}&park=${encodeURIComponent(park.parkCode)}`;
                return (
                  <article className="park-card" key={park.id}>
                    <ParkPhoto photo={park.photos[0]} />
                    <div className="card-body">
                      <h2>
                        <a
                          href={href}
                          onClick={(event) => {
                            if (
                              !event.ctrlKey &&
                              !event.metaKey &&
                              !event.shiftKey &&
                              !event.altKey
                            ) {
                              event.preventDefault();
                              navigate(href);
                            }
                          }}
                        >
                          {park.name}
                        </a>
                      </h2>
                      <p className="eyebrow">
                        {park.designation ?? 'Designation not supplied'}
                      </p>
                      <p>{park.states.join(', ') || 'Location not supplied'}</p>
                      <p className="summary">
                        {park.description ?? 'Description not supplied by NPS.'}
                      </p>
                      <a href={park.officialUrl}>Official NPS page ↗</a>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )
      )}
    </>
  );
}
function Destination({
  search,
  navigate,
}: {
  search: string;
  navigate: (query: string) => void;
}) {
  const parsed = parseSearch(search);
  const [attempt, setAttempt] = useState(0);
  const result = useData<Park>(
    parsed.invalid ? null : `/api/parks/${parsed.park}`,
    attempt,
  );
  const back = `?${parsed.filters}`;
  return (
    <>
      <a
        href={back}
        onClick={(event) => {
          event.preventDefault();
          navigate(back);
        }}
      >
        ← Back to destinations
      </a>
      {parsed.invalid ? (
        <p role="alert">
          This link contains invalid parameters.{' '}
          <a
            href="?"
            onClick={(event) => {
              event.preventDefault();
              navigate('?');
            }}
          >
            Reset filters
          </a>
        </p>
      ) : !result ? (
        <p role="status">Loading destination…</p>
      ) : result.error ? (
        <div role="alert">
          <p>{result.error}</p>
          <button onClick={() => setAttempt((a) => a + 1)}>
            Retry destination
          </button>
        </div>
      ) : (
        result.data && (
          <>
            <Details park={result.data.data} />
            <Freshness result={result.data} />
          </>
        )
      )}
    </>
  );
}
export default function App() {
  const [search, setSearch] = useState(window.location.search);
  const main = useRef<HTMLElement>(null);
  function navigate(query: string) {
    window.history.pushState(null, '', query);
    setSearch(window.location.search);
    main.current?.focus();
  }
  useEffect(() => {
    function pop() {
      setSearch(window.location.search);
      main.current?.focus();
    }
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="?"
          onClick={(event) => {
            event.preventDefault();
            navigate('?');
          }}
        >
          CainCraft <span>Outdoor Explorer</span>
        </a>
        <span className="region">Idaho · Oregon · Washington</span>
      </header>
      <main id="main" ref={main} tabIndex={-1}>
        {parseSearch(search).park ? (
          <Destination key={search} search={search} navigate={navigate} />
        ) : (
          <Search key={search} search={search} navigate={navigate} />
        )}
        <aside className="field-note">
          <h2>Before you head out</h2>
          <p>
            Check official park information for current conditions, access, and
            closures. Listed activities do not establish current access.
          </p>
          <a href="https://www.nps.gov/findapark/index.htm">
            Explore official NPS park information ↗
          </a>
        </aside>
      </main>
      <footer>
        Data and credited photographs: National Park Service. No claim to
        original U.S. Government works.
        <br />
        CainCraft · An independent outdoor discovery project. Not affiliated
        with the National Park Service.
      </footer>
    </>
  );
}
