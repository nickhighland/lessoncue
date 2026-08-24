using System.Security.Cryptography;
using System.Text;
using LessonCue.Server.Activities;
using Xunit;

namespace LessonCue.Server.Tests;

/// <summary>
/// The reserved pool is a fixed asset, not a generated one. These tests exist
/// mostly to make an accidental edit loud.
/// </summary>
public class ReservedGameCodeTests
{
    [Fact]
    public void ThePoolHoldsExactlyOneHundredCodes() => Assert.Equal(100, ReservedGameCodes.All.Count);

    [Fact]
    public void NoCodeAppearsTwice() =>
        Assert.Equal(ReservedGameCodes.All.Count, ReservedGameCodes.All.Distinct(StringComparer.Ordinal).Count());

    [Fact]
    public void EveryCodeIsLetterDigitLetterDigit() =>
        Assert.All(ReservedGameCodes.All, code =>
        {
            Assert.Equal(4, code.Length);
            Assert.True(char.IsAsciiLetterUpper(code[0]) && char.IsAsciiLetterUpper(code[2]), $"{code} should start each pair with a letter.");
            Assert.True(char.IsAsciiDigit(code[1]) && char.IsAsciiDigit(code[3]), $"{code} should end each pair with a digit.");
        });

    [Fact]
    public void NothingInThePoolCanBeMisreadFromAcrossARoom() =>
        Assert.All(ReservedGameCodes.All, code =>
            Assert.All("01ILO", confusable => Assert.DoesNotContain(confusable, code)));

    [Fact]
    public void DigitsStayInTheReadableRange() =>
        Assert.All(ReservedGameCodes.All, code =>
        {
            Assert.InRange(code[1], '2', '9');
            Assert.InRange(code[3], '2', '9');
        });

    /// <summary>
    /// These slugs exist inside the shortener, so editing the list strands
    /// links that were already created. Changing it should take a deliberate
    /// act -- a v2 file and a new hash -- rather than a stray keystroke.
    /// </summary>
    [Fact]
    public void ThePoolHasNotChanged()
    {
        var digest = Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes(string.Join(",", ReservedGameCodes.All))));
        Assert.Equal("b6bfce6daf8816bfb6a7f8e7168b89d35e97ef057bfd8d81c89864ea1bc9d8ba", digest);
    }

    [Fact]
    public void ThePoolIsVersionOne() => Assert.Equal(1, ReservedGameCodes.Version);

    [Theory]
    [InlineData("Q7Z6", true)]
    [InlineData("q7z6", true)]
    [InlineData("Q7z6", true)]
    [InlineData("  q7z6  ", true)]
    [InlineData("kids", false)]
    [InlineData("A1B2", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void ReservedCodesAreRecognisedHoweverTheyAreTyped(string? candidate, bool expected) =>
        Assert.Equal(expected, ReservedGameCodes.IsReserved(candidate));

    [Fact]
    public void OrdinaryShortSlugsAreNotReserved() =>
        Assert.All(new[] { "kids", "give", "easter", "parents", "register" },
            slug => Assert.False(ReservedGameCodes.IsReserved(slug)));

    [Fact]
    public void ShortIsNotTheSameAsReserved()
    {
        // The rule is these hundred exactly, not "every four-character slug".
        Assert.False(ReservedGameCodes.IsReserved("A2B3"));
        Assert.True(ReservedGameCodes.IsReserved("A3C8"));
    }
}
