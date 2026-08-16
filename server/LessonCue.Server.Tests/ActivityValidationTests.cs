using LessonCue.Server.Activities;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ActivityValidationTests
{
    [Fact]
    public void TriviaAcceptsVariableChoiceCountsAndRejectsInvalidCounts()
    {
        var twoChoices = """{"title":"Two choices","questions":[{"id":"q1","prompt":"Pick one","options":["A","B"],"correctIndex":0}]}""";
        var sixChoices = """{"title":"Six choices","questions":[{"id":"q1","prompt":"Pick one","options":["A","B","C","D","E","F"],"correctIndex":5}]}""";
        var oneChoice = """{"title":"One choice","questions":[{"id":"q1","prompt":"Pick one","options":["A"],"correctIndex":0}]}""";

        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "Two choices", twoChoices));
        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "Six choices", sixChoices));
        Assert.Contains("between 2 and 8", ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "One choice", oneChoice));
    }

    [Fact]
    public void StructuredActivitiesRejectEmptyRequiredCollections()
    {
        var emptyBuzzer = """{"title":"Empty buzzer","clues":[]}""";
        var emptyOrdering = """{"title":"Empty ordering","rounds":[]}""";
        var tooSmallOrderingRound = """{"title":"Small ordering","rounds":[{"id":"r1","prompt":"Order","items":[{"id":"i1","label":"Only item"}],"correctOrder":["i1"]}]}""";
        var emptyPoll = """{"question":"Choose","options":[]}""";

        Assert.Contains("between 1 and 100 clues", ActivityValidation.ValidateDefinition(ActivityTypes.Buzzer, "Empty buzzer", emptyBuzzer));
        Assert.Contains("between 1 and 100 rounds", ActivityValidation.ValidateDefinition(ActivityTypes.Ordering, "Empty ordering", emptyOrdering));
        Assert.Contains("between 2 and 50 items", ActivityValidation.ValidateDefinition(ActivityTypes.Ordering, "Small ordering", tooSmallOrderingRound));
        Assert.Contains("between 2 and 8", ActivityValidation.ValidateDefinition(ActivityTypes.Poll, "Empty poll", emptyPoll));
    }

    [Fact]
    public void ExistingDefinitionsWithoutOptionalCollectionsRemainCompatible()
    {
        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "Legacy trivia", "{\"title\":\"Legacy trivia\"}"));
        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.ImageShuffle, "Media to add later", "{\"title\":\"Media to add later\",\"images\":[]}"));
    }
}
