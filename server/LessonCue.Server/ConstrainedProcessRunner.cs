using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace LessonCue.Server;

public sealed record ConstrainedProcessOptions(
    TimeSpan Timeout,
    bool AllowNetwork = false,
    long MemoryBytes = 2L * 1024 * 1024 * 1024,
    long MaximumOutputFileBytes = 20L * 1024 * 1024 * 1024,
    int MaximumProcesses = 32,
    IReadOnlyList<string>? WritableRoots = null,
    IReadOnlyDictionary<string, string>? Environment = null,
    int MaximumCapturedCharacters = 1_000_000)
{
    public static ConstrainedProcessOptions Media(IReadOnlyList<string>? writableRoots = null) =>
        new(TimeSpan.FromHours(4), WritableRoots: writableRoots);

    public static ConstrainedProcessOptions Document(string work) =>
        new(TimeSpan.FromMinutes(10), MemoryBytes: 1536L * 1024 * 1024,
            MaximumOutputFileBytes: 2L * 1024 * 1024 * 1024, MaximumProcesses: 16,
            WritableRoots: [work]);

    public static ConstrainedProcessOptions Download(string work, long availableBytes) =>
        new(TimeSpan.FromHours(1), AllowNetwork: true, MemoryBytes: 1024L * 1024 * 1024,
            MaximumOutputFileBytes: Math.Clamp(availableBytes, 1024 * 1024, 20L * 1024 * 1024 * 1024),
            MaximumProcesses: 16, WritableRoots: [work]);
}

public static class ConstrainedProcessRunner
{
    public static async Task<string> RunAsync(string executable, IReadOnlyList<string> arguments,
        ConstrainedProcessOptions options, CancellationToken ct = default)
    {
        var start = BuildStartInfo(executable, arguments, options);
        using var process = new Process { StartInfo = start };
        process.Start();
        using var windowsJob = WindowsProcessJob.CreateAndAssign(process, options);

        var stdout = ReadBoundedAsync(process.StandardOutput, options.MaximumCapturedCharacters);
        var stderr = ReadBoundedAsync(process.StandardError, options.MaximumCapturedCharacters);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(options.Timeout);
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            Kill(process);
            await Task.WhenAll(stdout, stderr);
            throw new InvalidOperationException(
                $"The media worker exceeded its {Format(options.Timeout)} safety limit.");
        }
        catch (OperationCanceledException)
        {
            Kill(process);
            await Task.WhenAll(stdout, stderr);
            throw;
        }

        var output = await stdout;
        var errors = await stderr;
        if (process.ExitCode != 0)
        {
            var detail = string.IsNullOrWhiteSpace(errors) ? output : errors;
            if (process.ExitCode == 78)
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(detail)
                    ? "The required LessonCue media sandbox is unavailable."
                    : detail.Trim());
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(detail)
                ? $"The media worker stopped with code {process.ExitCode}."
                : detail.Trim());
        }
        return string.IsNullOrWhiteSpace(output) ? errors : output;
    }

    public static IReadOnlyList<string> SplitArguments(string arguments)
    {
        var result = new List<string>();
        var current = new StringBuilder();
        var quoted = false;
        for (var index = 0; index < arguments.Length; index++)
        {
            var character = arguments[index];
            if (character == '\\' && index + 1 < arguments.Length && arguments[index + 1] == '"')
            {
                current.Append('"');
                index++;
                continue;
            }
            if (character == '"')
            {
                quoted = !quoted;
                continue;
            }
            if (char.IsWhiteSpace(character) && !quoted)
            {
                if (current.Length > 0)
                {
                    result.Add(current.ToString());
                    current.Clear();
                }
                continue;
            }
            current.Append(character);
        }
        if (quoted) throw new InvalidOperationException("The media-worker command contains an unmatched quote.");
        if (current.Length > 0) result.Add(current.ToString());
        return result;
    }

    public static ProcessStartInfo BuildStartInfo(string executable, IReadOnlyList<string> arguments,
        ConstrainedProcessOptions options)
    {
        executable = ResolveRestrictedWindowsTool(executable);
        var helper = Environment.GetEnvironmentVariable("LESSONCUE_MEDIA_WORKER_PATH");
        if (string.IsNullOrWhiteSpace(helper)) helper = "/usr/local/libexec/lessoncue-media-worker";
        var useSandbox = OperatingSystem.IsLinux();
        var start = new ProcessStartInfo(useSandbox ? helper : executable)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        if (useSandbox)
        {
            start.ArgumentList.Add(options.AllowNetwork ? "--network=allow" : "--network=deny");
            start.ArgumentList.Add($"--timeout={Math.Max(1, (int)Math.Ceiling(options.Timeout.TotalSeconds))}");
            start.ArgumentList.Add($"--memory={options.MemoryBytes}");
            start.ArgumentList.Add($"--file-size={options.MaximumOutputFileBytes}");
            start.ArgumentList.Add($"--processes={options.MaximumProcesses}");
            foreach (var root in options.WritableRoots ?? [])
                start.ArgumentList.Add($"--write-root={Path.GetFullPath(root)}");
            start.ArgumentList.Add("--");
            start.ArgumentList.Add(executable);
        }
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        foreach (var pair in options.Environment ?? new Dictionary<string, string>())
            start.Environment[pair.Key] = pair.Value;
        return start;
    }

    private static string ResolveRestrictedWindowsTool(string executable)
    {
        if (!OperatingSystem.IsWindows()) return executable;
        var command = Path.GetFileNameWithoutExtension(executable);
        var variable = command.Equals("ffmpeg", StringComparison.OrdinalIgnoreCase)
            ? "LESSONCUE_MEDIA_FFMPEG_PATH"
            : command.Equals("ffprobe", StringComparison.OrdinalIgnoreCase)
                ? "LESSONCUE_MEDIA_FFPROBE_PATH"
                : null;
        if (variable is null) return executable;
        var restricted = Environment.GetEnvironmentVariable(variable);
        if (string.IsNullOrWhiteSpace(restricted) || !File.Exists(restricted))
            throw new InvalidOperationException(
                $"The restricted Windows {command} worker is unavailable. Run the current LessonCue installer after installing FFmpeg.");
        return restricted;
    }

    private static async Task<string> ReadBoundedAsync(StreamReader reader, int maximum)
    {
        var output = new StringBuilder(Math.Min(maximum, 8192));
        var buffer = new char[4096];
        var omitted = false;
        while (true)
        {
            var read = await reader.ReadAsync(buffer);
            if (read == 0) break;
            var remaining = maximum - output.Length;
            if (remaining > 0) output.Append(buffer, 0, Math.Min(read, remaining));
            if (read > remaining) omitted = true;
        }
        if (omitted) output.Append("\n[additional worker output omitted]");
        return output.ToString();
    }

    private static void Kill(Process process)
    {
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        catch { }
    }

    private static string Format(TimeSpan value) =>
        value.TotalMinutes < 1 ? $"{Math.Ceiling(value.TotalSeconds)}-second" :
        value.TotalHours < 1 ? $"{Math.Ceiling(value.TotalMinutes)}-minute" :
        $"{Math.Ceiling(value.TotalHours)}-hour";

    private sealed class WindowsProcessJob : IDisposable
    {
        private const uint JobObjectLimitActiveProcess = 0x00000008;
        private const uint JobObjectLimitProcessTime = 0x00000002;
        private const uint JobObjectLimitProcessMemory = 0x00000100;
        private const uint JobObjectLimitJobMemory = 0x00000200;
        private const uint JobObjectLimitKillOnJobClose = 0x00002000;
        private readonly SafeFileHandle handle;

        private WindowsProcessJob(SafeFileHandle handle) => this.handle = handle;

        public static WindowsProcessJob? CreateAndAssign(Process process, ConstrainedProcessOptions options)
        {
            if (!OperatingSystem.IsWindows()) return null;
            var handle = CreateJobObject(nint.Zero, null);
            if (handle.IsInvalid)
            {
                handle.Dispose();
                Kill(process);
                throw new InvalidOperationException("Windows could not create the required media-worker job.");
            }
            var information = new JobObjectExtendedLimitInformation
            {
                BasicLimitInformation = new JobObjectBasicLimitInformation
                {
                    LimitFlags = JobObjectLimitKillOnJobClose |
                        JobObjectLimitActiveProcess |
                        JobObjectLimitProcessTime |
                        JobObjectLimitProcessMemory |
                        JobObjectLimitJobMemory,
                    PerProcessUserTimeLimit = options.Timeout.Ticks,
                    ActiveProcessLimit = (uint)options.MaximumProcesses
                },
                ProcessMemoryLimit = (nuint)options.MemoryBytes,
                JobMemoryLimit = (nuint)options.MemoryBytes
            };
            var length = Marshal.SizeOf<JobObjectExtendedLimitInformation>();
            var pointer = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(information, pointer, false);
                if (!SetInformationJobObject(handle, 9, pointer, (uint)length) ||
                    !AssignProcessToJobObject(handle, process.Handle))
                {
                    handle.Dispose();
                    Kill(process);
                    throw new InvalidOperationException(
                        "Windows could not apply the required memory and process limits to the media worker.");
                }
                return new WindowsProcessJob(handle);
            }
            finally
            {
                Marshal.FreeHGlobal(pointer);
            }
        }

        public void Dispose() => handle.Dispose();

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateJobObject(nint jobAttributes, string? name);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetInformationJobObject(
            SafeFileHandle job, int informationClass, nint information, uint length);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool AssignProcessToJobObject(SafeFileHandle job, nint process);

        [StructLayout(LayoutKind.Sequential)]
        private struct JobObjectBasicLimitInformation
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public nuint MinimumWorkingSetSize;
            public nuint MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public nuint Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct IoCounters
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JobObjectExtendedLimitInformation
        {
            public JobObjectBasicLimitInformation BasicLimitInformation;
            public IoCounters IoInfo;
            public nuint ProcessMemoryLimit;
            public nuint JobMemoryLimit;
            public nuint PeakProcessMemoryUsed;
            public nuint PeakJobMemoryUsed;
        }
    }
}
