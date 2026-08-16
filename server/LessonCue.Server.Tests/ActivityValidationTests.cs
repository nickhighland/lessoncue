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
    public void PollAcceptsEditableRoundSequencesAndRejectsInvalidRoundChoices()
    {
        var sequence = """{"title":"Gauntlet","rounds":[{"id":"r1","question":"Pick one","options":["A","B"]},{"id":"r2","question":"Pick another","options":["A","B","C","D","E","F"]}]}""";
        var invalid = """{"title":"Gauntlet","rounds":[{"id":"r1","question":"Pick one","options":["A"]}]}""";

        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Poll, "This or That Gauntlet", sequence));
        Assert.Contains("between 2 and 8", ActivityValidation.ValidateDefinition(ActivityTypes.Poll, "Invalid Gauntlet", invalid));
    }

    [Fact]
    public void TriviaAcceptsShortTextAndNumberQuestionsAndRejectsMissingAnswers()
    {
        var flexible = """{"title":"Flexible quiz","questions":[{"id":"text","prompt":"Finish it","answerMode":"text","acceptedAnswers":["never","not ever"]},{"id":"number","prompt":"Guess it","answerMode":"number","targetNumber":42,"tolerance":1,"scoringMode":"closest"}]}""";
        var missingText = """{"title":"Missing answer","questions":[{"id":"text","prompt":"Finish it","answerMode":"text","acceptedAnswers":[]}]}""";
        var missingNumber = """{"title":"Missing number","questions":[{"id":"number","prompt":"Guess it","answerMode":"number"}]}""";

        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "Flexible quiz", flexible));
        Assert.Contains("accepted answer", ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "Missing answer", missingText));
        Assert.Contains("target number", ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "Missing number", missingNumber));
    }

    [Fact]
    public void QuizModifiersAndCreativeVotingModesAreValidated()
    {
        var validQuiz = """{"title":"Wager quiz","questions":[{"id":"q1","prompt":"Pick one","options":["A","B"],"correctIndex":0}],"modifiers":{"wager":{"enabled":true,"maxPoints":100,"defaultPoints":25},"lives":{"enabled":true,"startingLives":3}}}""";
        var invalidWager = """{"title":"Invalid wager","questions":[{"id":"q1","prompt":"Pick one","options":["A","B"],"correctIndex":0}],"modifiers":{"wager":{"enabled":true,"maxPoints":10,"defaultPoints":20}}}""";
        var validCreative = """{"title":"Matchup","prompts":[{"id":"p1","prompt":"Finish it"}],"votingStyle":"headToHead","headToHeadMatchPoints":50}""";
        var invalidCreative = """{"title":"Unknown voting","prompts":[{"id":"p1","prompt":"Finish it"}],"votingStyle":"bracket"}""";
        var validBracket = """{"title":"Random bracket","entrantSource":"participants","entrantSelection":"random","randomEntrantCount":4}""";
        var invalidBracket = """{"title":"Invalid bracket","entrantSource":"participants","entrantSelection":"random","randomEntrantCount":1}""";

        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "Valid modifiers", validQuiz));
        Assert.Contains("wager points", ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "Invalid wager", invalidWager));
        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Punchline, "Valid creative", validCreative));
        Assert.Contains("gallery or head-to-head", ActivityValidation.ValidateDefinition(ActivityTypes.Punchline, "Invalid creative", invalidCreative));
        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Bracket, "Valid bracket", validBracket));
        Assert.Contains("between 2 and 32", ActivityValidation.ValidateDefinition(ActivityTypes.Bracket, "Invalid bracket", invalidBracket));
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
    public void BuzzerAndBluffingScoringValuesAreBounded()
    {
        var validBuzzer = """{"title":"Clues","clues":[{"id":"c1","prompt":"Clue","answer":"Answer","points":300}],"lockOutOnMiss":true,"stealOnMiss":true}""";
        var invalidBuzzer = """{"title":"Clues","clues":[{"id":"c1","prompt":"Clue","answer":"Answer","points":20000}]}""";
        var validBluff = """{"title":"Bluff","rounds":[{"id":"r1","prompt":"Prompt","truth":"Truth"}],"truthPoints":100,"bluffPoints":50,"hostFavoritePoints":25}""";
        var invalidBluff = """{"title":"Bluff","rounds":[{"id":"r1","prompt":"Prompt","truth":"Truth"}],"hostFavoritePoints":20000}""";

        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Buzzer, "Clues", validBuzzer));
        Assert.Contains("clue points", ActivityValidation.ValidateDefinition(ActivityTypes.Buzzer, "Clues", invalidBuzzer));
        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.FakeOut, "Bluff", validBluff));
        Assert.Contains("scoring values", ActivityValidation.ValidateDefinition(ActivityTypes.FakeOut, "Bluff", invalidBluff));
    }

    [Fact]
    public void ExistingDefinitionsWithoutOptionalCollectionsRemainCompatible()
    {
        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.Trivia, "Legacy trivia", "{\"title\":\"Legacy trivia\"}"));
        Assert.Null(ActivityValidation.ValidateDefinition(ActivityTypes.ImageShuffle, "Media to add later", "{\"title\":\"Media to add later\",\"images\":[]}"));
    }
}
