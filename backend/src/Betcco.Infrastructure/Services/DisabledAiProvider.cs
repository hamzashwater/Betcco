using Betcco.Application.Common;

namespace Betcco.Infrastructure.Services;

public sealed class DisabledAiProvider : IAiProvider
{
    public bool IsConfigured => false;

    public Task<AiCompletion> CompleteAsync(AiPrompt prompt, CancellationToken cancellationToken = default)
    {
        throw new InvalidOperationException("AI Tutor is not configured. Set Ai__Enabled, Ai__Provider, Ai__ApiKey, and Ai__Model.");
    }
}
