using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Betcco.Application.Common;
using Microsoft.Extensions.Configuration;

namespace Betcco.Infrastructure.Services;

/// <summary>Server-side OpenAI Responses API adapter. It sends only the bounded course context assembled by the API.</summary>
public sealed class OpenAiResponsesAiProvider(HttpClient client, IConfiguration configuration) : IAiProvider
{
    private readonly string? _apiKey = configuration["Ai:ApiKey"];
    private readonly string? _model = configuration["Ai:Model"];
    public bool IsConfigured => bool.TryParse(configuration["Ai:Enabled"], out var enabled)
        && enabled
        && string.Equals(configuration["Ai:Provider"], "OpenAI", StringComparison.OrdinalIgnoreCase)
        && !string.IsNullOrWhiteSpace(_apiKey)
        && !string.IsNullOrWhiteSpace(_model);

    public async Task<AiCompletion> CompleteAsync(AiPrompt prompt, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured) throw new InvalidOperationException("AI Tutor is not configured.");
        using var request = new HttpRequestMessage(HttpMethod.Post, "responses");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
        request.Content = JsonContent.Create(new
        {
            model = _model,
            store = false,
            max_output_tokens = 800,
            instructions = "You are BETCCO's educational tutor. Answer only from the supplied course context. Be supportive, explain rather than complete assessed work, state when the context does not establish an answer, and never claim Pearson or BTEC accreditation. Cite the source labels you used at the end of the answer.",
            input = BuildInput(prompt)
        });
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException("The configured AI provider could not complete the request.");
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(cancellationToken));
        var text = payload.RootElement.TryGetProperty("output_text", out var output) ? output.GetString() : null;
        if (string.IsNullOrWhiteSpace(text)) throw new InvalidOperationException("The AI provider returned no usable text.");
        return new AiCompletion(
            text.Trim(),
            prompt.Sources.Select(source => source.Split('\n', 2)[0]).ToArray());
    }

    private static string BuildInput(AiPrompt prompt)
    {
        var context = prompt.Sources.Count == 0 ? "No approved course context is available." : string.Join("\n\n", prompt.Sources);
        return $"Mode: {prompt.Mode}\nStudent question: {prompt.Message}\n\nApproved course context:\n{context}";
    }
}
