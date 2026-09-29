import { useState } from 'react';
import { type Park, useData } from './parks';

type Campground = {
  id: string;
  parkCode: string;
  parkName: string;
  name: string;
  description: string | null;
  location: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  fees: string[];
  reservationDescription: string | null;
  reservationUrl: string | null;
  officialUrl: string;
  siteTypes: { name: string; count: number }[];
  totalSites: number | null;
  siteTypesProvided: boolean;
  amenities: { name: string; detail: string }[];
  amenitiesProvided: boolean;
  providerDate: string | null;
};

export default function Campgrounds({ park }: { park: Park }) {
  const [attempt, retry] = useState(0);
  const [amenity, setAmenity] = useState('');
  const [siteType, setSiteType] = useState('');
  const result = useData<Campground[]>(
    `/api/parks/${park.parkCode}/campgrounds`,
    attempt,
  );
  const camps = result?.data?.data ?? [];
  const amenities = [
    ...new Set(camps.flatMap((camp) => camp.amenities.map((a) => a.name))),
  ].sort();
  const siteTypes = [
    ...new Set(camps.flatMap((camp) => camp.siteTypes.map((s) => s.name))),
  ].sort();
  const visible = camps.filter(
    (camp) =>
      (!amenity || camp.amenities.some((item) => item.name === amenity)) &&
      (!siteType || camp.siteTypes.some((item) => item.name === siteType)),
  );
  return (
    <section aria-label="Campgrounds">
      <h2>Campgrounds</h2>
      <p>
        NPS campground records describe site inventory, not current
        availability. Counts and fees may change. Check official booking
        information and park conditions before planning a stay. A primitive site
        classification does not indicate crowd levels.
      </p>
      {!result && <p role="status">Loading campgrounds…</p>}
      {result?.error && (
        <div role="alert">
          <p>
            Campgrounds temporarily unavailable. Check the official NPS park
            page.
          </p>
          <button onClick={() => retry((value) => value + 1)}>
            Retry campgrounds
          </button>
        </div>
      )}
      {result?.data && (
        <>
          <p role="status">
            Data: National Park Service · Retrieved{' '}
            {new Date(result.data.retrievedAt).toLocaleString()}
          </p>
          {camps.length === 0 ? (
            <p>No campgrounds returned by NPS for this park.</p>
          ) : (
            <>
              <div className="campground-filters">
                <label>
                  Amenity
                  <select
                    value={amenity}
                    onChange={(event) => setAmenity(event.target.value)}
                  >
                    <option value="">Any documented amenity</option>
                    {amenities.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Site type
                  <select
                    value={siteType}
                    onChange={(event) => setSiteType(event.target.value)}
                  >
                    <option value="">Any documented site type</option>
                    {siteTypes.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p role="status">
                Showing {visible.length} of {camps.length} NPS campgrounds.
              </p>
              {visible.length === 0 && (
                <p>No campgrounds match these documented features.</p>
              )}
              <div className="campground-list">
                {visible.map((camp) => (
                  <article key={camp.id} className="campground-card">
                    <h3>{camp.name}</h3>
                    <p>
                      {camp.description ?? 'Description not supplied by NPS.'}
                    </p>
                    <dl>
                      <div>
                        <dt>Location</dt>
                        <dd>
                          {camp.location ??
                            (camp.coordinates
                              ? `${camp.coordinates.latitude}, ${camp.coordinates.longitude}`
                              : 'Location not supplied by NPS.')}
                        </dd>
                      </div>
                      <div>
                        <dt>Total sites</dt>
                        <dd>
                          {camp.totalSites ?? 'Site count not supplied by NPS.'}
                        </dd>
                      </div>
                      <div>
                        <dt>Site types</dt>
                        <dd>
                          {camp.siteTypes.length
                            ? camp.siteTypes
                                .map((site) => `${site.name}: ${site.count}`)
                                .join(', ')
                            : camp.siteTypesProvided
                              ? 'No positive site type counts reported by NPS.'
                              : 'Site types not supplied by NPS.'}
                        </dd>
                      </div>
                      <div>
                        <dt>Amenities</dt>
                        <dd>
                          {camp.amenities.length
                            ? camp.amenities
                                .map((item) => `${item.name}: ${item.detail}`)
                                .join('; ')
                            : camp.amenitiesProvided
                              ? 'No available amenities documented by NPS.'
                              : 'Amenities not supplied by NPS.'}
                        </dd>
                      </div>
                      <div>
                        <dt>Fees</dt>
                        <dd>
                          {camp.fees.length
                            ? camp.fees.join('; ')
                            : 'Fees not supplied by NPS. Check the official source.'}
                        </dd>
                      </div>
                      <div>
                        <dt>Reservations</dt>
                        <dd>
                          {camp.reservationDescription ??
                            'Reservation details not supplied by NPS.'}
                        </dd>
                      </div>
                    </dl>
                    {camp.reservationUrl && (
                      <p>
                        <a
                          href={camp.reservationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Official booking information for {camp.name}
                        </a>
                      </p>
                    )}
                    <p>
                      <a href={camp.officialUrl}>
                        NPS park information for {camp.name}
                      </a>
                    </p>
                    <p>
                      {camp.providerDate
                        ? `Provider last indexed: ${camp.providerDate}`
                        : 'Provider date not supplied.'}
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
