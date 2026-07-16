using LessonCue.Server;
using Xunit;

namespace LessonCue.Server.Tests;

public sealed class ControllerSessionServiceTests
{
    [Fact]
    public void Create_returns_restricted_unpredictable_session()
    {
        var service = new ControllerSessionService();
        var classId = Guid.NewGuid();
        var lessonId = Guid.NewGuid();

        var session = service.Create(classId, lessonId, 60);

        Assert.Equal(48, session.Token.Length);
        Assert.Equal(classId, session.ClassId);
        Assert.Equal(lessonId, session.LessonId);
        Assert.InRange(session.ExpiresAt - session.CreatedAt, TimeSpan.FromMinutes(59), TimeSpan.FromMinutes(61));
        Assert.Equal(session, service.Get(session.Token));
    }

    [Theory]
    [InlineData(1, 5)]
    [InlineData(20000, 10080)]
    public void Create_clamps_lifetime(int requestedMinutes, int expectedMinutes)
    {
        var session = new ControllerSessionService().Create(Guid.NewGuid(), null, requestedMinutes);
        Assert.InRange(session.ExpiresAt - session.CreatedAt,
            TimeSpan.FromMinutes(expectedMinutes) - TimeSpan.FromSeconds(1),
            TimeSpan.FromMinutes(expectedMinutes) + TimeSpan.FromSeconds(1));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-token")]
    [InlineData("fffffffffffffffffffffffffffffffffffffffffffffffg")]
    public void Get_rejects_malformed_tokens(string token)
    {
        Assert.Null(new ControllerSessionService().Get(token));
    }

    [Fact]
    public void Universal_grants_are_opaque_and_revocable()
    {
        var service = new ControllerSessionService();
        var grant = service.CreateUniversalGrant();

        Assert.Equal(64, grant.Length);
        Assert.True(service.IsUniversalGrantValid(grant));
        Assert.False(service.IsUniversalGrantValid("not-a-grant"));

        service.RevokeUniversalGrants();
        Assert.False(service.IsUniversalGrantValid(grant));
    }
}
