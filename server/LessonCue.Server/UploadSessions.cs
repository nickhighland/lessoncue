using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server;

public static class UploadSessionStates
{
    public const string Active = "active";
    public const string Paused = "paused";
    public const string Failed = "failed";
    public const string Completing = "completing";
    public const string Complete = "complete";
    public const string Cancelled = "cancelled";
    public const string Expired = "expired";

    public static readonly string[] Reserving = [Active, Paused, Failed, Completing];
}

public sealed record UploadQuotaPolicy(
    long MaxFileBytes,
    long MaxDailyBytes,
    int MaxActiveSessionsPerUser,
    IReadOnlyDictionary<string, long> UserDailyBytes,
    IReadOnlyDictionary<string, long> RoleDailyBytes,
    IReadOnlyDictionary<string, long> ClassDailyBytes,
    IReadOnlySet<string> AllowedVideoCodecs,
    IReadOnlySet<string> AllowedAudioCodecs)
{
    public const long HardMaximumFileBytes = 100L * 1024 * 1024 * 1024;
    public const int HardMaximumActiveSessions = 10;

    public static UploadQuotaPolicy Read(Organization organization)
    {
        try
        {
            var input = JsonSerializer.Deserialize<UploadQuotaPolicyInput>(
                organization.UploadQuotaPolicyJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return Normalize(input);
        }
        catch (JsonException)
        {
            return Normalize(null);
        }
    }

    public static UploadQuotaPolicy Normalize(UploadQuotaPolicyInput? input) => new(
        Math.Clamp(input?.MaxFileBytes ?? 0, 0, HardMaximumFileBytes),
        Math.Max(0, input?.MaxDailyBytes ?? 0),
        Math.Clamp(input?.MaxActiveSessionsPerUser ?? 3, 1, HardMaximumActiveSessions),
        NormalizeLimits(input?.UserDailyBytes),
        NormalizeLimits(input?.RoleDailyBytes),
        NormalizeLimits(input?.ClassDailyBytes),
        NormalizeCodecs(input?.AllowedVideoCodecs),
        NormalizeCodecs(input?.AllowedAudioCodecs));

    public static void Store(Organization organization, UploadQuotaPolicyInput input)
    {
        var policy = Normalize(input);
        organization.UploadQuotaPolicyJson = JsonSerializer.Serialize(new UploadQuotaPolicyInput(
            policy.MaxFileBytes,
            policy.MaxDailyBytes,
            policy.MaxActiveSessionsPerUser,
            policy.UserDailyBytes.ToDictionary(),
            policy.RoleDailyBytes.ToDictionary(),
            policy.ClassDailyBytes.ToDictionary(),
            policy.AllowedVideoCodecs.Order().ToList(),
            policy.AllowedAudioCodecs.Order().ToList()));
    }

    public long UserLimit(Guid ownerId, string username, string role)
    {
        var limits = new List<long>();
        if (MaxDailyBytes > 0) limits.Add(MaxDailyBytes);
        AddLimit(UserDailyBytes, ownerId.ToString(), limits);
        AddLimit(UserDailyBytes, username, limits);
        AddLimit(RoleDailyBytes, role, limits);
        return limits.Count == 0 ? 0 : limits.Min();
    }

    public long ClassLimit(Guid? classId, string? className)
    {
        if (classId is not { } id) return 0;
        var limits = new List<long>();
        AddLimit(ClassDailyBytes, id.ToString(), limits);
        if (!string.IsNullOrWhiteSpace(className)) AddLimit(ClassDailyBytes, className, limits);
        return limits.Count == 0 ? 0 : limits.Min();
    }

    public bool Allows(string? videoCodec, string? audioCodec) =>
        (AllowedVideoCodecs.Count == 0 || videoCodec is null || AllowedVideoCodecs.Contains(videoCodec)) &&
        (AllowedAudioCodecs.Count == 0 || audioCodec is null || AllowedAudioCodecs.Contains(audioCodec));

    private static void AddLimit(IReadOnlyDictionary<string, long> source, string key, ICollection<long> target)
    {
        if (source.TryGetValue(key, out var value) && value > 0) target.Add(value);
    }

    private static IReadOnlyDictionary<string, long> NormalizeLimits(Dictionary<string, long>? values) =>
        (values ?? []).Where(value => !string.IsNullOrWhiteSpace(value.Key) && value.Value > 0)
            .Take(500)
            .ToDictionary(value => value.Key.Trim(), value => value.Value, StringComparer.OrdinalIgnoreCase);

    private static IReadOnlySet<string> NormalizeCodecs(List<string>? values) =>
        (values ?? []).Select(value => value.Trim().ToLowerInvariant())
            .Where(value => value.Length is > 0 and <= 40 && value.All(character =>
                char.IsAsciiLetterOrDigit(character) || character is '-' or '_' or '.'))
            .Take(100)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
}

public static class UploadChunkBitmap
{
    public static string Empty(int chunkCount)
    {
        if (chunkCount is < 1 or > 100_000) throw new ArgumentOutOfRangeException(nameof(chunkCount));
        return new string('0', chunkCount);
    }

    public static bool Has(string bitmap, int index) =>
        index >= 0 && index < bitmap.Length && bitmap[index] == '1';

    public static string Set(string bitmap, int index, bool received = true)
    {
        if (index < 0 || index >= bitmap.Length) throw new ArgumentOutOfRangeException(nameof(index));
        var value = received ? '1' : '0';
        if (bitmap[index] == value) return bitmap;
        var characters = bitmap.ToCharArray();
        characters[index] = value;
        return new string(characters);
    }

    public static IReadOnlyList<int> Missing(string bitmap) =>
        bitmap.Select((value, index) => (value, index))
            .Where(entry => entry.value != '1')
            .Select(entry => entry.index)
            .ToArray();
}

public sealed record UploadCreateResult(
    UploadSession? Session,
    StorageSnapshot? Storage,
    int StatusCode,
    string? Error)
{
    public bool Success => Session is not null;
}

public sealed record UploadWriteResult(UploadSession? Session, int StatusCode, string? Error)
{
    public bool Success => Session is not null;
}

public sealed record UploadCompletionResult(
    MediaAsset? Media,
    bool Duplicate,
    int StatusCode,
    string? Error)
{
    public bool Success => Media is not null;
}

public sealed class UploadSessionService(
    IServiceScopeFactory scopes,
    MediaStoragePaths paths,
    StorageService storage,
    ILogger<UploadSessionService> logger) : BackgroundService
{
    public const int ChunkSize = 8 * 1024 * 1024;
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(24);
    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _sessionLocks = new();

    public async Task<UploadCreateResult> CreateAsync(
        LessonCueDb db,
        Guid ownerAccountId,
        string ownerUsername,
        string ownerRole,
        UploadCreateInput input,
        CancellationToken ct,
        bool singleChunk = false)
    {
        var fileName = Path.GetFileName(input.FileName?.Trim() ?? "");
        if (string.IsNullOrWhiteSpace(fileName) || fileName.Length > 255)
            return Failure(StatusCodes.Status400BadRequest, "A valid file name is required.");
        if (input.TotalBytes is <= 0 or > UploadQuotaPolicy.HardMaximumFileBytes)
            return Failure(StatusCodes.Status400BadRequest, "The upload size must be between 1 byte and 100 GB.");
        if (singleChunk && input.TotalBytes > 16L * 1024 * 1024)
            return Failure(StatusCodes.Status413PayloadTooLarge,
                "Legacy multipart uploads are limited to 16 MB. Refresh LessonCue to use resumable uploads.");
        if (!MediaFormatCatalog.IsSupported(Path.GetExtension(fileName)))
            return Failure(StatusCodes.Status400BadRequest, "Unsupported media type.");
        if (!ValidSha256(input.ExpectedSha256))
            return Failure(StatusCodes.Status400BadRequest, "The expected SHA-256 must contain exactly 64 hexadecimal characters.");

        var organization = await db.Organizations.OrderBy(item => item.Id).FirstAsync(ct);
        var selection = MediaTaxonomy.Validate(organization, input.Folder, input.TagsCsv);
        if (selection.Error is not null) return Failure(StatusCodes.Status400BadRequest, selection.Error);

        Lesson? lesson = null;
        string? className = null;
        if (!input.Persistent)
        {
            if (input.LessonId is not Guid lessonId)
                return Failure(StatusCodes.Status400BadRequest,
                    "Choose the lesson this upload belongs to, or choose Keep permanently.");
            lesson = await db.Lessons.Include(value => value.Class)
                .SingleOrDefaultAsync(value => value.Id == lessonId, ct);
            if (lesson is null) return Failure(StatusCodes.Status400BadRequest, "The selected lesson does not exist.");
            className = lesson.Class?.Name;
        }

        var policy = UploadQuotaPolicy.Read(organization);
        if (policy.MaxFileBytes > 0 && input.TotalBytes > policy.MaxFileBytes)
            return Failure(StatusCodes.Status413PayloadTooLarge,
                $"This server limits each upload to {FormatBytes(policy.MaxFileBytes)}.");

        var now = DateTimeOffset.UtcNow;
        var activeSessions = await db.UploadSessions.Where(value =>
            value.OwnerAccountId == ownerAccountId &&
            (value.State == UploadSessionStates.Active ||
             value.State == UploadSessionStates.Paused ||
             value.State == UploadSessionStates.Failed ||
             value.State == UploadSessionStates.Completing))
            .Select(value => value.ExpiresAt).ToListAsync(ct);
        var active = activeSessions.Count(value => value > now);
        if (active >= policy.MaxActiveSessionsPerUser)
            return Failure(StatusCodes.Status429TooManyRequests,
                $"Finish or cancel an existing upload first. This account may keep {policy.MaxActiveSessionsPerUser} uploads active at once.");

        var dayStart = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        var userLimit = policy.UserLimit(ownerAccountId, ownerUsername, ownerRole);
        if (userLimit > 0)
        {
            var userCommitted = await DailyCommittedAsync(db.UploadSessions.Where(value =>
                value.OwnerAccountId == ownerAccountId), dayStart, now, ct);
            if (input.TotalBytes > userLimit - Math.Min(userLimit, userCommitted))
                return Failure(StatusCodes.Status429TooManyRequests,
                    $"This upload would exceed the account's {FormatBytes(userLimit)} daily upload allowance.");
        }

        var classLimit = policy.ClassLimit(lesson?.ClassId, className);
        if (classLimit > 0 && lesson is not null)
        {
            var classCommitted = await DailyCommittedAsync(db.UploadSessions.Where(value =>
                value.ClassId == lesson.ClassId), dayStart, now, ct);
            if (input.TotalBytes > classLimit - Math.Min(classLimit, classCommitted))
                return Failure(StatusCodes.Status429TooManyRequests,
                    $"This upload would exceed the class's {FormatBytes(classLimit)} daily upload allowance.");
        }

        var chunkSize = singleChunk ? checked((int)input.TotalBytes) : ChunkSize;
        var chunkCount = checked((int)((input.TotalBytes + chunkSize - 1) / chunkSize));
        var session = new UploadSession
        {
            OwnerAccountId = ownerAccountId,
            OwnerUsername = ownerUsername,
            OwnerRole = ownerRole,
            FileName = fileName,
            DeclaredContentType = NormalizeContentType(input.ContentType),
            ExpectedLength = input.TotalBytes,
            ChunkSize = chunkSize,
            ChunkCount = chunkCount,
            ChunkBitmap = UploadChunkBitmap.Empty(chunkCount),
            ExpectedSha256 = input.ExpectedSha256?.Trim().ToLowerInvariant(),
            ReservedBytes = input.TotalBytes,
            Persistent = input.Persistent,
            LessonId = lesson?.Id,
            ClassId = lesson?.ClassId,
            Folder = selection.Folder,
            TagsCsv = selection.TagsCsv,
            DurationMs = input.DurationMs,
            ExpiresAt = now.Add(SessionLifetime),
            CreatedAt = now,
            UpdatedAt = now
        };

        var reservation = await storage.ReserveUploadAsync(db, session, ct);
        return reservation.Allowed
            ? new UploadCreateResult(session, reservation.Snapshot, StatusCodes.Status201Created, null)
            : new UploadCreateResult(null, reservation.Snapshot, StatusCodes.Status507InsufficientStorage,
                reservation.Error ?? "There is not enough allocated storage for this upload.");
    }

    public async Task<UploadWriteResult> WriteChunkAsync(
        LessonCueDb db,
        Guid uploadId,
        Guid ownerAccountId,
        int index,
        Stream source,
        long suppliedLength,
        CancellationToken ct)
    {
        var gate = _sessionLocks.GetOrAdd(uploadId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var session = await OwnedSessionAsync(db, uploadId, ownerAccountId, ct);
            if (session is null) return WriteFailure(StatusCodes.Status404NotFound, "Upload session not found.");
            if (session.ExpiresAt <= DateTimeOffset.UtcNow)
                return WriteFailure(StatusCodes.Status410Gone, "This upload session expired. Start the upload again.");
            if (session.State == UploadSessionStates.Paused)
                return WriteFailure(StatusCodes.Status409Conflict, "This upload is paused. Resume it before sending another chunk.");
            if (session.State is UploadSessionStates.Cancelled or UploadSessionStates.Expired or UploadSessionStates.Complete)
                return WriteFailure(StatusCodes.Status409Conflict, $"This upload is already {session.State}.");
            if (index < 0 || index >= session.ChunkCount)
                return WriteFailure(StatusCodes.Status400BadRequest, "The upload chunk index is outside this session.");

            var expectedLength = ExpectedChunkLength(session, index);
            if (suppliedLength != expectedLength)
                return WriteFailure(StatusCodes.Status400BadRequest,
                    $"Chunk {index} must contain exactly {expectedLength} bytes.");

            var folder = SessionFolder(uploadId);
            Directory.CreateDirectory(folder);
            var destination = ChunkPath(folder, index);
            var temporary = destination + $".{Guid.NewGuid():N}.partial";
            try
            {
                await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                    64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan))
                {
                    await CopyExactAsync(source, output, expectedLength, ct);
                    await output.FlushAsync(ct);
                }
                File.Move(temporary, destination, true);
            }
            catch (OperationCanceledException)
            {
                TryDelete(temporary);
                throw;
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException)
            {
                TryDelete(temporary);
                session.State = UploadSessionStates.Failed;
                session.FailureReason = $"Chunk {index} could not be stored: {error.Message}";
                session.UpdatedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
                return new UploadWriteResult(null, StatusCodes.Status507InsufficientStorage, session.FailureReason);
            }

            if (!UploadChunkBitmap.Has(session.ChunkBitmap, index))
                session.ReceivedBytes += expectedLength;
            session.ChunkBitmap = UploadChunkBitmap.Set(session.ChunkBitmap, index);
            session.State = UploadSessionStates.Active;
            session.FailureReason = null;
            session.UpdatedAt = DateTimeOffset.UtcNow;
            session.ExpiresAt = session.UpdatedAt.Add(SessionLifetime);
            await db.SaveChangesAsync(ct);
            return new UploadWriteResult(session, StatusCodes.Status204NoContent, null);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<UploadWriteResult> ChangeStateAsync(
        LessonCueDb db,
        Guid uploadId,
        Guid ownerAccountId,
        bool pause,
        CancellationToken ct)
    {
        var gate = _sessionLocks.GetOrAdd(uploadId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var session = await OwnedSessionAsync(db, uploadId, ownerAccountId, ct);
            if (session is null) return WriteFailure(StatusCodes.Status404NotFound, "Upload session not found.");
            if (session.ExpiresAt <= DateTimeOffset.UtcNow)
                return WriteFailure(StatusCodes.Status410Gone, "This upload session expired. Start the upload again.");
            if (session.State is UploadSessionStates.Cancelled or UploadSessionStates.Expired or UploadSessionStates.Complete)
                return WriteFailure(StatusCodes.Status409Conflict, $"This upload is already {session.State}.");
            session.State = pause ? UploadSessionStates.Paused : UploadSessionStates.Active;
            session.FailureReason = null;
            session.UpdatedAt = DateTimeOffset.UtcNow;
            session.ExpiresAt = session.UpdatedAt.Add(SessionLifetime);
            await db.SaveChangesAsync(ct);
            return new UploadWriteResult(session, StatusCodes.Status200OK, null);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<UploadWriteResult> CancelAsync(
        LessonCueDb db,
        Guid uploadId,
        Guid ownerAccountId,
        CancellationToken ct)
    {
        var gate = _sessionLocks.GetOrAdd(uploadId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var session = await OwnedSessionAsync(db, uploadId, ownerAccountId, ct);
            if (session is null) return WriteFailure(StatusCodes.Status404NotFound, "Upload session not found.");
            DeleteSessionFiles(uploadId);
            session.State = UploadSessionStates.Cancelled;
            session.FailureReason = null;
            session.ReservedBytes = 0;
            session.ReceivedBytes = 0;
            session.UpdatedAt = DateTimeOffset.UtcNow;
            session.ExpiresAt = session.UpdatedAt.AddDays(7);
            await db.SaveChangesAsync(ct);
            return new UploadWriteResult(session, StatusCodes.Status204NoContent, null);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<UploadCompletionResult> CompleteAsync(
        LessonCueDb db,
        Guid uploadId,
        Guid ownerAccountId,
        UploadCompleteInput input,
        CancellationToken ct)
    {
        var gate = _sessionLocks.GetOrAdd(uploadId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var session = await OwnedSessionAsync(db, uploadId, ownerAccountId, ct);
            if (session is null) return CompletionFailure(StatusCodes.Status404NotFound, "Upload session not found.");
            if (session.ExpiresAt <= DateTimeOffset.UtcNow)
                return CompletionFailure(StatusCodes.Status410Gone, "This upload session expired. Start the upload again.");
            if (session.State == UploadSessionStates.Paused)
                return CompletionFailure(StatusCodes.Status409Conflict, "Resume this upload before completing it.");
            if (session.State == UploadSessionStates.Complete && session.MediaAssetId is { } mediaId)
            {
                var completed = await db.MediaAssets.SingleOrDefaultAsync(value => value.Id == mediaId, ct);
                return completed is null
                    ? CompletionFailure(StatusCodes.Status409Conflict, "The completed media item is no longer available.")
                    : new UploadCompletionResult(completed, false, StatusCodes.Status200OK, null);
            }
            if (input.TotalChunks is { } suppliedChunks && suppliedChunks != session.ChunkCount)
                return CompletionFailure(StatusCodes.Status400BadRequest, "The supplied chunk count does not match this upload session.");
            if (input.FileName is { Length: > 0 } suppliedName &&
                !string.Equals(Path.GetFileName(suppliedName), session.FileName, StringComparison.Ordinal))
                return CompletionFailure(StatusCodes.Status400BadRequest, "The supplied file name does not match this upload session.");

            var missing = UploadChunkBitmap.Missing(session.ChunkBitmap);
            if (missing.Count > 0)
                return CompletionFailure(StatusCodes.Status409Conflict,
                    $"Upload chunks are still missing: {string.Join(", ", missing.Take(20))}{(missing.Count > 20 ? "…" : "")}");

            session.DurationMs = input.DurationMs ?? session.DurationMs;
            session.State = UploadSessionStates.Completing;
            session.FailureReason = null;
            session.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            var folder = SessionFolder(uploadId);
            var assembled = Path.Combine(folder, "assembled.partial");
            var mediaIdForUpload = Guid.NewGuid();
            var extension = Path.GetExtension(session.FileName).ToLowerInvariant();
            var storedName = mediaIdForUpload + extension;
            var destination = Path.Combine(paths.Originals, storedName);
            var completionCt = CancellationToken.None;
            try
            {
                Directory.CreateDirectory(folder);
                Directory.CreateDirectory(paths.Originals);
                var assembledBytes = File.Exists(assembled) ? new FileInfo(assembled).Length : 0;
                if (assembledBytes < 0 || assembledBytes > session.ExpectedLength ||
                    assembledBytes != session.ExpectedLength && assembledBytes % session.ChunkSize != 0)
                    throw new InvalidDataException("The interrupted assembly checkpoint is not aligned to a complete upload chunk.");
                var firstRemainingChunk = assembledBytes == session.ExpectedLength
                    ? session.ChunkCount
                    : checked((int)(assembledBytes / session.ChunkSize));
                using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
                if (assembledBytes > 0)
                {
                    await using var existingAssembly = new FileStream(assembled, FileMode.Open, FileAccess.Read,
                        FileShare.Read, 128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
                    var existingBuffer = new byte[128 * 1024];
                    while (true)
                    {
                        var read = await existingAssembly.ReadAsync(existingBuffer, completionCt);
                        if (read == 0) break;
                        hash.AppendData(existingBuffer, 0, read);
                    }
                }
                await using (var output = new FileStream(assembled, FileMode.Append, FileAccess.Write, FileShare.None,
                    128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan))
                {
                    var buffer = new byte[128 * 1024];
                    for (var index = firstRemainingChunk; index < session.ChunkCount; index++)
                    {
                        var chunkPath = ChunkPath(folder, index);
                        await using var chunk = new FileStream(chunkPath, FileMode.Open, FileAccess.Read, FileShare.Read,
                            128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
                        while (true)
                        {
                            var read = await chunk.ReadAsync(buffer, completionCt);
                            if (read == 0) break;
                            assembledBytes += read;
                            if (assembledBytes > session.ExpectedLength)
                                throw new InvalidDataException("The uploaded chunks exceed the declared file length.");
                            hash.AppendData(buffer, 0, read);
                            await output.WriteAsync(buffer.AsMemory(0, read), completionCt);
                        }
                        await chunk.DisposeAsync();
                        await output.FlushAsync(completionCt);
                        File.Delete(chunkPath);
                    }
                    await output.FlushAsync(completionCt);
                }
                if (assembledBytes != session.ExpectedLength)
                    throw new InvalidDataException(
                        $"The completed file contains {assembledBytes} bytes; {session.ExpectedLength} were expected.");

                var sha = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
                if (session.ExpectedSha256 is not null &&
                    !CryptographicOperations.FixedTimeEquals(
                        Convert.FromHexString(session.ExpectedSha256),
                        Convert.FromHexString(sha)))
                    throw new InvalidDataException("The completed file's SHA-256 does not match the value supplied when the upload began.");

                var inspection = MediaContentInspector.Inspect(assembled, session.FileName);
                if (!inspection.Valid) throw new InvalidDataException(inspection.Error);
                session.ContentSha256 = sha;

                var existing = await db.MediaAssets.FirstOrDefaultAsync(value => value.Sha256 == sha, completionCt);
                Lesson? retentionLesson = null;
                if (!session.Persistent)
                {
                    retentionLesson = await db.Lessons.SingleOrDefaultAsync(
                        value => value.Id == session.LessonId, completionCt);
                    if (retentionLesson is null)
                        throw new InvalidDataException("The lesson selected for this temporary upload no longer exists.");
                }

                if (existing is not null)
                {
                    TryDelete(assembled);
                    if (session.Persistent) MediaRetention.KeepPermanently(existing);
                    else if (existing.StoragePolicy == MediaRetention.LessonScoped)
                        MediaRetention.KeepForLesson(existing, retentionLesson!);
                    if (!string.IsNullOrWhiteSpace(session.Folder)) existing.Folder = session.Folder;
                    if (!string.IsNullOrWhiteSpace(session.TagsCsv)) existing.TagsCsv = session.TagsCsv;
                    CompleteSession(session, existing.Id);
                    await db.SaveChangesAsync(completionCt);
                    DeleteSessionFiles(uploadId);
                    return new UploadCompletionResult(existing, true, StatusCodes.Status200OK, null);
                }

                File.Move(assembled, destination, false);
                var media = new MediaAsset
                {
                    Id = mediaIdForUpload,
                    FileName = session.FileName,
                    ContentType = inspection.ContentType,
                    RelativePath = storedName,
                    Sha256 = sha,
                    SizeBytes = session.ExpectedLength,
                    DurationMs = session.DurationMs,
                    Folder = session.Folder,
                    TagsCsv = session.TagsCsv
                };
                if (session.Persistent) MediaRetention.KeepPermanently(media);
                else MediaRetention.SetNewUploadPolicy(media, retentionLesson!);
                db.MediaAssets.Add(media);
                CompleteSession(session, media.Id);
                db.AuditEvents.Add(new AuditEvent
                {
                    Actor = session.OwnerUsername,
                    Action = "media.upload.complete",
                    Object = media.Id.ToString(),
                    Summary = media.FileName
                });
                await db.SaveChangesAsync(completionCt);
                DeleteSessionFiles(uploadId);
                return new UploadCompletionResult(media, false, StatusCodes.Status201Created, null);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException or
                CryptographicException or DbUpdateException)
            {
                TryDelete(assembled);
                TryDelete(destination);
                db.ChangeTracker.Clear();
                var failed = await db.UploadSessions.SingleAsync(value => value.Id == uploadId, CancellationToken.None);
                ResetFailedSession(failed, error.Message);
                await db.SaveChangesAsync(CancellationToken.None);
                return CompletionFailure(
                    error is IOException or UnauthorizedAccessException
                        ? StatusCodes.Status507InsufficientStorage
                        : StatusCodes.Status400BadRequest,
                    failed.FailureReason!);
            }
        }
        finally
        {
            gate.Release();
        }
    }

    public object Status(UploadSession session) => new
    {
        session.Id,
        session.FileName,
        session.ExpectedLength,
        session.ChunkSize,
        session.ChunkCount,
        session.ReceivedBytes,
        session.State,
        session.FailureReason,
        session.ContentSha256,
        session.CreatedAt,
        session.UpdatedAt,
        session.ExpiresAt,
        session.CompletedAt,
        session.MediaAssetId,
        progressPercent = session.ExpectedLength == 0
            ? 0
            : Math.Round(session.ReceivedBytes * 100d / session.ExpectedLength, 1),
        receivedChunks = session.ChunkBitmap.Count(value => value == '1'),
        missingChunks = UploadChunkBitmap.Missing(session.ChunkBitmap)
    };

    public Task<UploadSession?> OwnedSessionAsync(
        LessonCueDb db,
        Guid uploadId,
        Guid ownerAccountId,
        CancellationToken ct) =>
        db.UploadSessions.SingleOrDefaultAsync(value =>
            value.Id == uploadId && value.OwnerAccountId == ownerAccountId, ct);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupAsync(DateTimeOffset.UtcNow, stoppingToken);
                await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception error)
            {
                logger.LogError(error, "Upload-session cleanup failed");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    public async Task<int> CleanupAsync(DateTimeOffset now, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LessonCueDb>();
        var reserving = await db.UploadSessions.Where(value =>
            (value.State == UploadSessionStates.Active ||
             value.State == UploadSessionStates.Paused ||
             value.State == UploadSessionStates.Failed ||
             value.State == UploadSessionStates.Completing)).ToListAsync(ct);
        var expired = reserving.Where(value => value.ExpiresAt <= now).ToList();
        foreach (var session in expired)
        {
            var gate = _sessionLocks.GetOrAdd(session.Id, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(ct);
            try
            {
                DeleteSessionFiles(session.Id);
                session.State = UploadSessionStates.Expired;
                session.FailureReason = "The upload expired after 24 hours without activity.";
                session.ReservedBytes = 0;
                session.ReceivedBytes = 0;
                session.UpdatedAt = now;
                session.ExpiresAt = now.AddDays(7);
            }
            finally
            {
                gate.Release();
                _sessionLocks.TryRemove(session.Id, out _);
            }
        }

        var removeBefore = now.AddDays(-30);
        var completedHistory = await db.UploadSessions.Where(value =>
            value.State != UploadSessionStates.Active &&
            value.State != UploadSessionStates.Paused &&
            value.State != UploadSessionStates.Failed &&
            value.State != UploadSessionStates.Completing).ToListAsync(ct);
        var historical = completedHistory.Where(value => value.UpdatedAt < removeBefore).ToList();
        db.UploadSessions.RemoveRange(historical);
        await db.SaveChangesAsync(ct);

        var temporaryRoot = Path.Combine(paths.DataPath, "media", "temporary");
        if (Directory.Exists(temporaryRoot))
        {
            var known = await db.UploadSessions.Select(value => value.Id).ToHashSetAsync(ct);
            foreach (var directory in Directory.EnumerateDirectories(temporaryRoot))
            {
                if (!Guid.TryParseExact(Path.GetFileName(directory), "N", out var id) || known.Contains(id)) continue;
                try
                {
                    if (Directory.GetLastWriteTimeUtc(directory) < now.UtcDateTime.AddDays(-1))
                        Directory.Delete(directory, true);
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException)
                {
                    logger.LogWarning(error, "Could not remove abandoned upload directory {Directory}", directory);
                }
            }
        }
        return expired.Count + historical.Count;
    }

    private static async Task<long> DailyCommittedAsync(
        IQueryable<UploadSession> query,
        DateTimeOffset dayStart,
        DateTimeOffset now,
        CancellationToken ct)
    {
        var sessions = await query.Select(value => new
        {
            value.State,
            value.ExpectedLength,
            value.CreatedAt,
            value.CompletedAt,
            value.ExpiresAt
        }).ToListAsync(ct);
        return sessions.Where(value =>
                value.CreatedAt >= dayStart &&
                ((value.State == UploadSessionStates.Complete && value.CompletedAt >= dayStart) ||
                 ((value.State == UploadSessionStates.Active ||
                   value.State == UploadSessionStates.Paused ||
                   value.State == UploadSessionStates.Failed ||
                   value.State == UploadSessionStates.Completing) &&
                  value.ExpiresAt > now)))
            .Sum(value => value.ExpectedLength);
    }

    private static long ExpectedChunkLength(UploadSession session, int index)
    {
        var offset = (long)index * session.ChunkSize;
        return Math.Min(session.ChunkSize, session.ExpectedLength - offset);
    }

    private static async Task CopyExactAsync(Stream source, Stream destination, long expected, CancellationToken ct)
    {
        var buffer = new byte[64 * 1024];
        long written = 0;
        while (written < expected)
        {
            var wanted = (int)Math.Min(buffer.Length, expected - written);
            var read = await source.ReadAsync(buffer.AsMemory(0, wanted), ct);
            if (read == 0) throw new InvalidDataException($"The request ended after {written} of {expected} bytes.");
            await destination.WriteAsync(buffer.AsMemory(0, read), ct);
            written += read;
        }
        if (await source.ReadAsync(buffer.AsMemory(0, 1), ct) != 0)
            throw new InvalidDataException($"The request contains more than the expected {expected} bytes.");
    }

    private string SessionFolder(Guid uploadId) =>
        Path.Combine(paths.DataPath, "media", "temporary", uploadId.ToString("N"));

    private static string ChunkPath(string folder, int index) => Path.Combine(folder, index.ToString("D8"));

    private void DeleteSessionFiles(Guid uploadId)
    {
        var folder = SessionFolder(uploadId);
        if (!Directory.Exists(folder)) return;
        try { Directory.Delete(folder, true); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(error, "Could not remove upload session directory {UploadId}", uploadId);
        }
    }

    private static void CompleteSession(UploadSession session, Guid mediaAssetId)
    {
        session.State = UploadSessionStates.Complete;
        session.MediaAssetId = mediaAssetId;
        session.ReceivedBytes = session.ExpectedLength;
        session.ReservedBytes = 0;
        session.FailureReason = null;
        session.CompletedAt = DateTimeOffset.UtcNow;
        session.UpdatedAt = session.CompletedAt.Value;
        session.ExpiresAt = session.CompletedAt.Value.AddDays(30);
    }

    private static void ResetFailedSession(UploadSession session, string reason)
    {
        session.State = UploadSessionStates.Failed;
        session.FailureReason = $"The upload could not be completed: {reason}";
        session.ChunkBitmap = UploadChunkBitmap.Empty(session.ChunkCount);
        session.ReceivedBytes = 0;
        session.UpdatedAt = DateTimeOffset.UtcNow;
        session.ExpiresAt = session.UpdatedAt.Add(SessionLifetime);
    }

    private static bool ValidSha256(string? value) =>
        string.IsNullOrWhiteSpace(value) ||
        value.Trim().Length == 64 && value.Trim().All(Uri.IsHexDigit);

    private static string NormalizeContentType(string? value) =>
        string.IsNullOrWhiteSpace(value) || value.Length > 100
            ? "application/octet-stream"
            : value.Split(';', 2)[0].Trim().ToLowerInvariant();

    private static string FormatBytes(long value) =>
        value >= 1024L * 1024 * 1024
            ? $"{value / (1024d * 1024 * 1024):0.##} GB"
            : $"{value / (1024d * 1024):0.##} MB";

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private static UploadCreateResult Failure(int statusCode, string error) =>
        new(null, null, statusCode, error);

    private static UploadWriteResult WriteFailure(int statusCode, string error) =>
        new(null, statusCode, error);

    private static UploadCompletionResult CompletionFailure(int statusCode, string error) =>
        new(null, false, statusCode, error);
}
