import { useEffect, useState } from 'react';
import { checkHealth } from './health';

type ServiceState = 'checking' | 'ready' | 'down';

export default function App() {
  const [service, setService] = useState<ServiceState>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    checkHealth(controller.signal).then(
      () => {
        if (!controller.signal.aborted) setService('ready');
      },
      () => {
        if (!controller.signal.aborted) setService('down');
      },
    );
    return () => controller.abort();
  }, [attempt]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="/"
          aria-label="CainCraft Outdoor Explorer home"
        >
          CainCraft <span>Outdoor Explorer</span>
        </a>
        <span className="region">Idaho · Oregon · Washington</span>
      </header>
      <main id="main">
        <section className="intro" aria-labelledby="title">
          <p className="eyebrow">A little farther outside</p>
          <h1 id="title">
            Find your next
            <br />
            place to explore.
          </h1>
          <p>
            Discover National Park Service places across Idaho, Oregon, and
            Washington. Start with a place. Make room for a detour.
          </p>
        </section>
        <section className="search-panel" aria-labelledby="search-title">
          <h2 id="search-title">Where will you go?</h2>
          <p id="coming-soon">
            Destination search is coming soon. This first preview checks the
            connection to our service.
          </p>
          <form
            onSubmit={(event) => event.preventDefault()}
            aria-describedby="coming-soon"
          >
            <div>
              <label htmlFor="state">State</label>
              <select id="state" defaultValue="all">
                <option value="all">All three states</option>
                <option value="ID">Idaho</option>
                <option value="OR">Oregon</option>
                <option value="WA">Washington</option>
              </select>
            </div>
            <div>
              <label htmlFor="query">Place or keyword</label>
              <input
                id="query"
                type="search"
                placeholder="Mountains, history, a familiar name…"
              />
            </div>
            <button type="submit" disabled>
              Search coming soon
            </button>
          </form>
          <div
            className={`service ${service}`}
            role="status"
            aria-live="polite"
          >
            {service === 'checking' && <p>Checking service connection…</p>}
            {service === 'ready' && (
              <p>Service connected. Destination search is on its way.</p>
            )}
            {service === 'down' && (
              <>
                <p>
                  Our exploration service is currently unavailable. Please try
                  again.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setService('checking');
                    setAttempt((value) => value + 1);
                  }}
                >
                  Retry connection
                </button>
              </>
            )}
          </div>
        </section>
        <aside className="field-note">
          <h2>Before you head out</h2>
          <p>
            Always check official park information for current conditions,
            access, and closures.
          </p>
          <a href="https://www.nps.gov/findapark/index.htm">
            Explore official NPS park information ↗
          </a>
        </aside>
      </main>
      <footer>
        CainCraft · An independent outdoor discovery project. Not affiliated
        with the National Park Service.
      </footer>
    </>
  );
}
