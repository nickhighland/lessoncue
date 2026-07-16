namespace LessonCue.Server;

public static class AdminCredentialPolicy
{
    public static string? ValidateUsername(string username)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Trim().Length < 3)
            return "Username must be at least three characters.";
        if (username.Trim().Length > 80)
            return "Username cannot exceed 80 characters.";
        return null;
    }

    public static string? Validate(string username, string password)
    {
        var usernameError = ValidateUsername(username);
        if (usernameError is not null) return usernameError;
        if (password.Length < 10)
            return "Password must be at least ten characters.";
        if (!password.Any(char.IsUpper) || !password.Any(char.IsLower) || !password.Any(char.IsDigit))
            return "Password must contain uppercase, lowercase, and numeric characters.";
        return null;
    }
}
