using Xunit;

namespace LessonCue.Server.Tests;

public sealed class HardwareAccelerationTests
{
    [Fact]
    public void Validated_transcode_requires_h264_video_in_an_mp4_container()
    {
        const string valid = """
            {"streams":[{"codec_name":"h264","width":1280,"height":720}],
             "format":{"format_name":"mov,mp4,m4a,3gp,3g2,mj2","duration":"3.5"}}
            """;
        Assert.True(HardwareAccelerationService.IsValidPlaybackProbe(valid));
    }

    [Theory]
    [InlineData("""{"streams":[],"format":{"format_name":"mp4"}}""")]
    [InlineData("""{"streams":[{"codec_name":"hevc","width":1280,"height":720}],"format":{"format_name":"mp4"}}""")]
    [InlineData("""{"streams":[{"codec_name":"h264","width":0,"height":720}],"format":{"format_name":"mp4"}}""")]
    [InlineData("""{"streams":[{"codec_name":"h264","width":1280,"height":720}],"format":{"format_name":"matroska,webm"}}""")]
    public void Invalid_transcode_probe_is_rejected(string probe)
    {
        Assert.False(HardwareAccelerationService.IsValidPlaybackProbe(probe));
    }

    [Fact]
    public void Linux_quick_sync_candidates_select_each_render_node_explicitly()
    {
        var candidates = HardwareAccelerationService.BuildLinuxDeviceArguments(
            ["/dev/dri/renderD129", "/dev/dri/card0", "/dev/dri/renderD128", "/dev/dri/renderD128"]);

        Assert.Equal(4, candidates.Count);
        Assert.Equal("-init_hw_device qsv=lessoncue,child_device=/dev/dri/renderD128 -filter_hw_device lessoncue",
            candidates[0]);
        Assert.Equal("-init_hw_device vaapi=lessoncue_va:/dev/dri/renderD128 -init_hw_device qsv=lessoncue@lessoncue_va -filter_hw_device lessoncue",
            candidates[1]);
        Assert.Contains("child_device=/dev/dri/renderD129", candidates[2]);
        Assert.Contains("vaapi=lessoncue_va:/dev/dri/renderD129", candidates[3]);
    }
}
