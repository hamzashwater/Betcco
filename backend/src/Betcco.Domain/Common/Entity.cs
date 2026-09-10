namespace Betcco.Domain.Common;

public abstract class Entity
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string? CreatedByUserId { get; set; }
    public string? UpdatedByUserId { get; set; }
    public bool IsDeleted { get; set; }
    public byte[]? RowVersion { get; set; }
}
