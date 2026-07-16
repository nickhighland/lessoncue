namespace LessonCue.Server;

public static class AdminCredentialPolicy
{
    public static string? Validate(string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Trim().Length < 3)
            return "Username must be at least three characters.";
        if (password.Length < 10)
            return "Password must be at least ten characters.";
        if (!password.Any(char.IsUpper) || !password.Any(char.IsLower) || !password.Any(char.IsDigit))
            return "Password must contain uppercase, lowercase, and numeric characters.";
        return null;
    }
}
