namespace Betcco.Domain.Evaluations;

/// <summary>Provenance of academic identity. Existing unverified rows remain Unknown.</summary>
public enum AcademicSource
{
    Unknown = 0,
    AdminCustom = 1,
    PearsonOfficial = 2
}
