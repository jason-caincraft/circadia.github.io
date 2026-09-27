namespace OutdoorExplorer.Api.Parks;

public sealed record Coordinates(double Latitude, double Longitude);
public sealed record ParkActivity(string Id, string Name);
public sealed record Photo(string Url, string Credit, string? Caption, string? AltText, string SourceUrl);
public sealed record HoursException(string? Name, string? StartDate, string? EndDate, Dictionary<string, string> Hours);
public sealed record OperatingInformation(string? Name, string? Description, Dictionary<string, string> StandardHours, HoursException[] Exceptions);
public sealed record Park(string Id, string Provider, string ProviderId, string ParkCode, string Name,
    string? Designation, string[] States, Coordinates? Coordinates, string? Description, string OfficialUrl,
    ParkActivity[] Activities, Photo[] Photos, OperatingInformation[] OperatingInformation, DateTimeOffset RetrievedAt);
public sealed record DataResult<T>(T Data, string Status, DateTimeOffset RetrievedAt, string[] Warnings);

public interface INpsProvider
{
    Task<DataResult<Park[]>> GetParksAsync(string[] states, CancellationToken cancellationToken);
}

public sealed class NpsUnavailableException() : Exception("NPS park data is temporarily unavailable.");

public sealed class NpsOptions
{
    public const string BaseUrl = "https://developer.nps.gov/api/v1/";
    public string? ApiKey { get; set; }
    public int ParksCacheMinutes { get; set; } = 60;
    public TimeSpan AttemptTimeout { get; set; } = TimeSpan.FromSeconds(10);
    public TimeSpan RequestBudget { get; set; } = TimeSpan.FromSeconds(30);
    // Explicitly reviewed image URLs, not a credit-based permission heuristic.
    public string[] ApprovedPhotoUrls { get; set; } = [];
}
