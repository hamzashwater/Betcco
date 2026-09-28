[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $CertificatePath
)

$ErrorActionPreference = 'Stop'
$password = [Environment]::GetEnvironmentVariable('BETCCO_DATA_PROTECTION_CERT_PASSWORD')
if ([string]::IsNullOrWhiteSpace($password)) {
    throw 'BETCCO_DATA_PROTECTION_CERT_PASSWORD must be supplied by the approved secret mechanism.'
}

$certificate = $null
try {
    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
        (Resolve-Path -LiteralPath $CertificatePath).Path,
        $password,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
    )
    $sha256 = [System.Security.Cryptography.SHA256]::HashData($certificate.RawData)
    [pscustomobject]@{
        Sha256Fingerprint = [Convert]::ToHexString($sha256)
        Thumbprint = $certificate.Thumbprint
        Subject = $certificate.Subject
        NotBeforeUtc = $certificate.NotBefore.ToUniversalTime().ToString('O')
        NotAfterUtc = $certificate.NotAfter.ToUniversalTime().ToString('O')
        PrivateKeyAvailable = if ($certificate.HasPrivateKey) { 'YES' } else { 'NO' }
    }
}
finally {
    if ($null -ne $certificate) {
        $certificate.Dispose()
    }
    [Environment]::SetEnvironmentVariable('BETCCO_DATA_PROTECTION_CERT_PASSWORD', $null, 'Process')
    $password = $null
}
