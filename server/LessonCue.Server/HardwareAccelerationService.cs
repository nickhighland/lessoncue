using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace LessonCue.Server;

public sealed record HardwareAccelerationStatus(
    bool Supported,
    bool Available,
    string Engine,
    string Message,
    DateTimeOffset? LastCheckedAt,
    DateTimeOffset? LastHardwareUseAt,
    DateTimeOffset? LastFallbackAt,
    string? LastError,
    string? Device);

public sealed record TranscodeExecutionResult(string Engine, string? HardwareFailure);

public sealed record HardwarePipelineCandidate(
    string Arguments,
    string Device,
    string Label,
    string Encoder,
    string Engine,
    string? VaDriver);

public sealed class HardwareAccelerationService(ILogger<HardwareAccelerationService> logger) : BackgroundService
{
    private readonly SemaphoreSlim _probeLock = new(1, 1);
    private readonly object _statusLock = new();
    private HardwareAccelerationStatus _status = InitialStatus();
    private HardwarePipelineCandidate? _pipeline;

    public HardwareAccelerationStatus Status
    {
        get { lock (_statusLock) return _status; }
    }

    public string DeviceArguments
    {
        get
        {
            lock (_statusLock)
                return _pipeline?.Arguments ?? "-init_hw_device qsv=lessoncue -filter_hw_device lessoncue";
        }
    }

    public string BuildHardwareVideoArguments(string filter, int quality, int? videoBitrateKbps = null)
    {
        HardwarePipelineCandidate? pipeline;
        lock (_statusLock) pipeline = _pipeline;
        return BuildHardwareVideoArguments(pipeline?.Encoder ?? "h264_qsv", filter, quality, videoBitrateKbps);
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
            var hasQsv = encoders.Contains("h264_qsv", StringComparison.Ordinal);
            var hasVaapi = OperatingSystem.IsLinux() &&
                encoders.Contains("h264_vaapi", StringComparison.Ordinal);
            if (!hasQsv && !hasVaapi)
            {
                RecordProbe(false,
                    "This FFmpeg installation does not include an Intel H.264 hardware encoder.",
                    OperatingSystem.IsLinux()
                        ? "FFmpeg must include h264_qsv or h264_vaapi."
                        : "FFmpeg must include h264_qsv.");
                return Status;
            }

            var candidates = DeviceCandidates(hasQsv, hasVaapi);
            if (OperatingSystem.IsLinux() && candidates.Count == 0)
            {
                RecordProbe(false,
                    "FFmpeg includes Intel hardware encoding, but Linux did not expose an accessible Intel DRM render device.",
                    "No Intel /dev/dri/renderD* device was found. Enable the Intel integrated GPU in firmware, install its kernel driver, and expose /dev/dri to the LessonCue service.");
                return Status;
            }

            var failures = new List<string>();
            foreach (var candidate in candidates)
            {
                var probeOutput = Path.Combine(Path.GetTempPath(), $"lessoncue-qsv-probe-{Guid.NewGuid():N}.mp4");
                try
                {
                    var args = "-nostdin -hide_banner -loglevel error -y " +
                        $"{candidate.Arguments} " +
                        "-f lavfi -i testsrc2=size=64x64:rate=1 -frames:v 1 " +
                        "-vf \"format=nv12,hwupload=extra_hw_frames=16\" " +
                        $"{ProbeEncoderArguments(candidate.Encoder)} " +
                        $"-an -movflags +faststart \"{Escape(probeOutput)}\"";
                    await RunAsync("ffmpeg", args, TimeSpan.FromSeconds(20), ct, candidate.VaDriver);
                    await ValidateMp4Async(probeOutput, ct);
                    RecordProbe(true, $"{candidate.Engine} is ready on {candidate.Device}.", null, candidate);
                    return Status;
                }
                catch (Exception ex)
                {
                    failures.Add($"{candidate.Label}: {Concise(ex.Message, 360)}");
                }
                finally { TryDelete(probeOutput); }
            }

            RecordProbe(false,
                "FFmpeg includes Intel hardware encoding, but no Intel render device completed a test encode.",
                ProbeFailure(failures));
            return Status;
        }
        finally { _probeLock.Release(); }
    }

    public async Task<TranscodeExecutionResult> RunTranscodeAsync(bool hardwareEnabled,
        string hardwareArguments, string softwareArguments, string outputPath, CancellationToken ct)
    {
        string? hardwareFailure = null;
        HardwarePipelineCandidate? pipeline;
        lock (_statusLock) pipeline = _status.Available ? _pipeline : null;
        if (hardwareEnabled && pipeline is not null)
        {
            try
            {
                await RunAsync("ffmpeg", hardwareArguments, Timeout.InfiniteTimeSpan, ct, pipeline.VaDriver);
                await ValidateMp4Async(outputPath, ct);
                lock (_statusLock) _status = _status with
                {
                    LastHardwareUseAt = DateTimeOffset.UtcNow,
                    LastError = null
                };
                return new TranscodeExecutionResult(pipeline.Engine, null);
            }
            catch (Exception ex)
            {
                hardwareFailure = Concise(ex.Message);
                TryDelete(outputPath);
                lock (_statusLock) _status = _status with
                {
                    Available = false,
                    Message = "Hardware encoding failed during a conversion. LessonCue is using software until the next hardware check.",
                    LastFallbackAt = DateTimeOffset.UtcNow,
                    LastError = hardwareFailure
                };
                logger.LogWarning(ex, "{Engine} conversion failed; retrying safely with software", pipeline.Engine);
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

    public static IReadOnlyList<string> BuildLinuxDeviceArguments(IEnumerable<string> renderNodes) =>
        BuildLinuxPipelineCandidates(renderNodes, true, false)
            .Select(candidate => candidate.Arguments)
            .ToArray();

    public static IReadOnlyList<HardwarePipelineCandidate> BuildLinuxPipelineCandidates(
        IEnumerable<string> renderNodes, bool includeQsv = true, bool includeVaapi = true) =>
        renderNodes
            .Where(path => Regex.IsMatch(Path.GetFileName(path), "^renderD[0-9]+$", RegexOptions.CultureInvariant))
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .SelectMany(path =>
            {
                var candidates = new List<HardwarePipelineCandidate>();
                if (includeQsv)
                {
                    candidates.Add(new(
                        $"-init_hw_device qsv=lessoncue,child_device={path} -filter_hw_device lessoncue",
                        path, $"{path} as a QSV child device", "h264_qsv", "Intel Quick Sync (H.264)", null));
                    candidates.Add(new(
                        $"-init_hw_device vaapi=lessoncue_va:{path} -init_hw_device qsv=lessoncue@lessoncue_va -filter_hw_device lessoncue",
                        path, $"{path} through VAAPI-derived QSV", "h264_qsv", "Intel Quick Sync (H.264)", null));
                }
                if (includeVaapi)
                {
                    var arguments = $"-init_hw_device vaapi=lessoncue:{path} -filter_hw_device lessoncue";
                    candidates.Add(new(arguments, path, $"{path} through direct VAAPI",
                        "h264_vaapi", "Intel VAAPI (H.264)", null));
                    candidates.Add(new(arguments, path, $"{path} through direct VAAPI with the legacy i965 driver",
                        "h264_vaapi", "Intel VAAPI (H.264, i965)", "i965"));
                }
                return candidates;
            })
            .ToArray();

    public static string BuildHardwareVideoArguments(string encoder, string filter, int quality,
        int? videoBitrateKbps = null)
    {
        var uploadFilter = $"-vf \"{filter},format=nv12,hwupload=extra_hw_frames=64\"";
        if (encoder == "h264_vaapi")
        {
            var rateControl = videoBitrateKbps is int bitrate
                ? $"-rc_mode VBR -b:v {bitrate}k -maxrate {bitrate}k -bufsize {bitrate * 2}k"
                : $"-qp {quality}";
            return $"{uploadFilter} -c:v h264_vaapi {rateControl}";
        }

        var qsvRateControl = $"-global_quality {quality}" +
            (videoBitrateKbps is int maximum
                ? $" -maxrate {maximum}k -bufsize {maximum * 2}k"
                : "");
        return $"{uploadFilter} -c:v h264_qsv -preset medium {qsvRateControl}";
    }

    private static IReadOnlyList<HardwarePipelineCandidate> DeviceCandidates(bool includeQsv, bool includeVaapi)
    {
        if (!OperatingSystem.IsLinux())
            return includeQsv
                ? [new("-init_hw_device qsv=lessoncue -filter_hw_device lessoncue",
                    "default Windows graphics adapter", "default adapter", "h264_qsv",
                    "Intel Quick Sync (H.264)", null)]
                : [];

        string[] renderNodes;
        try
        {
            renderNodes = Directory.Exists("/dev/dri")
                ? Directory.EnumerateFiles("/dev/dri", "renderD*")
                    .Where(IsIntelRenderNode)
                    .ToArray()
                : [];
        }
        catch { renderNodes = []; }

        return BuildLinuxPipelineCandidates(renderNodes, includeQsv, includeVaapi);
    }

    private static bool IsIntelRenderNode(string path)
    {
        try
        {
            var node = Path.GetFileName(path);
            var vendor = File.ReadAllText($"/sys/class/drm/{node}/device/vendor").Trim();
            return vendor.Equals("0x8086", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return true;
        }
    }

    private static string ProbeFailure(IReadOnlyList<string> failures)
    {
        var detail = string.Join(" | ", failures);
        if (OperatingSystem.IsLinux())
            return Concise("LessonCue tried every Intel /dev/dri/renderD* node using FFmpeg's direct QSV, VAAPI-derived QSV, and direct VAAPI encoders. " +
                "Confirm that the lessoncue user belongs to the render and video groups and that intel-media-va-driver or i965-va-driver is installed. " +
                $"FFmpeg: {detail}");
        return Concise(detail);
    }

    private static string ProbeEncoderArguments(string encoder) =>
        encoder == "h264_vaapi" ? "-c:v h264_vaapi -qp 24" : "-c:v h264_qsv -global_quality 24";

    private void RecordProbe(bool available, string message, string? error,
        HardwarePipelineCandidate? pipeline = null)
    {
        lock (_statusLock)
        {
            _pipeline = available ? pipeline : null;
            _status = _status with
            {
                Supported = OperatingSystem.IsLinux() || OperatingSystem.IsWindows(),
                Available = available,
                Message = message,
                LastCheckedAt = DateTimeOffset.UtcNow,
                LastError = error,
                Device = pipeline?.Device,
                Engine = pipeline?.Engine ?? _status.Engine
            };
        }
    }

    private static HardwareAccelerationStatus InitialStatus() => new(
        OperatingSystem.IsLinux() || OperatingSystem.IsWindows(), false, "Intel Quick Sync (H.264)",
        "Checking Intel GPU and FFmpeg support…", null, null, null, null, null);

    private static async Task<string> RunAsync(string fileName, string arguments, TimeSpan timeout,
        CancellationToken ct, string? vaDriver = null)
    {
        using var timeoutSource = timeout == Timeout.InfiniteTimeSpan
            ? null
            : CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutSource?.CancelAfter(timeout);
        var token = timeoutSource?.Token ?? ct;
        var startInfo = new ProcessStartInfo(fileName, arguments)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        if (!string.IsNullOrWhiteSpace(vaDriver))
            startInfo.Environment["LIBVA_DRIVER_NAME"] = vaDriver;
        using var process = new Process { StartInfo = startInfo };
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
    private static string Concise(string value, int limit = 900) => value.Length > limit ? value[..limit] : value;
    private static void TryDelete(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }

}
