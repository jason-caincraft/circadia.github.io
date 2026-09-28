using System.Text.Json;
using System.Collections.Concurrent;

namespace OutdoorExplorer.Api.Parks;

public sealed record VisitorNotice(string Id, string ParkCode, string Category, string Title, string? Description,
    string SourceUrl, string? ProviderDate, string DateLabel);

public interface INpsConditionsProvider
{
    Task<DataResult<VisitorNotice[]>> GetConditionsAsync(Park park, bool roads, CancellationToken token);
}

public sealed partial class NpsProvider
{
    public async Task<DataResult<VisitorNotice[]>> GetConditionsAsync(Park park, bool roads, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(options.Value.ApiKey)) throw new NpsUnavailableException();
        if (roads && park.ParkCode.Length != 4) throw new NpsUnavailableException();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(token);
        budget.CancelAfter(options.Value.RequestBudget);
        var retrieved = clock.GetUtcNow();
        var notices = new Dictionary<string, VisitorNotice>();
        try
        {
            if (roads)
            {
                // RoadEvents is GeoJSON, not the paginated alerts envelope. No pagination is documented.
                using var page = await FetchPageAsync($"roadevents?parkCode={Uri.EscapeDataString(park.ParkCode)}", budget.Token);
                var root = page.RootElement;
                if (ParkMapper.Text(root, "type") != "FeatureCollection" || !root.TryGetProperty("features", out var features) || features.ValueKind != JsonValueKind.Array)
                    throw new NpsUnavailableException();
                foreach (var raw in features.EnumerateArray())
                {
                    if (!raw.TryGetProperty("properties", out var properties) || !properties.TryGetProperty("core_details", out var core)) throw new NpsUnavailableException();
                    // The contract has no feature parkCode. Verify its source against this park
                    // as well as issuing a single-park filter; never infer membership from geometry.
                    if (!root.TryGetProperty("road_event_feed_info", out var info) || !info.TryGetProperty("data_sources", out var sources) || sources.ValueKind != JsonValueKind.Array)
                        throw new NpsUnavailableException();
                    var sourceId = ParkMapper.Text(core, "data_source_id");
                    if (sourceId is null) throw new NpsUnavailableException();
                    var source = sources.EnumerateArray().FirstOrDefault(s => ParkMapper.Text(s, "data_source_id") == sourceId &&
                        string.Equals(ParkMapper.Text(s, "organization_name"), park.Name, StringComparison.OrdinalIgnoreCase));
                    if (source.ValueKind == JsonValueKind.Undefined) throw new NpsUnavailableException();
                    Add(raw, core, "name", "event_type", park.OfficialUrl, ParkMapper.Text(source, "update_date"), "Provider source updated");
                }
            }
            else
            {
                int start = 0;
                int? total = null;
                for (var pageNumber = 0; pageNumber < 100; pageNumber++)
                {
                    using var page = await FetchPageAsync($"alerts?parkCode={Uri.EscapeDataString(park.ParkCode)}&limit=50&start={start}", budget.Token);
                    var root = page.RootElement;
                    if (!int.TryParse(ParkMapper.Text(root, "total"), out var count) || count < 0 ||
                        !int.TryParse(ParkMapper.Text(root, "start"), out var offset) || offset != start ||
                        (total.HasValue && total != count) || !root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                        throw new NpsUnavailableException();
                    total = count;
                    var before = notices.Count;
                    foreach (var raw in data.EnumerateArray())
                    {
                        if (!string.Equals(ParkMapper.Text(raw, "parkCode"), park.ParkCode, StringComparison.OrdinalIgnoreCase)) throw new NpsUnavailableException();
                        Add(raw, raw, "title", "category", OfficialLink(ParkMapper.Text(raw, "url"), park.OfficialUrl), ParkMapper.Text(raw, "lastIndexedDate"), "Provider last indexed");
                    }
                    start += data.GetArrayLength();
                    if (start == count) break;
                    if (start > count || notices.Count == before || pageNumber == 99) throw new NpsUnavailableException();
                }
            }
            return new(notices.Values.ToArray(), "fresh", retrieved, []);
        }
        catch (Exception ex) when (ex is JsonException or HttpRequestException or OperationCanceledException or InvalidOperationException)
        {
            token.ThrowIfCancellationRequested();
            throw new NpsUnavailableException();
        }

        void Add(JsonElement raw, JsonElement content, string titleKey, string categoryKey, string url, string? date, string dateLabel)
        {
            var id = ParkMapper.Text(raw, "id");
            var title = ParkMapper.Text(content, titleKey);
            if (id is null || title is null) throw new NpsUnavailableException();
            notices.TryAdd(id, new(id, park.ParkCode, ParkMapper.Text(content, categoryKey) ?? "Unspecified", title,
                ParkMapper.Text(content, "description"), url, date, dateLabel));
        }
    }

    private static string OfficialLink(string? url, string fallback) => Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
        uri.Scheme == "https" && uri.UserInfo.Length == 0 && (uri.Host == "nps.gov" || uri.Host.EndsWith(".nps.gov", StringComparison.OrdinalIgnoreCase)) ? url! : fallback;
}

public sealed class ConditionsService(INpsConditionsProvider provider, TimeProvider clock) : IDisposable
{
    private readonly SemaphoreSlim upstreamSlots = new(4, 4);
    private readonly ConcurrentDictionary<(string, bool), SemaphoreSlim> gates = new();
    private readonly ConcurrentDictionary<(string, bool), (DataResult<VisitorNotice[]>? Result, DateTimeOffset Expires)> cache = new();

    public async Task<DataResult<VisitorNotice[]>> GetAsync(Park park, bool roads, CancellationToken token)
    {
        var key = (park.ParkCode, roads);
        var gate = gates.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(token);
        try
        {
            var now = clock.GetUtcNow();
            if (cache.TryGetValue(key, out var saved) && now < saved.Expires)
                return saved.Result ?? throw new NpsUnavailableException();
            // Only regional catalog parks reach this cache; feeds refresh independently.
            try
            {
                // Bound cross-park traffic without queuing beyond the provider time budget.
                if (!await upstreamSlots.WaitAsync(TimeSpan.Zero, token)) throw new NpsUnavailableException();
                try
                {
                    var result = await provider.GetConditionsAsync(park, roads, token);
                    cache[key] = (result, result.RetrievedAt.AddMinutes(5));
                    return result;
                }
                finally { upstreamSlots.Release(); }
            }
            catch (NpsUnavailableException)
            {
                cache[key] = (null, clock.GetUtcNow().AddSeconds(30));
                throw;
            }
        }
        finally { gate.Release(); }
    }

    public void Dispose()
    {
        foreach (var gate in gates.Values) gate.Dispose();
        upstreamSlots.Dispose();
    }
}
