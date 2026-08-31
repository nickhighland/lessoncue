namespace LessonCue.Server.Activities;

/// <summary>What handing out a join code needs to know about the shortener.</summary>
/// <remarks>
/// Deliberately one property. A game takes a reserved four-character code only
/// when the short domain can actually resolve it; everything else about the
/// shortener is none of the session's business.
/// </remarks>
public interface IReservedCodeSource
{
    /// <summary>
    /// True only when the shortener is on, has a domain, and has been shown to
    /// hold the reserved codes. Handing out a four-character code the shortener
    /// does not know would put an unusable address on the wall.
    /// </summary>
    bool ReservedCodesUsable { get; }
}
