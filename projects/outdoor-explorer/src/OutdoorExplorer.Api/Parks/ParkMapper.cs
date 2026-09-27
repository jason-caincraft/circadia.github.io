using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace OutdoorExplorer.Api.Parks;

internal static partial class ParkMapper
{
    [GeneratedRegex("^[a-z0-9]{4,10}$", RegexOptions.CultureInvariant)]
    public static partial Regex ParkCodePattern();

    public static Park? Map(JsonElement raw, DateTimeOffset retrievedAt, NpsOptions options, HashSet<string> warnings)
    {
        var code = Text(raw, "parkCode")?.ToLowerInvariant();
        var id = Text(raw, "id");
        var name = Text(raw, "fullName");
        var url = Text(raw, "url");
        var states = (Text(raw, "states") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => s.ToUpperInvariant()).Distinct().Order().ToArray();
        if (id is null || name is null || code is null || !ParkCodePattern().IsMatch(code) || !NpsUrl(url) || states.Length == 0)
        {
            warnings.Add("invalid_record");
            return null;
        }

        Coordinates? coordinates = null;
        if (double.TryParse(Text(raw, "latitude"), NumberStyles.Float, CultureInfo.InvariantCulture, out var lat) &&
            double.TryParse(Text(raw, "longitude"), NumberStyles.Float, CultureInfo.InvariantCulture, out var lng) &&
            double.IsFinite(lat) && double.IsFinite(lng) && lat is >= -90 and <= 90 && lng is >= -180 and <= 180)
            coordinates = new(lat, lng);
        else
            warnings.Add("coordinates_unavailable");

        var activities = Items(raw, "activities").Select(a => new { Id = Text(a, "id"), Name = Text(a, "name") })
            .Where(a => a.Id is not null && a.Name is not null)
            .DistinctBy(a => a.Id, StringComparer.OrdinalIgnoreCase).Select(a => new ParkActivity(a.Id!, a.Name!)).ToArray();
        var photos = new List<Photo>();
        foreach (var image in Items(raw, "images"))
        {
            var imageUrl = Text(image, "url");
            var credit = Text(image, "credit");
            if (HttpUrl(imageUrl) && credit is not null && options.ApprovedPhotoUrls.Contains(imageUrl, StringComparer.Ordinal))
                photos.Add(new(imageUrl!, credit, Text(image, "caption"), Text(image, "altText"), url!));
            else
                warnings.Add("photos_omitted");
        }
        var hours = Items(raw, "operatingHours").Select(h => new OperatingInformation(Text(h, "name"), Text(h, "description"),
            Hours(h, "standardHours"), Items(h, "exceptions").Select(e => new HoursException(Text(e, "name"),
                Date(e, "startDate"), Date(e, "endDate"), Hours(e, "exceptionHours"))).ToArray())).ToArray();
        return new($"nps:{code}", "nps", id, code, name, Text(raw, "designation"), states, coordinates,
            Text(raw, "description"), url!, activities, photos.ToArray(), hours, retrievedAt);
    }

    internal static string? Text(JsonElement value, string name) =>
        value.ValueKind == JsonValueKind.Object && value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String &&
        !string.IsNullOrWhiteSpace(property.GetString()) ? property.GetString()!.Trim() : null;

    private static IEnumerable<JsonElement> Items(JsonElement value, string name) =>
        value.ValueKind == JsonValueKind.Object && value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.Array
            ? property.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.Object) : [];

    private static string? Date(JsonElement value, string name) =>
        DateOnly.TryParseExact(Text(value, name), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;

    private static Dictionary<string, string> Hours(JsonElement value, string name)
    {
        if (!value.TryGetProperty(name, out var hours)) return [];
        // The published schema uses objects; its older example uses single-item arrays.
        if (hours.ValueKind == JsonValueKind.Array) hours = hours.EnumerateArray().FirstOrDefault();
        return hours.ValueKind == JsonValueKind.Object
            ? hours.EnumerateObject().Where(p => p.Value.ValueKind == JsonValueKind.String)
                .ToDictionary(p => p.Name, p => p.Value.GetString()!) : [];
    }

    private static bool HttpUrl(string? url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
        uri.Scheme is "http" or "https" && uri.UserInfo.Length == 0;

    private static bool NpsUrl(string? url) => HttpUrl(url) && Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
        (uri.Host.Equals("nps.gov", StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith(".nps.gov", StringComparison.OrdinalIgnoreCase));
}
