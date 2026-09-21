using System.Globalization;
using System.Text;

namespace LessonCue.Server.Activities;

/// <summary>
/// Keeps player and team names suitable for a shared classroom display.
///
/// This is intentionally scoped to identity fields. It must not be applied to
/// lesson content, quiz answers, or media filenames, where the same words can
/// be legitimate subject matter. Matching is token-aware so ordinary names
/// such as "class" are not rejected merely because they contain a short term.
/// Punctuation and common leetspeak substitutions are normalized to prevent a
/// name from bypassing the list with separators or look-alike characters.
/// </summary>
public static class OffensiveNameFilter
{
    private static readonly HashSet<string> BlockedTokens = new(StringComparer.Ordinal)
    {
        // General profanity and sexual insults.
        "arse", "arsehole", "ass", "asshat", "asshole", "asslick", "asswipe",
        "bastard", "bellend", "bitch", "bitches", "bollock", "bollocks", "boner",
        "bullshit", "buttcrack", "crap", "cunt", "dick", "dickhead", "dildo",
        "douche", "douchebag", "dumbass", "dyke", "fag", "faggot", "fanny",
        "fuck", "fucker", "fucking", "goddamn", "jackass", "jerkoff", "knob",
        "knobhead", "motherfucker", "muffdiver", "piss", "prick", "pussy",
        "scumbag", "shit", "shite", "slut", "twat", "wank", "wanker", "whore",
        "turd", "turdface", "tosser", "skank", "slag", "spastic", "spaz",
        "sodoff", "bugger", "bloodyhell", "cock", "cocksucker", "cum", "dickwad",
        "dickweed", "dipshit", "fck", "fcking", "freaking", "horny", "milf",
        "paki", "pissflaps", "prickhead", "shithead", "shitter", "titties", "titty",
        "tits", "tit", "vulva", "penis", "vagina", "boob", "boobs", "porn",
        "porno", "pornography", "hentai", "sex", "semen", "sperm", "blowjob",
        "handjob", "rimjob", "gangbang", "orgasm", "masturbate", "masturbation",

        // Racial, ethnic, nationality, caste, and religious slurs.
        "beaner", "chink", "chinaman", "coon", "cracker", "curry", "darkie",
        "gook", "jap", "kike", "kyke", "negro", "nigga", "nigger", "pajeet",
        "raghead", "sandnigger", "spic", "spick", "towelhead", "wetback", "zipperhead",
        "gypsy", "gyp", "pikey", "redskin", "sambo", "slope", "wog", "yid",
        "heeb", "honkie", "honky", "haji", "muzzie", "jigaboo", "jiggaboo",
        "kaffir", "kafir", "porchmonkey", "spearcarrier", "tarbaby", "untouchable",

        // Homophobic, transphobic, misogynistic, and disability-directed slurs.
        "homo", "tranny", "shemale", "ladyboy", "queerfag", "dykefag", "retard",
        "retarded", "mong", "mongoloid", "cripple", "crip", "gimp", "invalid",
        "moron", "imbecile", "idiot", "simpleton", "windowlicker", "uglybitch",
        "bimbо", "bimbo", "femslut", "cumslut", "slutbag", "whorebag", "prostitute",
        "faggy", "faggotry", "homophobe", "transphobe",

        // Hate-group names, supremacist slogans, and common coded aliases.
        "nazi", "nazis", "nazism", "hitler", "heilhitler", "siegheil", "kkk",
        "klan", "aryan", "whitepower", "whitesupremacy", "whitepride", "bloodandsoil",
        "fourteenwords", "fourteen88", "1488", "88hate", "gasthes",
        "groomer", "racewar", "ethnostate", "deathto", "killall", "genocide",

        // Threatening or abusive identity phrases that are frequently used as
        // display names. Harmless uses in lesson text are unaffected.
        "killyourself", "kys", "go die", "die bitch", "rape", "rapist", "rapey",
        "molest", "molester", "pedophile", "pedo", "childlover", "incest", "necrophile",
        "terrorist", "terrorism", "suicide", "schoolshooter", "massshooter",
    };

    private static readonly HashSet<string> BlockedPhrases = new(StringComparer.Ordinal)
    {
        "son of a bitch", "sonofabitch", "mother fucker", "motherfucker", "go fuck yourself",
        "fuck you", "fuck off", "shut the fuck up", "piece of shit", "pieceofshit",
        "eat shit", "eatmy shorts", "screw you", "kiss my ass", "lick my balls",
        "white power", "white pride", "heil hitler", "kill yourself", "go die",
        "death to", "death threat", "school shooter", "gas the", "rape culture",
    };

    public static bool IsAllowed(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return true;

        var normalized = Normalize(value);
        if (normalized.Length == 0) return true;
        if (BlockedPhrases.Contains(normalized)) return false;

        var words = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (words.Any(BlockedTokens.Contains)) return false;

        // Catch names such as "f.u.c.k" and "sh1t" without rejecting a benign
        // word that merely contains a blocked token ("class" remains safe).
        var compact = string.Concat(words);
        if (BlockedTokens.Contains(compact) || BlockedPhrases.Contains(compact)) return false;
        return true;
    }

    private static string Normalize(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        var pendingSpace = false;
        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;

            var lower = char.ToLowerInvariant(character);
            var mapped = lower switch
            {
                '@' => 'a',
                '0' => 'o',
                '1' => 'i',
                '3' => 'e',
                '4' => 'a',
                '5' => 's',
                '7' => 't',
                '$' => 's',
                '!' => 'i',
                _ => lower
            };

            if (char.IsLetterOrDigit(mapped))
            {
                if (pendingSpace && builder.Length > 0) builder.Append(' ');
                pendingSpace = false;
                builder.Append(mapped);
            }
            else
            {
                pendingSpace = builder.Length > 0;
            }
        }
        return builder.ToString().Trim();
    }
}
