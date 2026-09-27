using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OutdoorExplorer.Api.Parks;
using Xunit;

public sealed class LiveNpsFactAttribute : FactAttribute
{
    public LiveNpsFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("NPS_LIVE_SMOKE") != "1")
            Skip = "Opt in with NPS_LIVE_SMOKE=1 and a backend NPS_API_KEY.";
    }
}

public sealed class LiveNpsTests
{
    [LiveNpsFact]
    [Trait("Category", "Live")]
    public async Task RegionalCatalogContainsNormalizedParkDetails()
    {
        var key = Environment.GetEnvironmentVariable("NPS_API_KEY");
        Assert.True(!string.IsNullOrWhiteSpace(key), "Configure NPS_API_KEY outside the repository before opting in.");
        using var handler = new SocketsHttpHandler { AllowAutoRedirect = false };
        using var client = new HttpClient(handler) { BaseAddress = new Uri(NpsOptions.BaseUrl), Timeout = Timeout.InfiniteTimeSpan };
        var provider = new NpsProvider(client, Options.Create(new NpsOptions { ApiKey = key }),
            TimeProvider.System, NullLogger<NpsProvider>.Instance);
        var result = await provider.GetParksAsync(ParksService.SupportedStates, default);
        Assert.Equal("fresh", result.Status);
        Assert.NotEmpty(result.Data);
        Assert.All(result.Data, park => Assert.True(park.States.Intersect(ParksService.SupportedStates).Any()));
        foreach (var code in new[] { "crmo", "crla", "olym" })
            Assert.True(result.Data.Any(park => park.ParkCode == code && park.Name.Length > 0),
                $"The regional catalog must include {code}.");
    }
}
