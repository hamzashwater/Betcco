using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.Api;

public sealed class BetccoExceptionHandler(ILogger<BetccoExceptionHandler> logger, IProblemDetailsService problemDetails, IHostEnvironment environment) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        logger.LogError(exception, "Unhandled request failure. TraceId: {TraceId}", context.TraceIdentifier);
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new ProblemDetails { Status = 500, Title = "Unexpected server error", Detail = environment.IsDevelopment() ? exception.Message : "The request could not be completed.", Extensions = { ["traceId"] = context.TraceIdentifier } },
            Exception = exception
        });
    }
}
