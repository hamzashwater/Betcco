import { CertificateVerification } from "@/features/public/certificate-verification";

export default async function CertificateVerificationPage({
  params,
}: {
  params: Promise<{ locale: string; verificationCode: string }>;
}) {
  const { locale, verificationCode } = await params;
  return (
    <CertificateVerification
      locale={locale}
      verificationCode={verificationCode}
    />
  );
}
