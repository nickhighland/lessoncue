using System.Text.Json;

namespace LessonCue.Server;

public sealed record MediaTaxonomySnapshot(IReadOnlyList<string> Folders, IReadOnlyList<string> Tags);
public sealed record MediaTaxonomySelection(string Folder, string TagsCsv, string? Error = null);

public static class MediaTaxonomy
{
    public static readonly string[] DefaultFolders = ["General", "Lessons", "Signage"];
    public static readonly string[] DefaultTags = ["Reusable", "Intro", "Outro", "Reference"];

    public static MediaTaxonomySnapshot Read(Organization organization) => new(
        ReadList(organization.MediaFoldersJson, DefaultFolders, NormalizeFolder),
        ReadList(organization.MediaTagsJson, DefaultTags, NormalizeTag));

    public static bool TryCreate(IEnumerable<string>? folders, IEnumerable<string>? tags,
        out MediaTaxonomySnapshot snapshot, out string? error)
    {
        var normalizedFolders = new List<string>();
        foreach (var value in folders ?? [])
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            if (value.Length > 120 || value.Any(char.IsControl))
            {
                snapshot = new([], []); error = "Folder paths must be 120 characters or fewer."; return false;
            }
            var normalized = NormalizeFolder(value);
            if (normalized.Length == 0)
            {
                snapshot = new([], []); error = "Folder paths must contain a usable name."; return false;
            }
            if (!normalizedFolders.Contains(normalized, StringComparer.OrdinalIgnoreCase)) normalizedFolders.Add(normalized);
        }
        var normalizedTags = new List<string>();
        foreach (var value in tags ?? [])
        {
            var trimmed = value.Trim();
            if (trimmed.Length == 0) continue;
            if (trimmed.Length > 40 || trimmed.Contains(',') || trimmed.Any(char.IsControl))
            {
                snapshot = new([], []); error = "Tags must be 40 characters or fewer and cannot contain commas."; return false;
            }
            var normalized = NormalizeTag(trimmed);
            if (!normalizedTags.Contains(normalized, StringComparer.OrdinalIgnoreCase)) normalizedTags.Add(normalized);
        }
        if (normalizedFolders.Count > 100 || normalizedTags.Count > 100)
        {
            snapshot = new([], []); error = "LessonCue supports up to 100 approved folders and 100 approved tags."; return false;
        }
        normalizedFolders.Sort(StringComparer.OrdinalIgnoreCase);
        normalizedTags.Sort(StringComparer.OrdinalIgnoreCase);
        snapshot = new(normalizedFolders, normalizedTags); error = null; return true;
    }

    public static MediaTaxonomySelection Validate(Organization organization, string? folder, string? tagsCsv)
    {
        var taxonomy = Read(organization);
        var normalizedFolder = NormalizeFolder(folder);
        if (normalizedFolder.Length > 0)
        {
            var approved = taxonomy.Folders.FirstOrDefault(value => value.Equals(normalizedFolder, StringComparison.OrdinalIgnoreCase));
            if (approved is null) return new("", "", $"Choose an administrator-approved media folder. ‘{normalizedFolder}’ is not approved.");
            normalizedFolder = approved;
        }

        var selectedTags = SplitTags(tagsCsv);
        var canonicalTags = new List<string>();
        foreach (var tag in selectedTags)
        {
            var approved = taxonomy.Tags.FirstOrDefault(value => value.Equals(tag, StringComparison.OrdinalIgnoreCase));
            if (approved is null) return new("", "", $"Choose only administrator-approved media tags. ‘{tag}’ is not approved.");
            if (!canonicalTags.Contains(approved, StringComparer.OrdinalIgnoreCase)) canonicalTags.Add(approved);
        }
        return new(normalizedFolder, string.Join(", ", canonicalTags));
    }

    public static void Store(Organization organization, MediaTaxonomySnapshot snapshot)
    {
        organization.MediaFoldersJson = JsonSerializer.Serialize(snapshot.Folders);
        organization.MediaTagsJson = JsonSerializer.Serialize(snapshot.Tags);
    }

    public static string NormalizeFolder(string? folder)
    {
        if (string.IsNullOrWhiteSpace(folder)) return "";
        var normalized = string.Join("/", folder.Replace('\\', '/').Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Trim()).Where(part => part is not "." and not ".." && part.Length > 0));
        return normalized.Length <= 120 ? normalized : normalized[..120].TrimEnd('/');
    }

    public static string NormalizeTags(string? tags) => string.Join(", ", SplitTags(tags));

    public static IReadOnlyList<string> SplitTags(string? tags)
    {
        var normalized = (tags ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(NormalizeTag).Where(tag => tag.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase).Take(20).ToList();
        while (normalized.Count > 0 && string.Join(", ", normalized).Length > 500) normalized.RemoveAt(normalized.Count - 1);
        return normalized;
    }

    private static string NormalizeTag(string? tag)
    {
        var value = (tag ?? "").Trim();
        return value.Length <= 40 ? value : value[..40];
    }

    private static IReadOnlyList<string> ReadList(string json, IReadOnlyList<string> fallback, Func<string?, string> normalize)
    {
        try
        {
            var values = JsonSerializer.Deserialize<List<string>>(json);
            if (values is null) return fallback;
            return values.Select(normalize).Where(value => value.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase).Take(100).OrderBy(value => value, StringComparer.OrdinalIgnoreCase).ToArray();
        }
        catch { return fallback; }
    }
}
