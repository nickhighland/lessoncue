using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace LessonCue.Server.Activities;

/// <summary>
/// The fixed pool of game codes the shortener reserves.
///
/// Every code is LETTER + DIGIT + LETTER + DIGIT, drawn from an alphabet with
/// 0, 1, I, L and O left out, so a room can read one off a television without
/// arguing about it. The shape also keeps them clear of the words an
/// organization actually wants -- /kids and /give stay available, /Q7Z6 is
/// obviously ours.
///
/// The list is fixed rather than generated. These slugs exist in the
/// shortener, so changing the list would strand links that were already
/// created; a new version belongs in a new file, not in edits to this one.
/// </summary>
public static partial class ReservedGameCodes
{
    [GeneratedRegex(@"^[A-HJKMNP-Z][2-9][A-HJKMNP-Z][2-9]$")]
    private static partial Regex CodeShape();

    /// <summary>Marks these as LessonCue's inside the shortener.</summary>
    public const string ReservedTag = "lessoncue-reserved";
    public const string SystemTag = "lessoncue-system";

    private static readonly Lazy<Pool> Loaded = new(Load, LazyThreadSafetyMode.ExecutionAndPublication);

    public sealed record Pool(int Version, IReadOnlyList<string> Codes);

    public static int Version => Loaded.Value.Version;
    public static IReadOnlyList<string> All => Loaded.Value.Codes;

    /// <summary>Is this one of ours, whatever case it arrives in?</summary>
    public static bool IsReserved(string? code) =>
        !string.IsNullOrWhiteSpace(code) && Lookup.Contains(Normalize(code));

    /// <summary>
    /// Codes are shown in upper case and the shortener resolves them loosely,
    /// so a phone that types q7z6 reaches the same game.
    /// </summary>
    public static string Normalize(string code) => code.Trim().ToUpperInvariant();

    private static readonly Lazy<HashSet<string>> LookupSource =
        new(() => new HashSet<string>(All, StringComparer.Ordinal), LazyThreadSafetyMode.ExecutionAndPublication);
    private static HashSet<string> Lookup => LookupSource.Value;

    private static Pool Load()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("LessonCue.Server.Activities.reserved-game-codes-v1.json")
            ?? throw new InvalidOperationException("The reserved game code pool is missing from the build.");
        var document = JsonSerializer.Deserialize<PoolFile>(stream, ActivityJsonDefaults.Options)
            ?? throw new InvalidOperationException("The reserved game code pool could not be read.");

        var codes = document.Codes ?? [];
        // Validated on the way in rather than trusted: a malformed pool would
        // otherwise surface as short links that quietly do not resolve.
        if (codes.Count != document.Count)
            throw new InvalidOperationException($"The reserved pool says {document.Count} codes but lists {codes.Count}.");
        if (codes.Distinct(StringComparer.Ordinal).Count() != codes.Count)
            throw new InvalidOperationException("The reserved pool repeats a code.");
        var malformed = codes.FirstOrDefault(code => !CodeShape().IsMatch(code));
        if (malformed is not null)
            throw new InvalidOperationException($"The reserved pool contains '{malformed}', which is not LETTER+DIGIT+LETTER+DIGIT without 0, 1, I, L or O.");

        return new Pool(document.Version, codes);
    }

    private sealed record PoolFile(int Version, int Count, List<string>? Codes);
}
