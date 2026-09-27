using Microsoft.Extensions.Options;

namespace OutdoorExplorer.Api.Parks;

public sealed class ParksService(INpsProvider provider, IOptions<NpsOptions> options, TimeProvider clock) : IDisposable
{
    public static readonly string[] SupportedStates = ["ID", "OR", "WA"];
    private readonly SemaphoreSlim gate = new(1, 1);
    private DataResult<Park[]>? complete;
    private DataResult<Park[]>? recent;
    private DateTimeOffset retryAt;

    // One bounded regional cache serves every filter and detail request. The gate also
    // caps upstream concurrency and coalesces simultaneous misses, including failures.
    public async Task<DataResult<Park[]>> GetAsync(CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var now = clock.GetUtcNow();
            if (complete is not null && now - complete.RetrievedAt < TimeSpan.FromMinutes(options.Value.ParksCacheMinutes)) return complete;
            if (now < retryAt) return Fallback(now);
            try
            {
                recent = await provider.GetParksAsync(SupportedStates, cancellationToken);
                if (recent.Status == "fresh") { complete = recent; return complete; }
            }
            catch (NpsUnavailableException) { recent = null; }
            retryAt = clock.GetUtcNow().AddSeconds(30);
            return Fallback(clock.GetUtcNow());
        }
        finally { gate.Release(); }
    }

    private DataResult<Park[]> Fallback(DateTimeOffset now)
    {
        if (complete is not null && now - complete.RetrievedAt <= TimeSpan.FromHours(24))
            return complete with { Status = "stale", Warnings = complete.Warnings.Append("upstream_unavailable").Distinct().ToArray() };
        if (recent is not null) return recent;
        throw new NpsUnavailableException();
    }

    public void Dispose() => gate.Dispose();
}
