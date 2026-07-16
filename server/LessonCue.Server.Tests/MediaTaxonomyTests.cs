using LessonCue.Server;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class MediaTaxonomyTests
{
    [Fact]
    public void ApprovedSelectionsUseCanonicalFolderAndTagNames()
    {
        var organization = new Organization { Name = "Test" };
        MediaTaxonomy.Store(organization, new MediaTaxonomySnapshot(
            ["Elementary/Science", "General"], ["Reusable", "Grade 6"]));

        var selection = MediaTaxonomy.Validate(organization, "elementary/science", "grade 6, REUSABLE");

        Assert.Null(selection.Error);
        Assert.Equal("Elementary/Science", selection.Folder);
        Assert.Equal("Grade 6, Reusable", selection.TagsCsv);
    }

    [Fact]
    public void UnapprovedSelectionsAreRejected()
    {
        var organization = new Organization { Name = "Test" };
        MediaTaxonomy.Store(organization, new MediaTaxonomySnapshot(["General"], ["Reusable"]));

        var folder = MediaTaxonomy.Validate(organization, "Private", "Reusable");
        var tag = MediaTaxonomy.Validate(organization, "General", "Unreviewed");

        Assert.Contains("not approved", folder.Error);
        Assert.Contains("not approved", tag.Error);
    }

    [Fact]
    public async Task UpgradeImportsExistingMediaFoldersAndTags()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<LessonCueDb>().UseSqlite(connection).Options;
        await using var db = new LessonCueDb(options);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        db.Organizations.Add(new Organization { Name = "Test" });
        db.MediaAssets.Add(new MediaAsset
        {
            FileName = "sample.mp4", RelativePath = "sample.mp4", Folder = "Legacy/Audio", TagsCsv = "Welcome, Reusable"
        });
        await db.SaveChangesAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Organizations\" DROP COLUMN \"MediaFoldersJson\"", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Organizations\" DROP COLUMN \"MediaTagsJson\"", cancellationToken);
        db.ChangeTracker.Clear();

        await DatabaseUpgrade.ApplyAsync(db, cancellationToken);

        var organization = await db.Organizations.AsNoTracking().SingleAsync(cancellationToken);
        var taxonomy = MediaTaxonomy.Read(organization);
        Assert.Contains("Legacy/Audio", taxonomy.Folders);
        Assert.Contains("Welcome", taxonomy.Tags);
        Assert.Contains("Reusable", taxonomy.Tags);
    }
}
