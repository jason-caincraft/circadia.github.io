using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OutdoorExplorer.Api.Parks;
using Xunit;

public sealed class CampgroundsTests
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

    [Fact]
    public async Task PaginatesAndNormalizesOnlyDocumentedInventory()
    {
        using var handler = new Handler(request =>
        {
            Assert.Equal("/api/v1/campgrounds", request.RequestUri!.AbsolutePath);
            Assert.Contains("parkCode=crla", request.RequestUri.Query);
            Assert.Contains("limit=50", request.RequestUri.Query);
            return Fixture(request.RequestUri.Query.Contains("start=2") ? "campgrounds-page-2.json" : "campgrounds-page-1.json");
        });
        var result = await Provider(handler).GetCampgroundsAsync(Lake, default);
        Assert.Equal("fresh", result.Status);
        Assert.Equal(3, result.Data.Length);
        Assert.Equal(2, handler.Calls);
        var mazama = result.Data[0];
        Assert.Equal("Crater Lake National Park", mazama.ParkName);
        Assert.Equal("Fixture Road, Crater Lake, OR", mazama.Location);
        Assert.Equal(100, mazama.TotalSites);
        Assert.Contains(mazama.SiteTypes, site => site.Name == "Tent only" && site.Count == 40);
        Assert.DoesNotContain(mazama.Amenities, amenity => amenity.Name == "Showers");
        Assert.Contains(mazama.Amenities, amenity => amenity.Name == "Potable water");
        Assert.Equal("Standard campsite: $30 per night", Assert.Single(mazama.Fees));
        Assert.StartsWith("https://www.recreation.gov/", mazama.ReservationUrl);
        var missing = result.Data[2];
        Assert.Null(missing.TotalSites);
        Assert.False(missing.SiteTypesProvided);
        Assert.False(missing.AmenitiesProvided);
        Assert.Empty(missing.Fees);
        Assert.Null(missing.ReservationUrl);
        Assert.Null(missing.Coordinates);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"total\":\"1\",\"start\":\"0\",\"data\":[]}")]
    public async Task MalformedOrIncompleteFeedIsUnavailable(string body)
    {
        using var handler = new Handler(_ => body);
        await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(handler).GetCampgroundsAsync(Lake, default));
    }

    [Fact]
    public async Task WrongParkOrMissingIdentityNeverAppearsAsEmptySuccess()
    {
        foreach (var change in new Action<JsonNode>[]
        {
            page => page["data"]![0]!["parkCode"] = "olym",
            page => page["data"]![0]!["name"] = null
        })
        {
            var page = JsonNode.Parse(Fixture("campgrounds-page-1.json"))!;
            change(page);
            using var handler = new Handler(_ => page.ToJsonString());
            await Assert.ThrowsAsync<NpsUnavailableException>(() => Provider(handler).GetCampgroundsAsync(Lake, default));
        }
    }

    [Fact]
    public async Task EmptyCampgroundFeedIsAValidSuccess()
    {
        using var handler = new Handler(_ => "{\"total\":\"0\",\"start\":\"0\",\"data\":[]}");
        var result = await Provider(handler).GetCampgroundsAsync(Lake, default);
        Assert.Empty(result.Data);
        Assert.Equal("fresh", result.Status);
    }

    [Fact]
    public async Task EndpointUsesRegionalCatalogAndSafeFailures()
    {
        await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.PostConfigure<NpsOptions>(options => options.ApiKey = "synthetic");
            services.AddHttpClient<INpsProvider, NpsProvider>().ConfigurePrimaryHttpMessageHandler(() => new Handler(request =>
            {
                var parks = request.RequestUri!.AbsolutePath.EndsWith("/parks");
                var secondPage = request.RequestUri.Query.Contains("start=2");
                return Fixture(parks ? (secondPage ? "parks-page-2.json" : "parks-page-1.json") :
                    (secondPage ? "campgrounds-page-2.json" : "campgrounds-page-1.json"));
            }));
        }));
        using var client = app.CreateClient();
        using var response = await client.GetAsync("/api/parks/crla/campgrounds");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Mazama Campground", body);
        Assert.DoesNotContain("javascript:alert", body);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/parks/acad/campgrounds")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/parks/xx/campgrounds")).StatusCode);
    }
}
