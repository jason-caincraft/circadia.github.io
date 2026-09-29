using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using OutdoorExplorer.Api.Parks;

internal static class E2eHost
{
    public static async Task Main()
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseContentRoot(Path.GetFullPath("../../../../../src/OutdoorExplorer.Api", AppContext.BaseDirectory));
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["NPS_API_KEY"] = "synthetic-e2e-key",
                ["AllowedOrigins:0"] = "http://127.0.0.1:5178"
            }));
            builder.ConfigureServices(services =>
            {
                services.AddCors(options => options.AddDefaultPolicy(policy =>
                    policy.WithOrigins("http://127.0.0.1:5178").WithMethods("GET").WithHeaders("Content-Type")));
                // Exercise the actual adapter, normalization, cache, endpoints and middleware.
                // No fallback transport exists: an unexpected upstream request fails closed.
                services.AddHttpClient<INpsProvider, NpsProvider>()
                    .ConfigurePrimaryHttpMessageHandler(() => new FixtureHandler());
                services.PostConfigure<NpsOptions>(options => options.ApprovedPhotoUrls = []);
                // Browser workers share immutable data, never a global request quota.
                // API integration tests exercise the production 120/minute policy.
                services.RemoveAll<IConfigureOptions<RateLimiterOptions>>();
                services.AddRateLimiter(options => options.AddPolicy("parks", _ => RateLimitPartition.GetNoLimiter("e2e")));
            });
        });
        factory.UseKestrel(options => options.Listen(IPAddress.Loopback, 5088));
        factory.StartServer();
        var stopping = factory.Services.GetRequiredService<IHostApplicationLifetime>().ApplicationStopping;
        try { await Task.Delay(Timeout.Infinite, stopping); }
        catch (OperationCanceledException) when (stopping.IsCancellationRequested) { }
    }

    private sealed class FixtureHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri ?? throw new InvalidOperationException("Missing fixture request URI.");
            var filters = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query);
            if (uri.Host == "developer.nps.gov" && uri.AbsolutePath == "/api/v1/campgrounds" &&
                filters["parkCode"].ToString() is "crla" or "olym" or "yell")
            {
                var content = filters["parkCode"] == "crla"
                    ? File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures",
                        filters["start"] == "0" ? "campgrounds-page-1.json" :
                        filters["start"] == "2" ? "campgrounds-page-2.json" : throw new InvalidOperationException("Unexpected campground page.")))
                    : "{\"total\":\"0\",\"start\":\"0\",\"data\":[]}";
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(content, System.Text.Encoding.UTF8, "application/json") });
            }
            if (uri.Host == "developer.nps.gov" && uri.AbsolutePath is "/api/v1/alerts" or "/api/v1/roadevents" &&
                filters["parkCode"].ToString() is "crla" or "olym" or "yell")
            {
                var roads = uri.AbsolutePath.EndsWith("roadevents", StringComparison.Ordinal);
                var content = filters["parkCode"] == "crla"
                    ? File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", roads ? "road-events.json" : "alerts.json"))
                    : roads ? "{\"type\":\"FeatureCollection\",\"features\":[]}" : "{\"total\":\"0\",\"start\":\"0\",\"data\":[]}";
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(content, System.Text.Encoding.UTF8, "application/json") });
            }
            if (uri.Host != "developer.nps.gov" || uri.AbsolutePath != "/api/v1/parks" ||
                !uri.Query.Contains("stateCode=ID,OR,WA", StringComparison.Ordinal))
                throw new InvalidOperationException("Unexpected fixture request.");
            var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query);
            var page = query["start"].ToString() switch
            {
                "0" => "parks-page-1.json",
                "2" => "parks-page-2.json",
                _ => throw new InvalidOperationException("Unexpected fixture page.")
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", page)),
                    System.Text.Encoding.UTF8, "application/json")
            });
        }
    }
}
