using System.Text.Json;
using Betcco.Api.Controllers;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.IntegrationTests;

public sealed class RetakesControllerTests
{
    [Fact]
    public void Eligible_returns_empty_after_review_flow_simplification()
    {
        var result = Assert.IsType<OkObjectResult>(new RetakesController().Eligible());
        var values = Assert.IsAssignableFrom<IEnumerable<object>>(result.Value);

        Assert.Empty(values);
    }

    [Fact]
    public void Authorize_rejects_creation_of_new_retakes()
    {
        var result = Assert.IsType<ObjectResult>(
            new RetakesController().Authorize(Guid.NewGuid()));

        Assert.Equal(410, result.StatusCode);
        var body = JsonSerializer.Serialize(result.Value);
        Assert.Contains("BETCCO_REVIEW_FLOW_ONLY", body);
        Assert.Contains("one revision check", body);
    }
}
