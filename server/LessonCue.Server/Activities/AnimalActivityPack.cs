using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LessonCue.Server;
using Microsoft.EntityFrameworkCore;

namespace LessonCue.Server.Activities;

/// <summary>
/// Creates a deterministic, teacher-authored animal-themed test catalog. The
/// pack is opt-in so ordinary installations do not receive demo content, while
/// local testers can create a complete lesson in one command.
/// </summary>
public static class AnimalActivityPack
{
    public const string Marker = "animal-test-pack";
    public const string ClassName = "Animal Adventure Lab";
    public const string LessonTitle = "Animal Adventure: Activities Safari";

    public sealed record Result(
        Guid ClassId,
        Guid LessonId,
        int ActivityCount,
        int LessonCueCount,
        IReadOnlyList<string> ActivityNames);

    private sealed record PackSpec(
        string Type,
        string Name,
        string Description,
        JsonObject Config,
        JsonObject Theme);

    public static async Task<Result> EnsureAsync(LessonCueDb db, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var lessonClass = await db.Classes.SingleOrDefaultAsync(x => x.Name == ClassName, ct);
        if (lessonClass is null)
        {
            lessonClass = new LessonClass
            {
                Name = ClassName,
                Description = "A complete animal-themed Activities Studio test room.",
                ControllerSlug = "animal-adventure",
                ControllerColor = "#6d5dfc"
            };
            db.Classes.Add(lessonClass);
        }

        var specs = Specs();
        var definitions = new List<ActivityDefinition>(specs.Count);
        for (var index = 0; index < specs.Count; index++)
        {
            var spec = specs[index];
            var configJson = JsonSerializer.Serialize(spec.Config, ActivityJsonDefaults.Options);
            var validationError = ActivityValidation.ValidateDefinition(spec.Type, spec.Name, configJson);
            if (validationError is not null)
                throw new InvalidOperationException($"Animal activity pack entry '{spec.Type}' is invalid: {validationError}");

            var definition = await db.ActivityDefinitions
                .SingleOrDefaultAsync(x => x.CreatedBy == Marker && x.Type == spec.Type, ct);
            if (definition is null)
            {
                definition = new ActivityDefinition
                {
                    Id = Guid.NewGuid(),
                    Type = spec.Type,
                    Name = spec.Name,
                    CreatedBy = Marker,
                    CreatedAt = now,
                    Version = 1
                };
                db.ActivityDefinitions.Add(definition);
            }

            definition.Name = spec.Name;
            definition.EngineType = ActivityEngineCatalog.EngineFor(spec.Type);
            definition.PresetType = ActivityEngineCatalog.PresetFor(spec.Type);
            definition.SchemaVersion = 1;
            definition.Description = spec.Description;
            definition.ConfigJson = configJson;
            definition.ThemeJson = JsonSerializer.Serialize(spec.Theme, ActivityJsonDefaults.Options);
            definition.SettingsJson = "{}";
            definition.ModifiersJson = "{}";
            definition.PresentationJson = JsonSerializer.Serialize(new
            {
                showJoinCode = true,
                showProgress = true,
                soundEnabled = true,
                reducedMotionSafe = true
            }, ActivityJsonDefaults.Options);
            definition.ArchivedAt = null;
            definition.LibraryPosition = index;
            definition.UpdatedAt = now;
            definitions.Add(definition);
        }

        await db.SaveChangesAsync(ct);

        var lesson = await db.Lessons
            .SingleOrDefaultAsync(x => x.ClassId == lessonClass.Id && x.Title == LessonTitle, ct);
        if (lesson is null)
        {
            lesson = new Lesson
            {
                ClassId = lessonClass.Id,
                Date = DateOnly.FromDateTime(now.UtcDateTime),
                Title = LessonTitle,
                AvailableFrom = now.AddMinutes(-5),
                ExpiresAt = now.AddDays(30),
                DesignatedStartAt = now.AddMinutes(10),
                VolumePercent = 100,
                Muted = false,
                SubstituteNotes = "Test pack: launch each cue in order. Phone games show a join code and QR flow; host-only activities use the main display and controller."
            };
            db.Lessons.Add(lesson);
        }
        else
        {
            lesson.Date = DateOnly.FromDateTime(now.UtcDateTime);
            lesson.AvailableFrom = now.AddMinutes(-5);
            lesson.ExpiresAt = now.AddDays(30);
            lesson.DesignatedStartAt = now.AddMinutes(10);
            lesson.SubstituteNotes = "Test pack: launch each cue in order. Phone games show a join code and QR flow; host-only activities use the main display and controller.";
        }

        await db.SaveChangesAsync(ct);

        var existingItems = await db.PlaylistItems
            .Where(x => x.LessonId == lesson.Id)
            .ToListAsync(ct);
        for (var index = 0; index < definitions.Count; index++)
        {
            var definition = definitions[index];
            var item = existingItems.FirstOrDefault(x => x.ActivityDefinitionId == definition.Id);
            if (item is null)
            {
                item = new PlaylistItem
                {
                    Id = Guid.NewGuid(),
                    LessonId = lesson.Id,
                    ActivityDefinitionId = definition.Id,
                    Title = definition.Name,
                    Type = "activity",
                    Role = "lesson",
                    Position = (index + 1) * 1000,
                    EndBehavior = "pause",
                    AllowSkip = true,
                    VolumePercent = 100,
                    BackgroundColor = "#091c1d",
                    TransitionStyle = "fade",
                    TransitionDurationMs = 500
                };
                db.PlaylistItems.Add(item);
            }

            item.Title = definition.Name;
            item.Type = "activity";
            item.Role = "lesson";
            item.Position = (index + 1) * 1000;
            item.EndBehavior = "pause";
            item.AllowSkip = true;
            item.BackgroundColor = "#091c1d";
            item.TransitionStyle = "fade";
            item.TransitionDurationMs = 500;
        }

        lesson.Version++;
        await db.SaveChangesAsync(ct);
        return new Result(lessonClass.Id, lesson.Id, definitions.Count,
            definitions.Count(x => existingItems.Any(item => item.ActivityDefinitionId == x.Id)) +
            definitions.Count(x => !existingItems.Any(item => item.ActivityDefinitionId == x.Id)),
            definitions.Select(x => x.Name).ToArray());
    }

    private static List<PackSpec> Specs() =>
    [
        new(ActivityTypes.Wheel, "Safari Spin", "Spin through a colorful animal adventure and let the wheel choose the next champion.",
            Obj(("title", "Safari Spin"), ("items", Arr(
                Obj(("id", "lion"), ("label", "Lion roar"), ("weight", 1), ("color", "#ff6b6b"), ("icon", "🦁")),
                Obj(("id", "otter"), ("label", "Otter splash"), ("weight", 1), ("color", "#4ecdc4"), ("icon", "🦦")),
                Obj(("id", "parrot"), ("label", "Parrot party"), ("weight", 1), ("color", "#ffd166"), ("icon", "🦜")),
                Obj(("id", "panda"), ("label", "Panda pose"), ("weight", 1), ("color", "#8b7cff"), ("icon", "🐼")),
                Obj(("id", "penguin"), ("label", "Penguin waddle"), ("weight", 1), ("color", "#48cae4"), ("icon", "🐧")),
                Obj(("id", "red-panda"), ("label", "Red panda bonus"), ("weight", 1), ("color", "#ff8c42"), ("icon", "🦊")))),
            ("spinDurationSeconds", 4), ("removeWinner", false), ("allowRepeat", true), ("playSound", true), ("celebration", true)),
            Theme("arcade", "#ff6b6b", "#4ecdc4", "#ffd166", "#17162a")),

        new(ActivityTypes.Picker, "Wild Card Picker", "Pick an animal ambassador for the next round, demonstration, or team job.",
            Obj(("title", "Wild Card Picker"), ("items", Arr(
                Obj(("id", "axolotl"), ("text", "Axolotl"), ("weight", 1)),
                Obj(("id", "capybara"), ("text", "Capybara"), ("weight", 1)),
                Obj(("id", "chameleon"), ("text", "Chameleon"), ("weight", 1)),
                Obj(("id", "flamingo"), ("text", "Flamingo"), ("weight", 1)),
                Obj(("id", "narwhal"), ("text", "Narwhal"), ("weight", 1)),
                Obj(("id", "sloth"), ("text", "Sloth"), ("weight", 1)))),
            ("removeAfterPick", false), ("allowRepeat", true), ("animationDurationMs", 2600), ("playSound", true)),
            Theme("neon", "#67e8f9", "#a78bfa", "#f9a8d4", "#11152d")),

        new(ActivityTypes.Scoreboard, "Jungle Jam Scoreboard", "Keep the animal teams visible while the room earns points.",
            Obj(("title", "Jungle Jam Scoreboard"), ("teams", Arr(
                Obj(("id", "canopy-cats"), ("name", "Canopy Cats"), ("color", "#f97316"), ("icon", "🐆"), ("initialScore", 0)),
                Obj(("id", "reef-runners"), ("name", "Reef Runners"), ("color", "#06b6d4"), ("icon", "🐬"), ("initialScore", 0)),
                Obj(("id", "burrow-brains"), ("name", "Burrow Brains"), ("color", "#a78bfa"), ("icon", "🐰"), ("initialScore", 0)),
                Obj(("id", "sky-squad"), ("name", "Sky Squad"), ("color", "#facc15"), ("icon", "🦅"), ("initialScore", 0)))),
            ("increment", 50), ("decrement", 25), ("sortByScore", true), ("showPodium", true), ("playSound", true)),
            Theme("stage", "#f97316", "#06b6d4", "#facc15", "#091c1d")),

        new(ActivityTypes.Countdown, "Hummingbird Hustle", "A short, bright timer for a fast animal challenge or team brainstorm.",
            Obj(("title", "Hummingbird Hustle"), ("durationSeconds", 45), ("warningThresholdSeconds", 10), ("playSoundOnWarning", true), ("playSoundOnZero", true), ("endBehavior", "pause"), ("backgroundColor", "#101b3d"), ("message", "Find your answer before the hummingbird lands!")),
            Theme("cyberpunk", "#22d3ee", "#f472b6", "#facc15", "#101b3d")),

        new(ActivityTypes.PrizeGrid, "Critter Prize Grid", "Reveal playful animal-themed bonuses, twists, and surprise challenges.",
            Obj(("title", "Critter Prize Grid"), ("boxCount", 8), ("columns", 4), ("boxes", Arr(
                Obj(("boxNumber", 1), ("frontText", "1"), ("frontEmoji", "🦁"), ("hiddenPrize", "Lion-sized bonus!"), ("points", 100)),
                Obj(("boxNumber", 2), ("frontText", "2"), ("frontEmoji", "🐙"), ("hiddenPrize", "Octopus: choose two answers"), ("points", 75)),
                Obj(("boxNumber", 3), ("frontText", "3"), ("frontEmoji", "🦋"), ("hiddenPrize", "Butterfly boost"), ("points", 150)),
                Obj(("boxNumber", 4), ("frontText", "4"), ("frontEmoji", "🦥"), ("hiddenPrize", "Sloth round: take your time"), ("points", 50)),
                Obj(("boxNumber", 5), ("frontText", "5"), ("frontEmoji", "🐋"), ("hiddenPrize", "Whale of a bonus"), ("points", 200)),
                Obj(("boxNumber", 6), ("frontText", "6"), ("frontEmoji", "🦊"), ("hiddenPrize", "Fox it up: steal a point"), ("points", 125)),
                Obj(("boxNumber", 7), ("frontText", "7"), ("frontEmoji", "🐢"), ("hiddenPrize", "Turtle shield: no penalty"), ("points", 0)),
                Obj(("boxNumber", 8), ("frontText", "8"), ("frontEmoji", "🦄"), ("hiddenPrize", "Mythical grand finale"), ("points", 300)))),
            ("randomizeOnReset", true), ("playSound", true)),
            Theme("retro", "#f59e0b", "#fb7185", "#a7f3d0", "#241a2f")),

        new(ActivityTypes.Trivia, "Wild Fact Frenzy", "Real animal trivia with explanations that make the reveal worth watching.",
            Obj(("title", "Wild Fact Frenzy"), ("questions", Arr(
                Obj(("id", "q1"), ("prompt", "Which animal is the fastest land animal?"), ("options", Arr("Cheetah", "Pronghorn", "Ostrich", "Greyhound")), ("correctIndex", 0), ("points", 100), ("explanation", "A cheetah can sprint at roughly 60–70 miles per hour for short bursts.")),
                Obj(("id", "q2"), ("prompt", "Which animal is famous for using tools to crack open food?"), ("options", Arr("Sea otter", "Giraffe", "Flamingo", "Koala")), ("correctIndex", 0), ("points", 125), ("explanation", "Sea otters use rocks as anvils to open hard-shelled prey.")),
                Obj(("id", "q3"), ("prompt", "What is the largest animal ever known to have lived?"), ("options", Arr("African elephant", "Blue whale", "Giant squid", "Whale shark")), ("correctIndex", 1), ("points", 150), ("explanation", "Blue whales can exceed 90 feet and weigh more than 100 tons.")),
                Obj(("id", "q4"), ("prompt", "A group of flamingos is commonly called what?"), ("options", Arr("A flamboyance", "A sparkle", "A parade", "A pinking")), ("correctIndex", 0), ("points", 175), ("explanation", "Flamboyance is the delightfully colorful collective noun used for flamingos.")),
                Obj(("id", "q5"), ("prompt", "Which animal can regenerate parts of its heart, spinal cord, and brain?"), ("options", Arr("Axolotl", "Panda", "Penguin", "Zebra")), ("correctIndex", 0), ("points", 200), ("explanation", "Axolotls are remarkable salamanders with extraordinary regenerative abilities.")))),
            ("settings", Obj(("answerMode", "choice")))),
            Theme("neon", "#fb7185", "#38bdf8", "#facc15", "#0f172a")),

        new(ActivityTypes.RapidFire, "Rapid Reef Round", "Animal facts come fast: answer before the tide timer runs out.",
            Obj(("title", "Rapid Reef Round"), ("defaultTimerSeconds", 12), ("questions", Arr(
                Obj(("id", "q1"), ("prompt", "Which animal has fingerprints surprisingly similar to humans?"), ("options", Arr("Koala", "Dolphin", "Turtle", "Toucan")), ("correctIndex", 0), ("points", 100), ("timerSeconds", 12), ("explanation", "Koala fingerprints can look remarkably human under close inspection.")),
                Obj(("id", "q2"), ("prompt", "Which bird can fly backward?"), ("options", Arr("Hummingbird", "Penguin", "Ostrich", "Albatross")), ("correctIndex", 0), ("points", 125), ("timerSeconds", 10), ("explanation", "Hummingbirds can hover and fly backward by rotating their wings.")),
                Obj(("id", "q3"), ("prompt", "How many hearts does an octopus have?"), ("options", Arr("One", "Two", "Three", "Eight")), ("correctIndex", 2), ("points", 150), ("timerSeconds", 10), ("explanation", "An octopus has three hearts: two move blood to the gills and one to the body.")))),
            ("playSound", true)),
            Theme("cyberpunk", "#22d3ee", "#c084fc", "#f97316", "#081c2c")),

        new(ActivityTypes.EmojiPrompt, "Emoji Animal Tales", "Decode animal stories from emoji clues before the host reveals the answer.",
            Obj(("title", "Emoji Animal Tales"), ("instruction", "Decode the animal clue before the reveal!"), ("rounds", Arr(
                Obj(("id", "r1"), ("emoji", "🦁👑"), ("prompt", "Name the famous animal movie."), ("answer", "The Lion King"), ("hint", "A royal savanna adventure."), ("points", 100), ("category", "Movies")),
                Obj(("id", "r2"), ("emoji", "🐢🐇🏁"), ("prompt", "Name the classic animal race story."), ("answer", "The Tortoise and the Hare"), ("hint", "Slow and steady meets very speedy."), ("points", 125), ("category", "Stories")),
                Obj(("id", "r3"), ("emoji", "🐝🍯"), ("prompt", "Name the sweet animal product."), ("answer", "Honey"), ("hint", "Bees make it and bears love it."), ("points", 150), ("category", "Nature"))))),
            Theme("arcade", "#f59e0b", "#f43f5e", "#84cc16", "#1f1535")),

        new(ActivityTypes.RankIt, "Rank the Wild", "Put animals in order using real science, then debate the result.",
            Obj(("title", "Rank the Wild"), ("instruction", "Put the animals in the right order before the reveal!"), ("rounds", Arr(
                Obj(("id", "r1"), ("prompt", "Rank these animals from smallest to largest by typical adult weight."), ("items", Arr(
                    Obj(("id", "i1"), ("label", "Hummingbird"), ("detail", "A tiny flying pollinator"), ("icon", "🐦")),
                    Obj(("id", "i2"), ("label", "Penguin"), ("detail", "A tuxedoed swimmer"), ("icon", "🐧")),
                    Obj(("id", "i3"), ("label", "Gorilla"), ("detail", "A powerful great ape"), ("icon", "🦍")),
                    Obj(("id", "i4"), ("label", "Blue whale"), ("detail", "The ocean giant"), ("icon", "🐋")))), ("revealNote", "Hummingbird → penguin → gorilla → blue whale is the science order."), ("category", "Size")),
                Obj(("id", "r2"), ("prompt", "Rank these animals from shortest to longest typical lifespan."), ("items", Arr(
                    Obj(("id", "i1"), ("label", "Mayfly"), ("icon", "🪰")),
                    Obj(("id", "i2"), ("label", "House cat"), ("icon", "🐈")),
                    Obj(("id", "i3"), ("label", "African elephant"), ("icon", "🐘")),
                    Obj(("id", "i4"), ("label", "Greenland shark"), ("icon", "🦈")))), ("revealNote", "Some Greenland sharks may live for centuries."), ("category", "Lifespan"))))),
            Theme("clean", "#0ea5e9", "#14b8a6", "#f59e0b", "#102a43")),

        new(ActivityTypes.WordScramble, "Scramble the Savannah", "Unscramble animal names before the countdown stampedes away.",
            Obj(("title", "Scramble the Savannah"), ("secondsPerRound", 25), ("instruction", "Unscramble the animal before time runs out!"), ("rounds", Arr(
                Obj(("id", "r1"), ("word", "MEERKAT"), ("clue", "A curious mammal that stands guard."), ("category", "Savannah"), ("hint", "It starts with M."), ("points", 100), ("scrambledWord", "KRETAME")),
                Obj(("id", "r2"), ("word", "NARWHAL"), ("clue", "The unicorn of the sea."), ("category", "Ocean"), ("hint", "It starts with N."), ("points", 125), ("scrambledWord", "WALHRAN")),
                Obj(("id", "r3"), ("word", "CHAMELEON"), ("clue", "A color-changing reptile."), ("category", "Reptiles"), ("hint", "It starts with C."), ("points", 150), ("scrambledWord", "MELONACHE"))))),
            Theme("retro", "#fb7185", "#facc15", "#22c55e", "#2a1f3d")),

        new(ActivityTypes.Prediction, "Predict the Paws", "Lock in what an animal will do next, then reveal the real answer.",
            Obj(("title", "Predict the Paws"), ("instruction", "Choose what happens next before the reveal!"), ("rounds", Arr(
                Obj(("id", "r1"), ("prompt", "A squirrel finds one acorn and spots another. What happens next?"), ("options", Arr("It hides the first", "It grabs the second", "It takes a nap", "It asks a crow")), ("correctIndex", 1), ("explanation", "Squirrels are famous for collecting and caching food."), ("points", 100), ("category", "Behavior")),
                Obj(("id", "r2"), ("prompt", "A cat sees a cardboard box. What is the most likely outcome?"), ("options", Arr("It ignores it", "It moves into the box", "It mails the box", "It teaches the box")), ("correctIndex", 1), ("explanation", "The box is now the cat's kingdom."), ("points", 125), ("category", "Everyday Science"))))),
            Theme("neon", "#a78bfa", "#22d3ee", "#fda4af", "#17112c")),

        new(ActivityTypes.SurveyBoard, "Survey Showdown: Animal Edition", "Guess the most popular animal answers and flip the board with the host.",
            Obj(
                ("title", "Survey Showdown: Animal Edition"),
                ("questions", Arr(
                    Obj(
                        ("id", "q1"),
                        ("prompt", "Name an animal people would love to see on a safari."),
                        ("answers", Arr(
                            Obj(("rank", 1), ("text", "Lion"), ("points", 34)),
                            Obj(("rank", 2), ("text", "Elephant"), ("points", 28)),
                            Obj(("rank", 3), ("text", "Giraffe"), ("points", 18)),
                            Obj(("rank", 4), ("text", "Zebra"), ("points", 12)),
                            Obj(("rank", 5), ("text", "Cheetah"), ("points", 8))
                        ))),
                    Obj(
                        ("id", "q2"),
                        ("prompt", "Name an animal known for being very slow."),
                        ("answers", Arr(
                            Obj(("rank", 1), ("text", "Sloth"), ("points", 48)),
                            Obj(("rank", 2), ("text", "Tortoise"), ("points", 31)),
                            Obj(("rank", 3), ("text", "Snail"), ("points", 15)),
                            Obj(("rank", 4), ("text", "Koala"), ("points", 6))
                        )))
                )),
                ("playSound", true)
            ),
            Theme("stage", "#f97316", "#facc15", "#22d3ee", "#071c1b")),

        new(ActivityTypes.ImageReveal, "Mystery Critter Reveal", "Reveal a cheerful original animal illustration one stage at a time.",
            Obj(("title", "Mystery Critter Reveal"), ("imageUrl", AnimalSvg("#172554", "#86efac", "#facc15", "TREE FROG")), ("style", "pixel"), ("totalStages", 8), ("autoIntervalSeconds", 2), ("prompt", "Which colorful animal is hiding?"), ("answer", "A tree frog"), ("presetLabel", "MYSTERY CRITTER")),
            Theme("cyberpunk", "#22d3ee", "#86efac", "#facc15", "#07152f")),

        new(ActivityTypes.ImageShuffle, "Critter Snapshot Shuffle", "Cycle through original animal cards and let the display choose the next creature.",
            Obj(("title", "Critter Snapshot Shuffle"), ("images", Arr(
                Obj(("id", "frog"), ("imageUrl", AnimalSvg("#14532d", "#86efac", "#facc15", "FROG")), ("label", "Tree Frog"), ("weight", 1)),
                Obj(("id", "whale"), ("imageUrl", AnimalSvg("#0c4a6e", "#38bdf8", "#e0f2fe", "WHALE")), ("label", "Blue Whale"), ("weight", 1)),
                Obj(("id", "fox"), ("imageUrl", AnimalSvg("#7c2d12", "#fb923c", "#fde68a", "FOX")), ("label", "Red Fox"), ("weight", 1)),
                Obj(("id", "panda"), ("imageUrl", AnimalSvg("#334155", "#f8fafc", "#f472b6", "PANDA")), ("label", "Giant Panda"), ("weight", 1)))),
            ("removeAfterPick", false), ("shuffleSpeedMs", 90)),
            Theme("arcade", "#38bdf8", "#fb923c", "#f8fafc", "#111827")),

        new(ActivityTypes.Buzzer, "Buzzer Battle: Who Am I?", "Race through animal clues, with a fair first buzz and a dramatic reveal.",
            Obj(("title", "Buzzer Battle: Who Am I?"), ("clues", Arr(
                Obj(("id", "clue-1"), ("prompt", "I can change color, and my eyes can look in different directions."), ("answer", "A chameleon"), ("points", 150)),
                Obj(("id", "clue-2"), ("prompt", "I use a long sticky tongue to catch insects."), ("answer", "A chameleon"), ("points", 100)),
                Obj(("id", "clue-3"), ("prompt", "My curled tail helps me balance in trees."), ("answer", "A chameleon"), ("points", 50)))),
            ("lockOutOnMiss", true), ("stealOnMiss", true), ("wrongPenalty", 25)),
            Theme("stage", "#f97316", "#2dd4bf", "#facc15", "#091c1d")),

        new(ActivityTypes.Punchline, "Pawsome Punchlines", "Write the funniest ending to an animal-themed prompt, then vote for the room favorite.",
            Obj(("title", "Pawsome Punchlines"), ("prompts", Arr(
                Obj(("id", "prompt-1"), ("prompt", "The zookeeper knew the penguin was in charge when it demanded ______."), ("points", 100)),
                Obj(("id", "prompt-2"), ("prompt", "The worst possible animal to run a group project would be ______ because ______."), ("points", 125)))),
            ("requireModeration", true), ("votingSeconds", 30), ("votingStyle", "gallery"), ("headToHeadMatchPoints", 50)),
            Theme("neon", "#f472b6", "#22d3ee", "#fde047", "#24112c")),

        new(ActivityTypes.FakeOut, "Fake Out: Wild Facts", "Write convincing animal fact decoys and see who can sniff out the truth.",
            Obj(("title", "Fake Out: Wild Facts"), ("rounds", Arr(
                Obj(("id", "round-1"), ("prompt", "Which animal fact is true? Write a believable fake answer."), ("truth", "Goats have rectangular pupils."), ("points", 100)),
                Obj(("id", "round-2"), ("prompt", "Which animal fact is true? Make the bluff sound scientific."), ("truth", "Crows can remember human faces."), ("points", 125)))),
            ("requireModeration", true), ("votingSeconds", 30), ("bluffPoints", 50), ("truthPoints", 100), ("hostFavoritePoints", 25), ("revealAuthors", true)),
            Theme("retro", "#f97316", "#a78bfa", "#facc15", "#21152f")),

        new(ActivityTypes.Drawing, "Doodle a Creature", "Draw a silly animal invention on a phone, then reveal the gallery and vote.",
            Obj(("title", "Doodle a Creature"), ("prompts", Arr(
                Obj(("id", "prompt-1"), ("prompt", "Design an animal that would be terrible at hide-and-seek."), ("points", 100)),
                Obj(("id", "prompt-2"), ("prompt", "Draw the animal mascot for a team that never gives up."), ("points", 125)))),
            ("requireModeration", true), ("votingSeconds", 30), ("maxStrokePoints", 80)),
            Theme("arcade", "#4ade80", "#60a5fa", "#f472b6", "#10223b")),

        new(ActivityTypes.Ordering, "Order Up: Animal Superlatives", "Arrange animal milestones and facts into a satisfying reveal.",
            Obj(("title", "Order Up: Animal Superlatives"), ("rounds", Arr(
                Obj(("id", "round-1"), ("prompt", "Put these animals in order from smallest to largest by typical adult weight."), ("items", Arr(
                    Obj(("id", "item-1"), ("label", "Mouse"), ("icon", "🐭")),
                    Obj(("id", "item-2"), ("label", "Rabbit"), ("icon", "🐇")),
                    Obj(("id", "item-3"), ("label", "Dog"), ("icon", "🐕")),
                    Obj(("id", "item-4"), ("label", "Elephant"), ("icon", "🐘")))), ("correctOrder", Arr("item-1", "item-2", "item-3", "item-4")), ("points", 100)),
                Obj(("id", "round-2"), ("prompt", "Put these animal life stages in a sensible order."), ("items", Arr(
                    Obj(("id", "item-1"), ("label", "Egg"), ("icon", "🥚")),
                    Obj(("id", "item-2"), ("label", "Tadpole"), ("icon", "🐟")),
                    Obj(("id", "item-3"), ("label", "Froglet"), ("icon", "🐸")),
                    Obj(("id", "item-4"), ("label", "Adult frog"), ("icon", "🐸")))), ("correctOrder", Arr("item-1", "item-2", "item-3", "item-4")), ("points", 125))))),
            Theme("clean", "#14b8a6", "#60a5fa", "#facc15", "#102a43")),

        new(ActivityTypes.Word, "Word Storm: Animal Habitat", "Build a shared cloud of animal habitats, with duplicate detection and host approval.",
            Obj(("title", "Word Storm: Animal Habitat"), ("rounds", Arr(
                Obj(("id", "round-1"), ("prompt", "Name a place an animal might live."), ("category", "Habitats"), ("points", 10), ("seconds", 45)),
                Obj(("id", "round-2"), ("prompt", "Name an animal adaptation."), ("category", "Adaptations"), ("points", 10), ("seconds", 45)))),
            ("requireModeration", true), ("allowDuplicates", false)),
            Theme("neon", "#34d399", "#60a5fa", "#fbbf24", "#0f2032")),

        new(ActivityTypes.MatchPlayer, "Match Minds: Animal Snacks", "Predict what the target player would choose, then compare answers.",
            Obj(("title", "Match Minds: Animal Snacks"), ("rounds", Arr(
                Obj(("id", "round-1"), ("prompt", "Which animal snack would you choose for a movie night?"), ("options", Arr("Carrot sticks for a rabbit", "Fish crackers for an otter", "Bananas for a monkey", "Honey toast for a bear")), ("points", 100)),
                Obj(("id", "round-2"), ("prompt", "Which animal would make the best study buddy?"), ("options", Arr("Owl", "Border collie", "Octopus", "Capybara")), ("points", 125))))),
            Theme("retro", "#f472b6", "#60a5fa", "#fde047", "#211a38")),

        new(ActivityTypes.StageChallenge, "Beat the Beast Clock", "A host-led challenge with a theatrical animal goal and simple success/fail ruling.",
            Obj(("title", "Beat the Beast Clock"), ("challenges", Arr(
                Obj(("id", "challenge-1"), ("title", "Penguin Parade"), ("instructions", "Get the whole team to waddle from one side of the room to the other without breaking character."), ("seconds", 45), ("points", 100), ("failPoints", 0)),
                Obj(("id", "challenge-2"), ("title", "Squirrel Stack"), ("instructions", "Build a stable stack of five classroom objects before the squirrel timer ends."), ("seconds", 60), ("points", 125), ("failPoints", 0))))),
            Theme("stage", "#f97316", "#22d3ee", "#facc15", "#091c1d")),

        new(ActivityTypes.Bracket, "Critter Cup Bracket", "Advance four animal champions through audience votes to crown the Critter Cup winner.",
            Obj(("title", "Critter Cup Bracket"), ("preset", "bracketBattle"), ("presetLabel", "CRITTER CUP"), ("entrantSource", "teacher"), ("entrantSelection", "all"), ("pointsPerWin", 100), ("entrants", Arr(
                Obj(("id", "entrant-1"), ("label", "Team Otter 🦦")),
                Obj(("id", "entrant-2"), ("label", "Team Fox 🦊")),
                Obj(("id", "entrant-3"), ("label", "Team Axolotl 🦎")),
                Obj(("id", "entrant-4"), ("label", "Team Capybara 🐹")))), ("votingSeconds", 30)),
            Theme("arcade", "#f97316", "#a78bfa", "#4ade80", "#17162a")),

        new(ActivityTypes.PhysicalRoom, "Four Corners: Animal Homes", "Move to the animal habitat that matches your answer, with no phones required.",
            Obj(("title", "Four Corners: Animal Homes"), ("preset", "fourCorners"), ("presetLabel", "ANIMAL HOMES"), ("rounds", Arr(
                Obj(("id", "round-1"), ("title", "Where would you find a narwhal?"), ("instructions", "Choose the corner that matches the animal's home. The host reveals the answer after the timer."), ("choices", Arr("Ocean 🌊", "Desert 🏜️", "Rainforest 🌴", "Arctic ❄️")), ("seconds", 20), ("revealText", "Narwhals live in Arctic waters.")),
                Obj(("id", "round-2"), ("title", "Where would a tree frog feel at home?"), ("instructions", "Move to your answer before the jungle drum stops."), ("choices", Arr("Rainforest 🌴", "Tundra ❄️", "Open ocean 🌊", "High desert 🏜️")), ("seconds", 20), ("revealText", "Tree frogs thrive in warm, humid habitats.")))),
            ("randomizeChoices", false)),
            Theme("stage", "#22c55e", "#38bdf8", "#facc15", "#102a43")),

        new(ActivityTypes.Utility, "Animal Adventure Utilities", "Use one reusable host surface for animal challenges, random picks, teams, and countdowns.",
            Obj(("title", "Animal Adventure Utilities"), ("utilityType", "challengePicker"), ("choices", Arr("Heads", "Tails")), ("diceSides", 6), ("minimum", 1), ("maximum", 100), ("boxes", Arr(
                Obj(("id", "box-1"), ("label", "Panda Box"), ("value", "Everyone does a panda pose"), ("points", 50)),
                Obj(("id", "box-2"), ("label", "Fox Box"), ("value", "Choose the next team"), ("points", 75)),
                Obj(("id", "box-3"), ("label", "Whale Box"), ("value", "Double the next score"), ("points", 150)))), ("challenges", Arr(
                Obj(("id", "challenge-1"), ("label", "Animal sound lightning round"), ("instructions", "The host makes an animal sound; the room guesses it."), ("points", 50)),
                Obj(("id", "challenge-2"), ("label", "Migration shuffle"), ("instructions", "Randomly choose the next animal category."), ("points", 75)),
                Obj(("id", "challenge-3"), ("label", "Team mascot moment"), ("instructions", "Give the winning team ten seconds to celebrate."), ("points", 25)))), ("teamCount", 2), ("teamAssignmentMode", "balanced"), ("durationSeconds", 30)),
            Theme("cyberpunk", "#c084fc", "#22d3ee", "#facc15", "#11152d")),

        new(ActivityTypes.Poll, "Read the Room: Animal Vibes", "See which animal best matches the room, then reveal the colorful distribution.",
            Obj(("preset", "readTheRoom"), ("presetLabel", "READ THE ROOM"), ("question", "Which animal best matches your energy today?"), ("options", Arr("Curious otter 🦦", "Calm capybara 🐹", "Brave fox 🦊", "Sleepy sloth 🦥")), ("showLiveResults", true), ("displayStyle", "bar")),
            Theme("neon", "#22d3ee", "#f472b6", "#facc15", "#11152d")),

        new(ActivityTypes.Responses, "Animal Advice Wall", "Collect moderated animal-themed ideas and feature the best response on screen.",
            Obj(("title", "Animal Advice Wall"), ("questions", Arr(
                Obj(("id", "q1"), ("prompt", "What would your animal alter ego teach the room?"), ("category", "Advice")),
                Obj(("id", "q2"), ("prompt", "Share a tiny animal fact that deserves a spotlight."), ("category", "Wild Facts")),
                Obj(("id", "q3"), ("prompt", "What should our imaginary class mascot be called?"), ("category", "Mascot")))), ("prompt", "Send a thought for the animal advice wall:"), ("requireModeration", true), ("displayStyle", "grid")),
            Theme("clean", "#14b8a6", "#8b5cf6", "#f59e0b", "#102a43"))
    ];

    private static JsonObject Theme(string preset, string primary, string secondary, string accent, string background) =>
        Obj(("preset", preset), ("primaryColor", primary), ("secondaryColor", secondary), ("accentColor", accent),
            ("backgroundColor", background), ("textColor", "#ffffff"), ("soundPack", "gameshow"), ("backgroundMotion", true));

    private static JsonObject Obj(params (string Key, object? Value)[] values)
    {
        var result = new JsonObject();
        foreach (var (key, value) in values) result[key] = Node(value);
        return result;
    }

    private static JsonArray Arr(params object?[] values)
    {
        var result = new JsonArray();
        foreach (var value in values) result.Add(Node(value));
        return result;
    }

    private static JsonNode? Node(object? value) => value switch
    {
        null => null,
        JsonNode node => node,
        _ => JsonValue.Create(value)
    };

    private static string AnimalSvg(string background, string body, string accent, string label)
    {
        var svg = $"""
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600">
              <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="{background}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs>
              <rect width="900" height="600" rx="48" fill="url(#g)"/>
              <circle cx="450" cy="290" r="155" fill="{body}"/>
              <path d="M330 180 L285 80 L390 145 M570 180 L615 80 L510 145" fill="{body}" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>
              <circle cx="395" cy="275" r="22" fill="#111827"/><circle cx="505" cy="275" r="22" fill="#111827"/>
              <circle cx="402" cy="267" r="7" fill="#fff"/><circle cx="512" cy="267" r="7" fill="#fff"/>
              <path d="M410 345 Q450 375 490 345" fill="none" stroke="#111827" stroke-width="16" stroke-linecap="round"/>
              <circle cx="450" cy="330" r="18" fill="{accent}"/>
              <text x="450" y="510" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="46" font-weight="800" letter-spacing="6">{label}</text>
            </svg>
            """;
        return "data:image/svg+xml;base64," + Convert.ToBase64String(Encoding.UTF8.GetBytes(svg));
    }
}
