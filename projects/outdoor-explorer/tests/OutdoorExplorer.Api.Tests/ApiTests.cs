using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

public class ApiTests
{
    [Theory]
    [InlineData("Development")]
    [InlineData("Production")]
    public async Task ExceptionsReturnSanitizedProblemDetails(string environment)
    {
        await using var app = CreateApp(environment).WithWebHostBuilder(builder =>
            builder.ConfigureServices(services => services.AddTransient<IStartupFilter, FailureFilter>()));
        using var client = app.CreateClient();
        using var response = await client.GetAsync("/test-failure");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var content = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("private-diagnostic", content);
        using var body = JsonDocument.Parse(content);
        Assert.Equal(500, body.RootElement.GetProperty("status").GetInt32());
        Assert.True(body.RootElement.TryGetProperty("traceId", out _));
    }

    private sealed class FailureFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            next(app);
            app.Run(_ => throw new InvalidOperationException("private-diagnostic"));
        };
    }

    private static WebApplicationFactory<Program> CreateApp(string environment = "Development") =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.UseEnvironment(environment).ConfigureLogging(logging => logging.ClearProviders()));

    [Fact]
    public async Task HealthIsAvailableWithoutProviderCredentials()
    {
        await using var app = CreateApp();
        using var client = app.CreateClient();
        using var response = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("{\"status\":\"ok\"}", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("Development", "http://localhost:5173", true)]
    [InlineData("Development", "https://example.com", false)]
    [InlineData("Development", "http://localhost:5174", false)]
    [InlineData("Production", "http://localhost:5173", false)]
    public async Task CorsOnlyAllowsConfiguredOrigin(string environment, string origin, bool allowed)
    {
        await using var app = CreateApp(environment);
        using var client = app.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/health");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "GET");
        using var response = await client.SendAsync(request);
        Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Origin"));
        if (allowed)
        {
            Assert.Equal(origin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
        }
    }

    [Fact]
    public async Task UnknownRouteReturnsProblemDetails()
    {
        await using var app = CreateApp();
        using var client = app.CreateClient();
        using var response = await client.GetAsync("/api/not-implemented");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(404, body.RootElement.GetProperty("status").GetInt32());
        Assert.True(body.RootElement.TryGetProperty("traceId", out _));
        Assert.True(body.RootElement.TryGetProperty("detail", out _));
    }
}
