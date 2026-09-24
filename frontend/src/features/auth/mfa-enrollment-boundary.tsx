"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

type CurrentUser = { requiresMfaEnrollment: boolean };

// These route segments contain authenticated workspaces. Public content and
// catalogue routes stay available while a staff member enrolls an authenticator.
const workspaceSegments = new Set([
  "admin",
  "student",
  "teacher",
  "support",
  "staff",
]);

function isWorkspacePath(pathname: string, locale: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments[0] === locale && workspaceSegments.has(segments[1] ?? "");
}

export function MfaEnrollmentBoundary({
  children,
  navigation,
}: {
  children: React.ReactNode;
  navigation: React.ReactNode;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const securityPath = `/${locale}/staff/security`;
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const enrolling = user.data?.requiresMfaEnrollment === true;
  const workspace = isWorkspacePath(pathname, locale);
  const shouldRedirect =
    enrolling && workspace && pathname.replace(/\/$/, "") !== securityPath;

  useEffect(() => {
    if (shouldRedirect) router.replace(securityPath);
  }, [shouldRedirect, router, securityPath]);

  if (shouldRedirect) {
    return (
      <main id="main-content" className="shell flex-1 py-10" aria-busy="true">
        <p>
          {locale === "ar"
            ? "جارٍ فتح إعداد المصادقة الثنائية…"
            : "Opening multi-factor setup…"}
        </p>
        <Link
          className="focus-ring mt-3 inline-block text-primary underline"
          href={securityPath}
        >
          {locale === "ar" ? "افتح أمان الحساب" : "Open account security"}
        </Link>
      </main>
    );
  }

  return (
    <>
      {(!enrolling || !workspace) && navigation}
      {children}
    </>
  );
}
