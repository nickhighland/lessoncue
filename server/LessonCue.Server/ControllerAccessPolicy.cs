using System.Security.Claims;
using System.Net;

namespace LessonCue.Server;

public static class ControllerAccessPolicy
{
    public static bool IsAdministrator(ClaimsPrincipal user) =>
        user.IsInRole("Owner") || user.IsInRole("Administrator");

    public static bool IsLocalHostname(string? hostname)
    {
        if (string.IsNullOrWhiteSpace(hostname)) return false;
        return hostname.TrimEnd('.').EndsWith(".local", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsPrivateNetworkAddress(IPAddress? address)
    {
        if (address is null) return false;
        if (IPAddress.IsLoopback(address) || address.IsIPv6LinkLocal) return true;
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        var bytes = address.GetAddressBytes();
        if (bytes.Length == 4)
            return bytes[0] == 10 ||
                   bytes[0] == 172 && bytes[1] is >= 16 and <= 31 ||
                   bytes[0] == 192 && bytes[1] == 168 ||
                   bytes[0] == 169 && bytes[1] == 254;
        return bytes.Length == 16 && (bytes[0] & 0xfe) == 0xfc;
    }

    public static bool CanUseRoomController(bool requireLocalRoomControllers, ClaimsPrincipal user, string? hostname,
        IPAddress? remoteAddress) =>
        !requireLocalRoomControllers || IsAdministrator(user) ||
        IsLocalHostname(hostname) && IsPrivateNetworkAddress(remoteAddress);
}
