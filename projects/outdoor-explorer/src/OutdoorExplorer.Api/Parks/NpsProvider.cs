using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace OutdoorExplorer.Api.Parks;

public sealed partial class NpsProvider(HttpClient client, IOptions<NpsOptions> options, TimeProvider clock, ILogger<NpsProvider> logger) : INpsProvider, INpsConditionsProvider
{
    public async Task<DataResult<Park[]>> GetParksAsync(string[] states, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (string.IsNullOrWhiteSpace(settings.ApiKey)) throw new NpsUnavailableException();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(settings.RequestBudget);
        var retrievedAt = clock.GetUtcNow();
        var parks = new Dictionary<string, Park>(StringComparer.OrdinalIgnoreCase);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var warnings = new HashSet<string>();
        int start = 0;
        int? total = null;
        try
        {
            // Bound even corrupt or changing upstream pagination.
            for (var pageNumber = 0; pageNumber < 100; pageNumber++)
            {
                // NPS splits literal commas before decoding values; encoding the separator
                // silently restricts the live response to the first state.
                var stateFilter = string.Join(',', states.Select(Uri.EscapeDataString));
                using var page = await FetchPageAsync($"parks?stateCode={stateFilter}&limit=50&start={start}&sort=parkCode", budget.Token);
                var root = page.RootElement;
                if (!int.TryParse(ParkMapper.Text(root, "total"), out var count) || count < 0 ||
                    !int.TryParse(ParkMapper.Text(root, "start"), out var offset) || offset != start ||
                    !root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                    throw new NpsUnavailableException();
                if (total.HasValue && total != count) { warnings.Add("inconsistent_pagination"); break; }
                total = count;
                var length = data.GetArrayLength();
                if (length == 0 && start < count) { warnings.Add("incomplete_pagination"); break; }
                var newIdentities = 0;
                foreach (var raw in data.EnumerateArray())
                {
                    var identity = ParkMapper.Text(raw, "parkCode");
                    if (identity is not null && seen.Add(identity)) newIdentities++;
                    var park = ParkMapper.Map(raw, retrievedAt, settings, warnings);
                    if (park is not null && park.States.Intersect(states, StringComparer.OrdinalIgnoreCase).Any())
                        parks.TryAdd(park.ParkCode, park);
                }
                if (length > 0 && newIdentities == 0) { warnings.Add("incomplete_pagination"); break; }
                start += length;
                if (start > count) warnings.Add("inconsistent_pagination");
                if (start >= count) break;
                if (pageNumber == 99) warnings.Add("incomplete_pagination");
            }
        }
        catch (Exception ex) when (ex is NpsUnavailableException or JsonException or HttpRequestException or OperationCanceledException)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (parks.Count == 0) throw new NpsUnavailableException();
            warnings.Add("upstream_unavailable");
        }
        var partial = warnings.Overlaps(["invalid_record", "inconsistent_pagination", "incomplete_pagination", "upstream_unavailable"]);
        if (partial && parks.Count == 0) throw new NpsUnavailableException();
        return new(parks.Values.OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase).ThenBy(p => p.ParkCode).ToArray(),
            partial ? "partial" : "fresh", retrievedAt, warnings.Order().ToArray());
    }

    private async Task<JsonDocument> FetchPageAsync(string path, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var delay = TimeSpan.FromMilliseconds(250 * Math.Pow(2, attempt) + Random.Shared.Next(100));
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(options.Value.AttemptTimeout);
                using var request = new HttpRequestMessage(HttpMethod.Get, path);
                request.Headers.Add("X-Api-Key", options.Value.ApiKey);
                using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
                // Only numeric quota/status metadata is logged; never bodies, headers, or exceptions.
                long? remaining = response.Headers.TryGetValues("X-RateLimit-Remaining", out var values) &&
                    long.TryParse(values.FirstOrDefault(), out var parsed) ? parsed : null;
                logger.LogInformation("NPS parks status {Status}; quota remaining {Remaining}", (int)response.StatusCode, remaining);
                if (response.IsSuccessStatusCode)
                {
                    await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
                    return await JsonDocument.ParseAsync(stream, cancellationToken: timeout.Token);
                }
                if (response.StatusCode != HttpStatusCode.TooManyRequests && (int)response.StatusCode < 500)
                    throw new NpsUnavailableException();
                if (response.StatusCode == HttpStatusCode.TooManyRequests)
                {
                    delay = response.Headers.RetryAfter?.Delta ??
                        (response.Headers.RetryAfter?.Date is { } date ? date - clock.GetUtcNow() : TimeSpan.FromSeconds(5 * (attempt + 1)));
                    if (delay < TimeSpan.Zero) delay = TimeSpan.Zero;
                }
            }
            catch (HttpRequestException) { }
            catch (IOException) { }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { }
            if (attempt == 2) break;
            if (delay >= options.Value.RequestBudget) throw new NpsUnavailableException();
            // Waiting on the budget token honors Retry-After without retrying early.
            await Task.Delay(delay, cancellationToken);
        }
        throw new NpsUnavailableException();
    }
}
