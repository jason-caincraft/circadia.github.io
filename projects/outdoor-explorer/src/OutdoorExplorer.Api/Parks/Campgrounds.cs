using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;

namespace OutdoorExplorer.Api.Parks;

public sealed record CampgroundAmenity(string Name, string Detail);
public sealed record CampsiteType(string Name, int Count);
public sealed record Campground(string Id, string ParkCode, string ParkName, string Name, string? Description,
    string? Location, Coordinates? Coordinates, string[] Fees, string? ReservationDescription,
    string? ReservationUrl, string OfficialUrl, CampsiteType[] SiteTypes, int? TotalSites,
    bool SiteTypesProvided, CampgroundAmenity[] Amenities, bool AmenitiesProvided, string? ProviderDate);

public interface INpsCampgroundsProvider
{
    Task<DataResult<Campground[]>> GetCampgroundsAsync(Park park, CancellationToken token);
}

public sealed partial class NpsProvider
{
    public async Task<DataResult<Campground[]>> GetCampgroundsAsync(Park park, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(options.Value.ApiKey)) throw new NpsUnavailableException();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(token);
        budget.CancelAfter(options.Value.RequestBudget);
        var retrieved = clock.GetUtcNow();
        var campgrounds = new Dictionary<string, Campground>(StringComparer.OrdinalIgnoreCase);
        int start = 0;
        int? total = null;
        try
        {
            for (var pageNumber = 0; pageNumber < 100; pageNumber++)
            {
                using var page = await FetchPageAsync($"campgrounds?parkCode={Uri.EscapeDataString(park.ParkCode)}&limit=50&start={start}", budget.Token);
                var root = page.RootElement;
                if (!int.TryParse(ParkMapper.Text(root, "total"), out var count) || count < 0 ||
                    !int.TryParse(ParkMapper.Text(root, "start"), out var offset) || offset != start ||
                    (total.HasValue && total != count) ||
                    !root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                    throw new NpsUnavailableException();
                total = count;
                var length = data.GetArrayLength();
                if (length > 50 || start + length > count || (length == 0 && start < count)) throw new NpsUnavailableException();
                var before = campgrounds.Count;
                foreach (var raw in data.EnumerateArray())
                {
                    if (!string.Equals(ParkMapper.Text(raw, "parkCode"), park.ParkCode, StringComparison.OrdinalIgnoreCase))
                        throw new NpsUnavailableException();
                    var campground = MapCampground(raw, park);
                    campgrounds.TryAdd(campground.Id, campground);
                }
                if (length > 0 && start > 0 && campgrounds.Count == before) throw new NpsUnavailableException();
                start += length;
                if (start == count) break;
                if (pageNumber == 99) throw new NpsUnavailableException();
            }
            return new(campgrounds.Values.ToArray(), "fresh", retrieved, []);
        }
        catch (Exception ex) when (ex is JsonException or HttpRequestException or OperationCanceledException or InvalidOperationException)
        {
            token.ThrowIfCancellationRequested();
            throw new NpsUnavailableException();
        }
    }

    private static Campground MapCampground(JsonElement raw, Park park)
    {
        var id = Value(raw, "id");
        var name = ParkMapper.Text(raw, "name");
        if (id is null || name is null) throw new NpsUnavailableException();
        var siteData = ObjectOrFirst(raw, "campsites");
        var siteTypes = new List<CampsiteType>();
        foreach (var (key, label) in new[] { ("tentonly", "Tent only"), ("rvonly", "RV only"), ("group", "Group"),
                     ("horse", "Horse"), ("walkboatto", "Walk or boat to"), ("electricalhookups", "Electrical hookups"),
                     ("other", "Other") })
        {
            var count = NonnegativeInt(siteData, key);
            if (count > 0) siteTypes.Add(new(label, count.Value));
        }
        var amenityData = ObjectOrFirst(raw, "amenities");
        var amenities = new List<CampgroundAmenity>();
        foreach (var (key, label) in new[] { ("toilets", "Toilets"), ("potablewater", "Potable water"),
                     ("showers", "Showers"), ("trashrecyclingcollection", "Trash or recycling"),
                     ("dumpstation", "Dump station"), ("campstore", "Camp store"), ("laundry", "Laundry"),
                     ("internetconnectivity", "Internet"), ("cellphonereception", "Cell reception"),
                     ("foodstoragelockers", "Food storage lockers"), ("amphitheater", "Amphitheater"),
                     ("stafforvolunteerhostonsite", "Host on site"), ("iceavailableforsale", "Ice for sale"),
                     ("firewoodforsale", "Firewood for sale") })
        {
            if (!amenityData.HasValue) continue;
            var property = amenityData.Value.EnumerateObject().FirstOrDefault(item =>
                item.Name.Equals(key, StringComparison.OrdinalIgnoreCase) ||
                key == "amphitheater" && item.Name.Equals("ampitheater", StringComparison.OrdinalIgnoreCase));
            if (property.Value.ValueKind == JsonValueKind.Undefined) continue;
            var value = property.Value;
            var details = value.ValueKind == JsonValueKind.Array
                ? value.EnumerateArray().Select(Scalar).Where(v => v is not null).Cast<string>().ToArray()
                : [Scalar(value) ?? ""];
            var present = details.Where(v => v.Length > 0 && !Negative(v)).ToArray();
            if (present.Length > 0) amenities.Add(new(label, string.Join(", ", present)));
        }
        var physical = Array(raw, "addresses").FirstOrDefault(address =>
            string.Equals(ParkMapper.Text(address, "type"), "Physical", StringComparison.OrdinalIgnoreCase));
        var location = physical.ValueKind == JsonValueKind.Object
            ? string.Join(", ", new[] { "line1", "line2", "city", "stateCode", "postalCode" }
                .Select(key => ParkMapper.Text(physical, key)).Where(value => value is not null))
            : null;
        var latitude = Number(raw, "latitude");
        var longitude = Number(raw, "longitude");
        var coordinates = latitude is >= -90 and <= 90 && longitude is >= -180 and <= 180
            ? new Coordinates(latitude.Value, longitude.Value) : null;
        var fees = Array(raw, "fees").Select(fee => fee.ValueKind == JsonValueKind.Object
                ? string.Join(" — ", new[] { ParkMapper.Text(fee, "title"), ParkMapper.Text(fee, "cost"), ParkMapper.Text(fee, "description") }
                    .Where(value => value is not null))
                : Scalar(fee))
            .Where(value => !string.IsNullOrWhiteSpace(value)).Cast<string>().ToArray();
        var reservationUrl = ParkMapper.Text(raw, "reservationsurl");
        if (!Uri.TryCreate(reservationUrl, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.UserInfo.Length > 0)
            reservationUrl = null;
        return new(id, park.ParkCode, park.Name, name, ParkMapper.Text(raw, "description"),
            string.IsNullOrWhiteSpace(location) ? null : location, coordinates, fees,
            ParkMapper.Text(raw, "reservationsdescription"), reservationUrl, park.OfficialUrl,
            [.. siteTypes], NonnegativeInt(siteData, "totalsites"), siteData.HasValue,
            [.. amenities], amenityData.HasValue, ParkMapper.Text(raw, "lastIndexedDate"));
    }

    private static JsonElement? ObjectOrFirst(JsonElement raw, string key)
    {
        if (!raw.TryGetProperty(key, out var value)) return null;
        if (value.ValueKind == JsonValueKind.Object) return value;
        if (value.ValueKind == JsonValueKind.Array)
            return value.EnumerateArray().FirstOrDefault(item => item.ValueKind == JsonValueKind.Object) is { ValueKind: JsonValueKind.Object } first ? first : null;
        return null;
    }

    private static IEnumerable<JsonElement> Array(JsonElement raw, string key) =>
        raw.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Array ? value.EnumerateArray() : [];

    private static string? Scalar(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString()?.Trim(),
        JsonValueKind.Number => value.ToString(),
        JsonValueKind.True => "Yes",
        _ => null
    };

    private static bool Negative(string value) => value.Equals("No", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("None", StringComparison.OrdinalIgnoreCase) || value.Equals("False", StringComparison.OrdinalIgnoreCase) ||
        value.StartsWith("No ", StringComparison.OrdinalIgnoreCase) || value.StartsWith("None ", StringComparison.OrdinalIgnoreCase) ||
        value.StartsWith("Not ", StringComparison.OrdinalIgnoreCase) || value.Equals("0", StringComparison.Ordinal);

    private static int? NonnegativeInt(JsonElement? raw, string key) => raw.HasValue &&
        int.TryParse(Value(raw.Value, key), NumberStyles.None, CultureInfo.InvariantCulture, out var count) && count >= 0 ? count : null;

    private static double? Number(JsonElement raw, string key) =>
        double.TryParse(Value(raw, key), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value) ? value : null;

    private static string? Value(JsonElement raw, string key) => raw.ValueKind == JsonValueKind.Object &&
        raw.TryGetProperty(key, out var value) ? Scalar(value) : null;
}

public sealed class CampgroundsService(INpsCampgroundsProvider provider, TimeProvider clock) : IDisposable
{
    private readonly SemaphoreSlim upstreamSlots = new(4, 4);
    private readonly ConcurrentDictionary<string, SemaphoreSlim> gates = new();
    private readonly ConcurrentDictionary<string, (DataResult<Campground[]>? Result, DateTimeOffset Expires)> cache = new();

    public async Task<DataResult<Campground[]>> GetAsync(Park park, CancellationToken token)
    {
        var gate = gates.GetOrAdd(park.ParkCode, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(token);
        try
        {
            if (cache.TryGetValue(park.ParkCode, out var saved) && clock.GetUtcNow() < saved.Expires)
                return saved.Result ?? throw new NpsUnavailableException();
            try
            {
                if (!await upstreamSlots.WaitAsync(TimeSpan.Zero, token)) throw new NpsUnavailableException();
                try
                {
                    var result = await provider.GetCampgroundsAsync(park, token);
                    cache[park.ParkCode] = (result, result.RetrievedAt.AddMinutes(5));
                    return result;
                }
                finally { upstreamSlots.Release(); }
            }
            catch (NpsUnavailableException)
            {
                cache[park.ParkCode] = (null, clock.GetUtcNow().AddSeconds(30));
                throw;
            }
        }
        finally { gate.Release(); }
    }

    public void Dispose()
    {
        foreach (var gate in gates.Values) gate.Dispose();
        upstreamSlots.Dispose();
    }
}
