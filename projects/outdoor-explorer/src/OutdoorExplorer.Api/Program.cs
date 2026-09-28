using System.Diagnostics;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using OutdoorExplorer.Api.Parks;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddOptions<NpsOptions>().BindConfiguration("Nps")
    .PostConfigure(options => options.ApiKey = builder.Configuration["NPS_API_KEY"])
    .Validate(options => options.ParksCacheMinutes is > 0 and <= 1440 &&
        options.AttemptTimeout > TimeSpan.Zero && options.AttemptTimeout <= TimeSpan.FromSeconds(10) &&
        options.RequestBudget > TimeSpan.Zero && options.RequestBudget <= TimeSpan.FromSeconds(30), "Invalid NPS cache or timeout settings.")
    .ValidateOnStart();
builder.Services.AddHttpClient<INpsProvider, NpsProvider>(client =>
{
    client.BaseAddress = new Uri(NpsOptions.BaseUrl);
    client.Timeout = Timeout.InfiniteTimeSpan;
}).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    AllowAutoRedirect = false,
    PooledConnectionLifetime = TimeSpan.FromMinutes(5)
}).RemoveAllLoggers();
builder.Services.AddSingleton<ParksService>();
builder.Services.AddTransient<INpsConditionsProvider>(services => (NpsProvider)services.GetRequiredService<INpsProvider>());
builder.Services.AddSingleton<ConditionsService>();
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("parks", limiter =>
    {
        limiter.PermitLimit = 120;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
    options.OnRejected = async (context, token) =>
        await Results.Problem(statusCode: 429, title: "Too many requests", detail: "Please wait before requesting more park data.")
            .ExecuteAsync(context.HttpContext);
});

builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Extensions["traceId"] =
            Activity.Current?.Id ?? context.HttpContext.TraceIdentifier;
        context.ProblemDetails.Detail ??= "The request could not be completed.";
    };
});
var origins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    if (origins.Length > 0)
    {
        policy.WithOrigins(origins).WithMethods("GET").WithHeaders("Content-Type");
    }
}));

var app = builder.Build();
// Use the same safe response in development and production; never return exception details.
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseRateLimiter();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapParkEndpoints();
app.Run();

public partial class Program;
