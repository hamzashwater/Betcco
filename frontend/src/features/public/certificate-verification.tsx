"use client";

import { formatLocalizedDate } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, FileBadge } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function CertificateVerification({
  locale,
  verificationCode,
}: {
  locale: string;
  verificationCode: string;
}) {
  const copy = useTranslations("publicTrust.certificate");
  const certificate = useQuery({
    queryKey: ["certificate-verification", verificationCode, locale],
    queryFn: () =>
      api<{
        studentName: string;
        courseTitle: string;
        issuedAtUtc: string;
        verificationCode: string;
      }>(
        `/student-tools/certificates/${encodeURIComponent(verificationCode)}?locale=${locale}`,
      ),
  });
  return (
    <section className="shell py-12">
      <div className="mx-auto max-w-2xl card p-6 text-center sm:p-10">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <BadgeCheck size={30} aria-hidden="true" />
        </div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-primary">
          BETCCO
        </p>
        <h1 className="mt-2 text-3xl font-black">
          {copy("certificateVerification")}
        </h1>
        {certificate.isPending ? (
          <p className="mt-6 text-muted" aria-busy>
            …
          </p>
        ) : certificate.data ? (
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-5 text-start">
            <p className="font-black text-primary">
              {copy("certificateVerified")}
            </p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="block text-xs text-muted">
                  {copy("learner")}
                </span>
                <strong>{certificate.data.studentName}</strong>
              </p>
              <p>
                <span className="block text-xs text-muted">
                  {copy("course")}
                </span>
                <strong>{certificate.data.courseTitle}</strong>
              </p>
              <p>
                <span className="block text-xs text-muted">
                  {copy("issued")}
                </span>
                <strong>
                  {formatLocalizedDate(certificate.data.issuedAtUtc, locale, {
                    dateStyle: "long",
                  })}
                </strong>
              </p>
              <p>
                <span className="block text-xs text-muted">
                  {copy("verificationId")}
                </span>
                <strong dir="ltr" className="break-all font-mono text-xs">
                  {certificate.data.verificationCode}
                </strong>
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/5 p-5 text-red-400">
            <FileBadge className="mx-auto" aria-hidden="true" />
            <p className="mt-3 font-black">
              {copy("noValidCertificateWasFoundForThisCode")}
            </p>
          </div>
        )}
        <p className="mt-7 text-xs leading-5 text-muted">
          {copy("thisIsABetccoCompletionCertificateNotA")}
        </p>
        <Link
          href={`/${locale}`}
          className="focus-ring mt-6 inline-block rounded-xl border border-primary/40 px-4 py-2.5 text-sm font-bold text-primary"
        >
          {copy("backToBetcco")}
        </Link>
      </div>
    </section>
  );
}
