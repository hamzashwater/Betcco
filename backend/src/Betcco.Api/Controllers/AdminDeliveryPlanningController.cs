using System.Security.Claims;
using Betcco.Application.Evaluations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "SystemAdmin")]
[Route("api/v1/admin/delivery-planning")]
public sealed class AdminDeliveryPlanningController(IDeliveryPlanningService planning) : ControllerBase
{
    [HttpGet("academic-years")]
    public Task<PagedDeliveryPlanningResult<AcademicYearView>> AcademicYears([FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken cancellationToken = default) =>
        planning.ListAcademicYearsAsync(page, pageSize, cancellationToken);

    [HttpGet("academic-years/{id:guid}")]
    public Task<ActionResult<AcademicYearView>> AcademicYear(Guid id, CancellationToken cancellationToken) => Execute(() => planning.GetAcademicYearAsync(id, cancellationToken));

    [HttpPost("academic-years")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<AcademicYearView>> CreateAcademicYear(SaveAcademicYearCommand command, CancellationToken cancellationToken) =>
        Execute(() => planning.CreateAcademicYearAsync(command, UserId, cancellationToken), created: true);

    [HttpPut("academic-years/{id:guid}")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<AcademicYearView>> UpdateAcademicYear(Guid id, SaveAcademicYearCommand command, CancellationToken cancellationToken) =>
        Execute(() => planning.UpdateAcademicYearAsync(id, command, UserId, cancellationToken));

    [HttpGet("academic-years/{academicYearId:guid}/terms")]
    public Task<ActionResult<PagedDeliveryPlanningResult<AcademicTermView>>> Terms(Guid academicYearId, [FromQuery] int page = 1, [FromQuery] int pageSize = 100, CancellationToken cancellationToken = default) =>
        Execute(() => planning.ListTermsAsync(academicYearId, page, pageSize, cancellationToken));

    [HttpPost("terms")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<AcademicTermView>> CreateTerm(SaveAcademicTermCommand command, CancellationToken cancellationToken) =>
        Execute(() => planning.CreateTermAsync(command, UserId, cancellationToken), created: true);

    [HttpPut("terms/{id:guid}")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<AcademicTermView>> UpdateTerm(Guid id, SaveAcademicTermCommand command, CancellationToken cancellationToken) =>
        Execute(() => planning.UpdateTermAsync(id, command, UserId, cancellationToken));

    [HttpGet("qualification-versions")]
    public Task<PagedDeliveryPlanningResult<DeliveryPlanningQualificationVersionView>> QualificationVersions([FromQuery] int page = 1, [FromQuery] int pageSize = 100, CancellationToken cancellationToken = default) =>
        planning.ListQualificationVersionsAsync(page, pageSize, cancellationToken);

    [HttpGet("qualification-versions/{id:guid}/units")]
    public Task<ActionResult<PagedDeliveryPlanningResult<DeliveryPlanningUnitView>>> Units(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 100, CancellationToken cancellationToken = default) =>
        Execute(() => planning.ListUnitsAsync(id, page, pageSize, cancellationToken));

    [HttpGet("plans")]
    public Task<PagedDeliveryPlanningResult<DeliveryPlanSummaryView>> Plans([FromQuery] Guid? academicYearId = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken cancellationToken = default) =>
        planning.ListPlansAsync(academicYearId, page, pageSize, cancellationToken);

    [HttpGet("plans/{id:guid}")]
    public Task<ActionResult<DeliveryPlanView>> Plan(Guid id, CancellationToken cancellationToken) => Execute(() => planning.GetPlanAsync(id, cancellationToken));

    [HttpPost("plans")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<DeliveryPlanView>> CreatePlan(CreateDeliveryPlanCommand command, CancellationToken cancellationToken) =>
        Execute(() => planning.CreatePlanAsync(command, UserId, cancellationToken), created: true);

    [HttpPut("plans/{id:guid}")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<DeliveryPlanView>> UpdatePlan(Guid id, UpdateDeliveryPlanCommand command, CancellationToken cancellationToken) =>
        Execute(() => planning.UpdatePlanAsync(id, command, UserId, cancellationToken));

    [HttpPost("plans/{id:guid}/entries")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<DeliveryPlanView>> AddEntry(Guid id, AddDeliveryPlanEntryCommand command, CancellationToken cancellationToken) =>
        Execute(() => planning.AddEntryAsync(id, command, UserId, cancellationToken), created: true);

    [HttpPut("entries/{id:guid}")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<DeliveryPlanView>> UpdateEntry(Guid id, UpdateDeliveryPlanEntryCommand command, CancellationToken cancellationToken) =>
        Execute(() => planning.UpdateEntryAsync(id, command, UserId, cancellationToken));

    [HttpPut("plans/{id:guid}/entry-order")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<DeliveryPlanView>> Reorder(Guid id, ReorderDeliveryPlanEntriesCommand command, CancellationToken cancellationToken) =>
        Execute(() => planning.ReorderEntriesAsync(id, command, UserId, cancellationToken));

    [HttpDelete("entries/{id:guid}")]
    [EnableRateLimiting("write")]
    public Task<ActionResult<DeliveryPlanView>> RemoveEntry(Guid id, CancellationToken cancellationToken) =>
        Execute(() => planning.RemoveEntryAsync(id, UserId, cancellationToken));

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private async Task<ActionResult<T>> Execute<T>(Func<Task<T>> action, bool created = false)
    {
        try
        {
            var result = await action();
            return created ? StatusCode(StatusCodes.Status201Created, result) : Ok(result);
        }
        catch (DeliveryPlanningException exception)
        {
            var problem = new ProblemDetails
            {
                Status = exception.NotFound ? StatusCodes.Status404NotFound : StatusCodes.Status400BadRequest,
                Title = exception.NotFound ? "Delivery planning record not found" : "Delivery planning validation failed",
                Detail = exception.Code
            };
            problem.Extensions["code"] = exception.Code;
            return exception.NotFound ? NotFound(problem) : BadRequest(problem);
        }
    }
}
