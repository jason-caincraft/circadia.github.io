using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OutdoorExplorer.Api.Parks;
using Xunit;

public sealed class ParksTests
{
    private const string Key = "test-secret-never-return";
    private static string Fixture(int page) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", $"parks-page-{page}.json"));
    private static HttpResponseMessage Json(string body) => new(HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };
    private static NpsOptions Settings() => new() { ApiKey = Key, ApprovedPhotoUrls = ["https://www.nps.gov/example-reviewed.jpg"] };
    private static NpsProvider Provider(Handler handler, NpsOptions? options = null) => new(
        new HttpClient(handler) { BaseAddress = new Uri(NpsOptions.BaseUrl), Timeout = Timeout.InfiniteTimeSpan },
        Options.Create(options ?? Settings()), TimeProvider.System, NullLogger<NpsProvider>.Instance);

    private sealed class Handler(Func<HttpRequestMessage, int, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => send(request, Interlocked.Increment(ref Calls), token);
    }

    private static Handler Pages() => new((request, call, _) =>
    {
        Assert.Equal(Key, Assert.Single(request.Headers.GetValues("X-Api-Key")));
        Assert.DoesNotContain(Key, request.RequestUri!.ToString());
        Assert.Contains("stateCode=ID,OR,WA", request.RequestUri.AbsoluteUri);
        Assert.Contains($"start={(call == 1 ? 0 : 2)}", request.RequestUri.Query);
        return Task.FromResult(Json(Fixture(call)));
    });

    [Fact]
    public async Task PaginationNormalizesDeduplicatesAndPreservesAttribution()
    {
        using var handler = Pages();
        var result = await Provider(handler).GetParksAsync(ParksService.SupportedStates, default);
        Assert.Equal(2, handler.Calls);
        Assert.Equal("fresh", result.Status);
        Assert.Equal(["crla", "olym", "yell"], result.Data.Select(p => p.ParkCode));
        var lake = result.Data[0];
        Assert.Equal("nps:crla", lake.Id);
        Assert.Equal("fixture-crla", lake.ProviderId);
        Assert.Equal(new Coordinates(42.94, -122.1), lake.Coordinates);
        Assert.Single(lake.Activities);
        var photo = Assert.Single(lake.Photos);
        Assert.Equal("NPS / Fixture", photo.Credit);
        Assert.Equal("Blue lake", photo.AltText);
        Assert.Equal(lake.OfficialUrl, photo.SourceUrl);
        Assert.Equal("Closed", lake.OperatingInformation[0].Exceptions[0].Hours["monday"]);
        Assert.Null(result.Data[1].Coordinates);
        Assert.Equal("All Day", result.Data[1].OperatingInformation[0].StandardHours["monday"]);
        Assert.Equal(["ID", "MT", "WY"], result.Data[2].States);
        Assert.Contains("coordinates_unavailable", result.Warnings);
        Assert.Contains("photos_omitted", result.Warnings);
    }

    [Theory]
    [InlineData("91", "0")]
    [InlineData("0", "181")]
    [InlineData("Infinity", "0")]
    [InlineData("42,1", "0")]
    [InlineData("", "0")]
    public async Task InvalidCoordinatePairsAreNull(string lat, string lng)
    {
        var page = JsonNode.Parse(Fixture(1))!;
        page["total"] = "2";
        page["data"]![0]!["latitude"] = lat;
        page["data"]![0]!["longitude"] = lng;
        using var handler = new Handler((_, _, _) => Task.FromResult(Json(page.ToJsonString())));
        var result = await Provider(handler).GetParksAsync(ParksService.SupportedStates, default);
        Assert.Null(result.Data[0].Coordinates);
    }

    [Theory]
    [InlineData("https://nps.gov.evil.example/park")]
    [InlineData("javascript:alert(1)")]
    [InlineData("")]
    public async Task UnusableRecordsAreOmittedWithPartialStatus(string url)
    {
        var page = JsonNode.Parse(Fixture(1))!;
        page["total"] = "2";
        page["data"]![0]!["url"] = url;
        using var handler = new Handler((_, _, _) => Task.FromResult(Json(page.ToJsonString())));
        var result = await Provider(handler).GetParksAsync(ParksService.SupportedStates, default);
        Assert.Equal("partial", result.Status);
        Assert.Equal("yell", Assert.Single(result.Data).ParkCode);
    }

    [Theory]
    [InlineData("empty")]
    [InlineData("repeated")]
    [InlineData("repeated-data")]
    [InlineData("total")]
    [InlineData("failure")]
    public async Task BrokenLaterPagesReturnPartialData(string mode)
    {
        using var handler = new Handler((_, call, _) =>
        {
            if (call == 1) return Task.FromResult(Json(Fixture(1)));
            if (mode == "failure") return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized));
            var page = JsonNode.Parse(Fixture(mode is "repeated" or "repeated-data" ? 1 : 2))!;
            if (mode == "repeated-data") page["start"] = "2";
            if (mode == "empty") page["data"] = new JsonArray();
            if (mode == "total") page["total"] = "5";
            return Task.FromResult(Json(page.ToJsonString()));
        });
        var result = await Provider(handler).GetParksAsync(ParksService.SupportedStates, default);
        Assert.Equal("partial", result.Status);
        Assert.Equal(2, result.Data.Length);
        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task ValidEmptyIsFreshButMalformedResponseIsUnavailable()
    {
        using var empty = new Handler((_, _, _) => Task.FromResult(Json("{\"total\":\"0\",\"start\":\"0\",\"data\":[]}")));
        Assert.Empty((await Provider(empty).GetParksAsync(ParksService.SupportedStates, default)).Data);
        using var malformed = new Handler((_, _, _) => Task.FromResult(Json("{}")));
        await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(malformed).GetParksAsync(ParksService.SupportedStates, default));
    }

    [Theory]
    [InlineData(500, 3)]
    [InlineData(401, 1)]
    [InlineData(403, 1)]
    public async Task RetriesOnlyTransientFailures(int status, int calls)
    {
        using var handler = new Handler((_, _, _) => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent(Key) }));
        var error = await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(handler).GetParksAsync(ParksService.SupportedStates, default));
        Assert.Equal(calls, handler.Calls);
        Assert.DoesNotContain(Key, error.ToString());
    }

    [Fact]
    public async Task TransientFailureCanRecover()
    {
        using var handler = new Handler((_, call, _) => Task.FromResult(call == 1 ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable) :
            Json("{\"total\":\"0\",\"start\":\"0\",\"data\":[]}")));
        Assert.Equal("fresh", (await Provider(handler).GetParksAsync(ParksService.SupportedStates, default)).Status);
        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task RateLimitWaitBeyondBudgetDoesNotRetryEarly()
    {
        using var handler = new Handler((_, _, _) =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
            response.Headers.RetryAfter = new(TimeSpan.FromSeconds(60));
            return Task.FromResult(response);
        });
        var settings = Settings();
        settings.RequestBudget = TimeSpan.FromMilliseconds(50);
        await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(handler, settings).GetParksAsync(ParksService.SupportedStates, default));
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task TimeoutsAreBoundedAndCallerCancellationPropagates()
    {
        using var handler = new Handler(async (_, _, token) => { await Task.Delay(Timeout.Infinite, token); return Json("{}"); });
        var settings = Settings();
        settings.AttemptTimeout = TimeSpan.FromMilliseconds(10);
        settings.RequestBudget = TimeSpan.FromMilliseconds(80);
        await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(handler, settings).GetParksAsync(ParksService.SupportedStates, default));
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Provider(handler).GetParksAsync(ParksService.SupportedStates, cancellation.Token));
    }

    [Fact]
    public async Task MissingKeyDoesNotContactProvider()
    {
        using var handler = Pages();
        await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(handler, new NpsOptions()).GetParksAsync(ParksService.SupportedStates, default));
        Assert.Equal(0, handler.Calls);
    }

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class StubProvider(Func<Task<DataResult<Park[]>>> fetch) : INpsProvider
    {
        public int Calls;
        public Task<DataResult<Park[]>> GetParksAsync(string[] states, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref Calls);
            return fetch();
        }
    }

    [Fact]
    public async Task CacheCoalescesMissesPreservesCompleteDataAndExpiresStale()
    {
        var clock = new Clock();
        var mode = "fresh";
        var provider = new StubProvider(async () =>
        {
            await Task.Yield();
            if (mode == "failure") throw new NpsUnavailableException();
            return new([], mode, clock.Now, []);
        });
        using var service = new ParksService(provider, Options.Create(Settings()), clock);
        await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => service.GetAsync(default)));
        Assert.Equal(1, provider.Calls);
        var original = clock.Now;
        clock.Now += TimeSpan.FromMinutes(61);
        mode = "partial";
        var stale = await service.GetAsync(default);
        Assert.Equal("stale", stale.Status);
        Assert.Equal(original, stale.RetrievedAt);
        await service.GetAsync(default);
        Assert.Equal(2, provider.Calls);
        clock.Now += TimeSpan.FromHours(24);
        mode = "failure";
        await Assert.ThrowsAsync<NpsUnavailableException>(() => service.GetAsync(default));
    }

    private static WebApplicationFactory<Program> App(Handler handler) => new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
    {
        builder.UseEnvironment("Development");
        builder.ConfigureServices(services => services.AddSingleton<INpsProvider>(Provider(handler)));
    });

    [Fact]
    public async Task EndpointsShareCacheAndApplyFiltersAfterPagination()
    {
        using var handler = Pages();
        await using var app = App(handler);
        using var client = app.CreateClient();
        var collection = await client.GetFromJsonAsync<DataResult<Park[]>>("/api/parks?states=wa,OR,wa&q=park");
        Assert.Equal(["crla", "olym"], collection!.Data.Select(p => p.ParkCode));
        var detail = await client.GetFromJsonAsync<DataResult<Park>>("/api/parks/YELL");
        Assert.Equal("yell", detail!.Data.ParkCode);
        Assert.Equal(collection.RetrievedAt, detail.RetrievedAt);
        var empty = await client.GetFromJsonAsync<DataResult<Park[]>>("/api/parks?activityId=00000000-0000-0000-0000-000000000000");
        Assert.Empty(empty!.Data);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/parks/acad")).StatusCode);
        Assert.Equal(2, handler.Calls);
    }

    [Theory]
    [InlineData("?states=")]
    [InlineData("?states=CA")]
    [InlineData("?states=ID,,WA")]
    [InlineData("?activityId=bad")]
    [InlineData("/bad!")]
    public async Task InvalidInputsDoNotContactProvider(string suffix)
    {
        using var handler = Pages();
        await using var app = App(handler);
        using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/parks" + suffix)).StatusCode);
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task MissingConfigurationReturnsSafe503WhileHealthWorks()
    {
        await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["NPS_API_KEY"] = "" })));
        using var client = app.CreateClient();
        var response = await client.GetAsync("/api/parks");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("traceId", body);
        Assert.DoesNotContain("NPS_API_KEY", body);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task PartialCatalogCannotClaimAnAbsentParkDoesNotExist()
    {
        using var handler = new Handler((_, call, _) => Task.FromResult(call == 1 ? Json(Fixture(1)) : new HttpResponseMessage(HttpStatusCode.Forbidden)));
        await using var app = App(handler);
        using var client = app.CreateClient();
        var result = await client.GetFromJsonAsync<DataResult<Park[]>>("/api/parks");
        Assert.Equal("partial", result!.Status);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/api/parks/olym")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/parks/crla")).StatusCode);
        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task FailedConcurrentRequestsAreCoalescedDuringCooldown()
    {
        var clock = new Clock();
        var provider = new StubProvider(() => throw new NpsUnavailableException());
        using var service = new ParksService(provider, Options.Create(Settings()), clock);
        await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Assert.ThrowsAsync<NpsUnavailableException>(() => service.GetAsync(default))));
        Assert.Equal(1, provider.Calls);
        clock.Now += TimeSpan.FromSeconds(31);
        await Assert.ThrowsAsync<NpsUnavailableException>(() => service.GetAsync(default));
        Assert.Equal(2, provider.Calls);
    }

    [Fact]
    public async Task RateLimitingReturnsProblemDetailsAndLeavesHealthAvailable()
    {
        using var handler = new Handler((_, _, _) => Task.FromResult(Json("{\"total\":\"0\",\"start\":\"0\",\"data\":[]}")));
        await using var app = App(handler);
        using var client = app.CreateClient();
        for (var i = 0; i < 120; i++)
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/parks")).StatusCode);
        var response = await client.GetAsync("/api/parks");
        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
        Assert.Equal(1, handler.Calls);
    }
}
