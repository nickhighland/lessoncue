using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class AdminRecoveryCommand
{
    public static bool IsRequested(string[] args) =>
        args.Contains("--list-admins", StringComparer.Ordinal) ||
        args.Contains("--reset-password", StringComparer.Ordinal);

    public static async Task<int> RunAsync(string[] args, string dataPath, CancellationToken ct = default)
    {
        var databasePath = Path.Combine(dataPath, "database", "lessoncue.db");
        if (!File.Exists(databasePath))
        {
            Console.Error.WriteLine($"LessonCue database not found at {databasePath}");
            Console.Error.WriteLine("Set LESSONCUE_DATA_PATH to the installed LessonCue data directory.");
            return 3;
        }

        var options = new DbContextOptionsBuilder<LessonCueDb>()
            .UseSqlite($"Data Source={databasePath}")
            .Options;
        await using var db = new LessonCueDb(options);
        await DatabaseUpgrade.ApplyAsync(db);

        if (args.Contains("--list-admins", StringComparer.Ordinal))
        {
            var accounts = await db.AdminAccounts.AsNoTracking().OrderBy(x => x.Username).ToListAsync(ct);
            if (accounts.Count == 0)
            {
                Console.WriteLine("No LessonCue administrator accounts exist yet.");
                return 0;
            }

            Console.WriteLine("USERNAME\tROLE\tSTATUS\tNAME");
            foreach (var account in accounts)
                Console.WriteLine($"{account.Username}\t{account.Role}\t{(account.Disabled ? "disabled" : "active")}\t{account.DisplayName}");
            return 0;
        }

        var resetIndex = Array.IndexOf(args, "--reset-password");
        if (resetIndex < 0 || resetIndex + 1 >= args.Length || string.IsNullOrWhiteSpace(args[resetIndex + 1]))
        {
            Console.Error.WriteLine("Usage: LessonCue.Server --reset-password USERNAME");
            return 2;
        }

        var username = args[resetIndex + 1].Trim().ToLowerInvariant();
        var accountToReset = await db.AdminAccounts.SingleOrDefaultAsync(x => x.Username == username, ct);
        if (accountToReset is null)
        {
            Console.Error.WriteLine($"No LessonCue account named '{username}' was found.");
            Console.Error.WriteLine("Run with --list-admins to display local usernames.");
            return 3;
        }

        string password;
        try
        {
            while (true)
            {
                password = ReadSecret("New password: ");
                var validation = AdminCredentialPolicy.Validate(username, password);
                if (validation is not null)
                {
                    Console.Error.WriteLine(validation);
                    continue;
                }
                var confirmation = ReadSecret("Confirm new password: ");
                if (!string.Equals(password, confirmation, StringComparison.Ordinal))
                {
                    Console.Error.WriteLine("Passwords did not match. Try again.");
                    continue;
                }
                break;
            }
        }
        catch (OperationCanceledException) { Console.Error.WriteLine("Password reset cancelled."); return 130; }

        var hasher = new PasswordHasher<AdminAccount>();
        accountToReset.PasswordHash = hasher.HashPassword(accountToReset, password);
        accountToReset.SessionVersion++;
        db.AuditEvents.Add(new AuditEvent
        {
            Actor = "ssh-recovery",
            Action = "user.password.reset",
            Object = accountToReset.Id.ToString(),
            Summary = accountToReset.Username
        });
        await db.SaveChangesAsync(ct);

        Console.WriteLine($"Password reset complete for '{accountToReset.Username}'. Existing browser sessions were signed out.");
        if (accountToReset.Disabled)
            Console.WriteLine("This account is disabled. Sign in with another owner account to enable it.");
        return 0;
    }

    public static async Task<bool> ResetAsync(LessonCueDb db, string username, string password, CancellationToken ct = default)
    {
        var normalizedUsername = username.Trim().ToLowerInvariant();
        var validation = AdminCredentialPolicy.Validate(normalizedUsername, password);
        if (validation is not null) throw new ArgumentException(validation, nameof(password));
        var account = await db.AdminAccounts.SingleOrDefaultAsync(x => x.Username == normalizedUsername, ct);
        if (account is null) return false;
        account.PasswordHash = new PasswordHasher<AdminAccount>().HashPassword(account, password);
        account.SessionVersion++;
        db.AuditEvents.Add(new AuditEvent { Actor = "ssh-recovery", Action = "user.password.reset", Object = account.Id.ToString(), Summary = account.Username });
        await db.SaveChangesAsync(ct);
        return true;
    }

    private static string ReadSecret(string prompt)
    {
        Console.Write(prompt);
        if (Console.IsInputRedirected)
        {
            var redirected = Console.ReadLine() ?? "";
            Console.WriteLine();
            return redirected;
        }

        var characters = new List<char>();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.C && key.Modifiers.HasFlag(ConsoleModifiers.Control))
            {
                Console.WriteLine();
                throw new OperationCanceledException();
            }
            if (key.Key == ConsoleKey.Enter)
            {
                Console.WriteLine();
                return new string(characters.ToArray());
            }
            if (key.Key == ConsoleKey.Backspace)
            {
                if (characters.Count > 0) characters.RemoveAt(characters.Count - 1);
                continue;
            }
            if (!char.IsControl(key.KeyChar)) characters.Add(key.KeyChar);
        }
    }
}
