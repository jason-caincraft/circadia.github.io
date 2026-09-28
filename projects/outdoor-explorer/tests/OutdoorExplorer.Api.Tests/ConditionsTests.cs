using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OutdoorExplorer.Api.Parks;
using Xunit;

public sealed class ConditionsTests
{
    private static string Fixture(string file) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", file));
    private static readonly Park Lake = new("nps:crla", "nps", "fixture-crla", "crla", "Crater Lake National Park", null,
        ["OR"], null, null, "https://www.nps.gov/crla/index.htm", [], [], [], DateTimeOffset.UtcNow);

    private sealed class Handler(Func<HttpRequestMessage, string> body) : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Calls++;
            Assert.Equal("synthetic", Assert.Single(request.Headers.GetValues("X-Api-Key")));
            Assert.DoesNotContain("synthetic", request.RequestUri!.ToString());
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body(request)) });
        }
    }

    private static NpsProvider Provider(Handler handler) => new(new HttpClient(handler) { BaseAddress = new(NpsOptions.BaseUrl) },
        Options.Create(new NpsOptions { ApiKey = "synthetic" }), TimeProvider.System, NullLogger<NpsProvider>.Instance);

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task PublishedContractsNormalizeDatesAndOfficialSources(bool roads)
    {
        using var handler = new Handler(request =>
        {
            Assert.Contains("parkCode=crla", request.RequestUri!.Query);
            Assert.EndsWith(roads ? "/roadevents" : "/alerts", request.RequestUri.AbsolutePath);
            return Fixture(roads ? "road-events.json" : "alerts.json");
        });
        var result = await Provider(handler).GetConditionsAsync(Lake, roads, default);
        var notice = Assert.Single(result.Data);
        Assert.Equal("fresh", result.Status);
        Assert.Equal("crla", notice.ParkCode);
        Assert.NotNull(notice.ProviderDate);
        Assert.Equal(roads ? "Provider source updated" : "Provider last indexed", notice.DateLabel);
        Assert.StartsWith("https://www.nps.gov/crla/", notice.SourceUrl);
    }

    [Fact]
    public async Task AlertsPaginateAndDeduplicate()
    {
        using var handler = new Handler(request =>
        {
            var page = JsonNode.Parse(Fixture("alerts.json"))!;
            page["total"] = "2";
            if (request.RequestUri!.Query.Contains("start=1")) page["start"] = "1";
            return page.ToJsonString();
        });
        Assert.Single((await Provider(handler).GetConditionsAsync(Lake, false, default)).Data);
        Assert.Equal(2, handler.Calls);
    }

    [Theory]
    [InlineData("{}", false)]
    [InlineData("{}", true)]
    [InlineData("{\"total\":\"1\",\"start\":\"0\",\"data\":[]}", false)]
    public async Task MalformedOrIncompleteFeedIsUnavailable(string body, bool roads)
    {
        using var handler = new Handler(_ => body);
        await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(handler).GetConditionsAsync(Lake, roads, default));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task WrongParkDoesNotLeakNoticesOrReportEmpty(bool roads)
    {
        using var handler = new Handler(_ => Fixture(roads ? "road-events.json" : "alerts.json").Replace(
            roads ? "Crater Lake National Park" : "\"crla\"", roads ? "Olympic National Park" : "\"olym\""));
        await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(handler).GetConditionsAsync(Lake, roads, default));
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("https://nps.gov.evil.example/notice")]
    [InlineData("")]
    public async Task UnsafeOrMissingLinksFallBackToOfficialPark(string url)
    {
        var page = JsonNode.Parse(Fixture("alerts.json"))!;
        page["data"]![0]!["url"] = url;
        using var handler = new Handler(_ => page.ToJsonString());
        Assert.Equal(Lake.OfficialUrl, Assert.Single((await Provider(handler).GetConditionsAsync(Lake, false, default)).Data).SourceUrl);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ValidEmptyFeedsAreFresh(bool roads)
    {
        using var handler = new Handler(_ => roads ? "{\"type\":\"FeatureCollection\",\"features\":[]}" : "{\"total\":\"0\",\"start\":\"0\",\"data\":[]}");
        var result = await Provider(handler).GetConditionsAsync(Lake, roads, default);
        Assert.Empty(result.Data);
        Assert.Equal("fresh", result.Status);
    }

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class Feed(Clock clock) : INpsConditionsProvider
    {
        public int Calls;
        public bool Fail;
        public Task<DataResult<VisitorNotice[]>> GetConditionsAsync(Park park, bool roads, CancellationToken token)
        {
            Calls++;
            if (Fail) throw new NpsUnavailableException();
            return Task.FromResult(new DataResult<VisitorNotice[]>([], "fresh", clock.Now, []));
        }
    }

    private sealed class PendingFeed : INpsConditionsProvider
    {
        public int Calls;
        public readonly TaskCompletionSource<DataResult<VisitorNotice[]>> Completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task<DataResult<VisitorNotice[]>> GetConditionsAsync(Park park, bool roads, CancellationToken token)
        {
            Calls++;
            return Completion.Task.WaitAsync(token);
        }
    }

    [Fact]
    public async Task CrossParkConcurrencyIsBoundedAndSameFeedMissesCoalesce()
    {
        var provider = new PendingFeed();
        var clock = new Clock();
        using var service = new ConditionsService(provider, clock);
        var pending = new[] { "crla", "olym", "yell", "nepe" }.Select(code => service.GetAsync(Lake with { ParkCode = code }, false, default)).ToArray();
        var coalesced = service.GetAsync(Lake, false, default);
        try
        {
            Assert.Equal(4, provider.Calls);
            await Assert.ThrowsAsync<NpsUnavailableException>(() => service.GetAsync(Lake, true, default));
            Assert.Equal(4, provider.Calls);
        }
        finally { provider.Completion.SetResult(new([], "fresh", clock.Now, [])); }
        await Task.WhenAll(pending.Append(coalesced));
        Assert.Equal(4, provider.Calls);
    }

    [Fact]
    public async Task UnsupportedRoadParkCodeDoesNotIssueUpstreamRequest()
    {
        using var handler = new Handler(_ => throw new InvalidOperationException());
        await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(handler).GetConditionsAsync(Lake with { ParkCode = "longcode" }, true, default));
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task CacheExpiresAfterFiveMinutesAndFailureNeverReusesEmptySuccess()
    {
        var clock = new Clock();
        var provider = new Feed(clock);
        using var service = new ConditionsService(provider, clock);
        await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => service.GetAsync(Lake, false, default)));
        Assert.Equal(1, provider.Calls);
        await service.GetAsync(Lake, true, default);
        Assert.Equal(2, provider.Calls);
        clock.Now = clock.Now.AddMinutes(5);
        provider.Fail = true;
        await Assert.ThrowsAsync<NpsUnavailableException>(() => service.GetAsync(Lake, false, default));
        await Assert.ThrowsAsync<NpsUnavailableException>(() => service.GetAsync(Lake, false, default));
        Assert.Equal(3, provider.Calls);
        clock.Now = clock.Now.AddSeconds(30);
        provider.Fail = false;
        await service.GetAsync(Lake, false, default);
        Assert.Equal(4, provider.Calls);
    }

    [Fact]
    public async Task FeedApiFailurePreservesDetailsAndRejectsUnknownPark()
    {
        await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.PostConfigure<NpsOptions>(options => options.ApiKey = "synthetic");
            services.AddHttpClient<INpsProvider, NpsProvider>().ConfigurePrimaryHttpMessageHandler(() => new Handler(request =>
                request.RequestUri!.AbsolutePath.EndsWith("/parks") ? Fixture(request.RequestUri.Query.Contains("start=2") ? "parks-page-2.json" : "parks-page-1.json") : "{}"));
        }));
        using var client = app.CreateClient();
        using var failure = await client.GetAsync("/api/parks/crla/alerts");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, failure.StatusCode);
        Assert.Equal("application/problem+json", failure.Content.Headers.ContentType?.MediaType);
        var body = await failure.Content.ReadAsStringAsync();
        Assert.Contains("traceId", body);
        Assert.DoesNotContain("synthetic", body);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/parks/crla")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/parks/acad/road-events")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/parks/xx/alerts")).StatusCode);
    }
}
