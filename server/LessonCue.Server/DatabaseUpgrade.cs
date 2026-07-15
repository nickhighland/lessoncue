using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class DatabaseUpgrade
{
    public static Task ApplyAsync(LessonCueDb db, CancellationToken cancellationToken = default) =>
        db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "AdminAccounts" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_AdminAccounts" PRIMARY KEY,
                "Username" TEXT NOT NULL,
                "PasswordHash" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL,
                "LastLoginAt" TEXT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AdminAccounts_Username" ON "AdminAccounts" ("Username");
            """, cancellationToken);
}
