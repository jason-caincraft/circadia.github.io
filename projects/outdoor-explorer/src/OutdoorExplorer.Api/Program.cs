using System.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

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
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.Run();

public partial class Program;
