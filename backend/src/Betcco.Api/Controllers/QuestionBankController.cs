using System.Security.Claims;
using Betcco.Application.Quizzes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Betcco.Api.Controllers;

[ApiController]
[Authorize(Policy = "Teacher")]
[Route("api/v1/teacher/question-bank")]
public sealed class QuestionBankController(IQuestionBankService questionBank) : ControllerBase
{
    [HttpGet("courses/{courseId:guid}")]
    public async Task<IActionResult> List(Guid courseId, CancellationToken cancellationToken)
    {
        var questions = await questionBank.ListAsync(UserId, courseId, cancellationToken);
        return questions is null ? NotFound() : Ok(questions);
    }

    [HttpPost]
    public async Task<IActionResult> Create(SaveQuestionBankQuestionCommand command, CancellationToken cancellationToken)
    {
        var id = await questionBank.CreateAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "Provide a valid question for a course you own." }) : Ok(new { id });
    }

    [HttpPut("{questionId:guid}")]
    public async Task<IActionResult> Update(Guid questionId, SaveQuestionBankQuestionCommand command, CancellationToken cancellationToken) => await questionBank.UpdateAsync(UserId, questionId, command, cancellationToken) ? NoContent() : BadRequest(new { message = "The question could not be updated." });

    [HttpDelete("{questionId:guid}")]
    public async Task<IActionResult> Delete(Guid questionId, CancellationToken cancellationToken) => await questionBank.DeleteAsync(UserId, questionId, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("{questionId:guid}/quizzes/{quizId:guid}")]
    public async Task<IActionResult> AddToQuiz(Guid questionId, Guid quizId, CancellationToken cancellationToken)
    {
        var id = await questionBank.AddToQuizAsync(UserId, questionId, quizId, cancellationToken);
        return id is null ? BadRequest(new { message = "Use a question from the same course and a draft quiz you own." }) : Ok(new { id });
    }

    [HttpPost("generate-quiz")]
    public async Task<IActionResult> Generate(GenerateRandomQuizCommand command, CancellationToken cancellationToken)
    {
        var id = await questionBank.GenerateRandomQuizAsync(UserId, command, cancellationToken);
        return id is null ? BadRequest(new { message = "The requested number of matching bank questions is not available." }) : Ok(new { id });
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
