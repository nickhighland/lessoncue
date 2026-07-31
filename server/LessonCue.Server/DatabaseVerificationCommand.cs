using Microsoft.Data.Sqlite;

namespace LessonCue.Server;

public static class DatabaseVerificationCommand
{
    private const string Option = "--verify-database";

    public static bool TryGetPath(string[] args, out string databasePath)
    {
        var index = Array.FindIndex(args, value => string.Equals(value, Option, StringComparison.Ordinal));
        if (index >= 0 && index + 1 < args.Length && !string.IsNullOrWhiteSpace(args[index + 1]))
        {
            databasePath = Path.GetFullPath(args[index + 1]);
            return true;
        }

        databasePath = "";
        return false;
    }

    public static async Task<int> RunAsync(string databasePath, CancellationToken ct = default)
    {
        if (!File.Exists(databasePath))
        {
            Console.Error.WriteLine($"LessonCue database not found at {databasePath}");
            return 2;
        }

        try
        {
            var builder = new SqliteConnectionStringBuilder
            {
                DataSource = databasePath,
                Mode = SqliteOpenMode.ReadOnly,
                Pooling = false
            };
            await using var connection = new SqliteConnection(builder.ConnectionString);
            await connection.OpenAsync(ct);
            await using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA quick_check;";
            var result = Convert.ToString(await command.ExecuteScalarAsync(ct));
            if (string.Equals(result, "ok", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine("LessonCue database verification passed.");
                return 0;
            }

            Console.Error.WriteLine($"LessonCue database verification failed: {result ?? "no result"}");
            return 3;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Console.Error.WriteLine($"LessonCue database verification failed: {ex.Message}");
            return 3;
        }
    }
}
