using System.Diagnostics;
using System.Text.Json;

namespace LessonCue.Server;

public sealed record HardwareAccelerationStatus(
    bool Supported,
    bool Available,
    string Engine,
    string Message,
    DateTimeOffset? LastCheckedAt,
    DateTimeOffset? LastHardwareUseAt,
    DateTimeOffset? LastFallbackAt,
    string? LastError);

public sealed record TranscodeExecutionResult(string Engine, string? HardwareFailure);

public sealed class HardwareAccelerationService(ILogger<HardwareAccelerationService> logger) : BackgroundService
{
    private readonly SemaphoreSlim _probeLock = new(1, 1);
    private readonly object _statusLock = new();
    private HardwareAccelerationStatus _status = InitialStatus();

    public HardwareAccelerationStatus Status
    {
        get { lock (_statusLock) return _status; }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RefreshAsync(stoppingToken);
                await Task.Delay(TimeSpan.FromDays(1), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Intel Quick Sync capability check failed");
                RecordProbe(false, "LessonCue could not check Intel Quick Sync.", Concise(ex.Message));
                await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
            }
        }
    }

    public async Task<HardwareAccelerationStatus> RefreshAsync(CancellationToken ct = default)
    {
        await _probeLock.WaitAsync(ct);
        try
        {
            if (!OperatingSystem.IsLinux() && !OperatingSystem.IsWindows())
            {
                RecordProbe(false, "Intel Quick Sync is supported on Linux and Windows LessonCue servers.", null);
                return Status;
            }

            var encoders = await RunAsync("ffmpeg", "-hide_banner -encoders", TimeSpan.FromSeconds(10), ct);
            if (!encoders.Contains("h264_qsv", StringComparison.Ordinal))
            {
                RecordProbe(false, "This FFmpeg installation does not include the Intel Quick Sync H.264 encoder.", null);
                return Status;
            }

            var probeOutput = Path.Combine(Path.GetTempPath(), $"lessoncue-qsv-probe-{Guid.NewGuid():N}.mp4");
            try
            {
                var args = "-nostdin -hide_banner -loglevel error -y " +
                    "-init_hw_device qsv=lessoncue -filter_hw_device lessoncue " +
                    "-f lavfi -i testsrc2=size=64x64:rate=1 -frames:v 1 " +
                    "-vf \"format=nv12,hwupload=extra_hw_frames=16\" " +
                    $"-c:v h264_qsv -global_quality 24 -an -movflags +faststart \"{Escape(probeOutput)}\"";
                await RunAsync("ffmpeg", args, TimeSpan.FromSeconds(20), ct);
                await ValidateMp4Async(probeOutput, ct);
                RecordProbe(true, "Intel Quick Sync is ready for local video conversion.", null);
            }
            catch (Exception ex)
            {
                RecordProbe(false,
                    "FFmpeg includes Intel Quick Sync, but a compatible Intel GPU or driver is not available.",
                    Concise(ex.Message));
            }
            finally { TryDelete(probeOutput); }
            return Status;
        }
        finally { _probeLock.Release(); }
    }

    public async Task<TranscodeExecutionResult> RunTranscodeAsync(bool hardwareEnabled,
        string hardwareArguments, string softwareArguments, string outputPath, CancellationToken ct)
    {
        string? hardwareFailure = null;
        if (hardwareEnabled && Status.Available)
        {
            try
            {
                await RunAsync("ffmpeg", hardwareArguments, Timeout.InfiniteTimeSpan, ct);
                await ValidateMp4Async(outputPath, ct);
                lock (_statusLock) _status = _status with
                {
                    LastHardwareUseAt = DateTimeOffset.UtcNow,
                    LastError = null
                };
                return new TranscodeExecutionResult("Intel Quick Sync", null);
            }
            catch (Exception ex)
            {
                hardwareFailure = Concise(ex.Message);
                TryDelete(outputPath);
                lock (_statusLock) _status = _status with
                {
                    Available = false,
                    Message = "Quick Sync failed during a conversion. LessonCue is using software until the next hardware check.",
                    LastFallbackAt = DateTimeOffset.UtcNow,
                    LastError = hardwareFailure
                };
                logger.LogWarning(ex, "Intel Quick Sync conversion failed; retrying safely with software");
            }
        }

        await RunAsync("ffmpeg", softwareArguments, Timeout.InfiniteTimeSpan, ct);
        await ValidateMp4Async(outputPath, ct);
        return new TranscodeExecutionResult("Software", hardwareFailure);
    }

    public static async Task ValidateMp4Async(string path, CancellationToken ct = default)
    {
        if (!File.Exists(path) || new FileInfo(path).Length <= 0)
            throw new InvalidOperationException("FFmpeg did not create a playable output file.");
        var output = await RunAsync("ffprobe",
            $"-v error -select_streams v:0 -show_entries stream=codec_name,width,height -show_entries format=format_name,duration -of json \"{Escape(path)}\"",
            TimeSpan.FromSeconds(20), ct);
        if (!IsValidPlaybackProbe(output))
            throw new InvalidOperationException("The converted file failed LessonCue's H.264 MP4 playback validation.");
    }

    public static bool IsValidPlaybackProbe(string output)
    {
        using var document = JsonDocument.Parse(output);
        var streams = document.RootElement.TryGetProperty("streams", out var streamList) &&
            streamList.ValueKind == JsonValueKind.Array ? streamList : default;
        if (streams.ValueKind != JsonValueKind.Array || streams.GetArrayLength() == 0)
            return false;
        var stream = streams[0];
        var codec = stream.TryGetProperty("codec_name", out var codecValue) ? codecValue.GetString() : null;
        var width = stream.TryGetProperty("width", out var widthValue) ? widthValue.GetInt32() : 0;
        var height = stream.TryGetProperty("height", out var heightValue) ? heightValue.GetInt32() : 0;
        var format = document.RootElement.TryGetProperty("format", out var formatValue) &&
            formatValue.TryGetProperty("format_name", out var nameValue) ? nameValue.GetString() : null;
        return codec == "h264" && width > 0 && height > 0 &&
            format?.Split(',').Contains("mp4", StringComparer.OrdinalIgnoreCase) == true;
    }

    private void RecordProbe(bool available, string message, string? error)
    {
        lock (_statusLock) _status = _status with
        {
            Supported = OperatingSystem.IsLinux() || OperatingSystem.IsWindows(),
            Available = available,
            Message = message,
            LastCheckedAt = DateTimeOffset.UtcNow,
            LastError = error
        };
    }

    private static HardwareAccelerationStatus InitialStatus() => new(
        OperatingSystem.IsLinux() || OperatingSystem.IsWindows(), false, "Intel Quick Sync (H.264)",
        "Checking Intel GPU and FFmpeg support…", null, null, null, null);

    private static async Task<string> RunAsync(string fileName, string arguments, TimeSpan timeout,
        CancellationToken ct)
    {
        using var timeoutSource = timeout == Timeout.InfiniteTimeSpan
            ? null
            : CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutSource?.CancelAfter(timeout);
        var token = timeoutSource?.Token ?? ct;
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo(fileName, arguments)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };
        try
        {
            process.Start();
            var stdout = process.StandardOutput.ReadToEndAsync(token);
            var stderr = process.StandardError.ReadToEndAsync(token);
            await process.WaitForExitAsync(token);
            var output = await stdout;
            var errors = await stderr;
            if (process.ExitCode != 0) throw new InvalidOperationException(errors.Trim());
            return string.IsNullOrWhiteSpace(output) ? errors : output;
        }
        catch (OperationCanceledException)
        {
            try { if (!process.HasExited) process.Kill(true); } catch { }
            throw;
        }
    }

    private static string Escape(string value) => value.Replace("\"", "\\\"");
    private static string Concise(string value) => value.Length > 900 ? value[..900] : value;
    private static void TryDelete(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }
}
