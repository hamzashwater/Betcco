/** Present request evidence; a failed refresh does not invalidate cached data. */
export function assessmentRequestMessage(
  error: unknown,
  fallback: string,
  t: (key: "dashboard.signIn" | "courseApprovals.accessDenied") => string,
  cached = false,
) {
  const status =
    error instanceof Error && "status" in error ? error.status : undefined;
  if (status === 403) return t("courseApprovals.accessDenied");
  if (status === 401 && !cached) return t("dashboard.signIn");
  return fallback;
}
