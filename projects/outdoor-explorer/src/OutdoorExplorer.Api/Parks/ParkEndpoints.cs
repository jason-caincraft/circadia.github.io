namespace OutdoorExplorer.Api.Parks;

public static class ParkEndpoints
{
    public static void MapParkEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/parks").RequireRateLimiting("parks");
        group.MapGet("/{parkCode}/{feed}", async (string parkCode, string feed, ParksService parks, ConditionsService conditions, CancellationToken token) =>
        {
            parkCode = parkCode.Trim().ToLowerInvariant();
            if (!ParkMapper.ParkCodePattern().IsMatch(parkCode)) return Results.Problem(statusCode: 400, title: "Invalid park code");
            if (feed is not ("alerts" or "road-events")) return Results.Problem(statusCode: 404, title: "Feed not found");
            try
            {
                var catalog = await parks.GetAsync(token);
                var park = catalog.Data.FirstOrDefault(p => p.ParkCode == parkCode);
                if (park is null) return Results.Problem(statusCode: catalog.Status == "partial" ? 503 : 404, title: "Park unavailable");
                return Results.Ok(await conditions.GetAsync(park, feed == "road-events", token));
            }
            catch (NpsUnavailableException)
            {
                return Results.Problem(statusCode: 503, title: "Visitor information unavailable", detail: "NPS visitor information is temporarily unavailable. Check the official park source.");
            }
        });
        group.MapGet("", async (string? states, string? q, string? activityId, ParksService service, CancellationToken token) =>
        {
            var selected = states is null ? ParksService.SupportedStates : states.Split(',', StringSplitOptions.TrimEntries)
                .Select(s => s.ToUpperInvariant()).Distinct().ToArray();
            q = q?.Trim();
            activityId = activityId?.Trim();
            if (selected.Length == 0 || selected.Any(s => !ParksService.SupportedStates.Contains(s)) ||
                q?.Length > 200 || (!string.IsNullOrEmpty(activityId) && !Guid.TryParseExact(activityId, "D", out _)))
                return Results.Problem(statusCode: 400, title: "Invalid park filters", detail: "Use ID, OR, WA states, text up to 200 characters, and a valid activity UUID.");
            try
            {
                var result = await service.GetAsync(token);
                return Results.Ok(result with
                {
                    Data = result.Data.Where(p => p.States.Intersect(selected).Any() &&
                        (string.IsNullOrEmpty(q) || p.Name.Contains(q, StringComparison.OrdinalIgnoreCase) || (p.Description?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false)) &&
                        (string.IsNullOrEmpty(activityId) || p.Activities.Any(a => a.Id.Equals(activityId, StringComparison.OrdinalIgnoreCase)))).ToArray()
                });
            }
            catch (NpsUnavailableException) { return Unavailable(); }
        });
        group.MapGet("/{parkCode}", async (string parkCode, ParksService service, CancellationToken token) =>
        {
            parkCode = parkCode.Trim().ToLowerInvariant();
            if (!ParkMapper.ParkCodePattern().IsMatch(parkCode))
                return Results.Problem(statusCode: 400, title: "Invalid park code", detail: "Use a park code of 4 to 10 letters or digits.");
            try
            {
                var result = await service.GetAsync(token);
                var park = result.Data.FirstOrDefault(p => p.ParkCode == parkCode);
                if (park is null)
                    return result.Status == "partial" ? Unavailable() : Results.Problem(statusCode: 404, title: "Park not found", detail: "The park is not in the supported regional catalog.");
                return Results.Ok(new DataResult<Park>(park, result.Status, result.RetrievedAt, result.Warnings));
            }
            catch (NpsUnavailableException) { return Unavailable(); }
        });
    }

    private static IResult Unavailable() => Results.Problem(statusCode: 503, title: "Park data unavailable",
        detail: "NPS park data is temporarily unavailable. Try again later.");
}
