const WEBKIT_IPHONE_PROJECT = "webkit-iphone-14";
const UAT_ORIGIN = "http://localhost:3000";
const ACCESS_CONTROL_MESSAGE =
  /^\/localhost:3000(\/\S+) due to access control checks\.$/;

export function isKnownWebKitUatAccessControlNoise(
  projectName: string,
  message: string,
  baseUrl: string,
): boolean {
  if (projectName !== WEBKIT_IPHONE_PROJECT) return false;
  const uatBase = new URL(baseUrl);
  if (
    uatBase.hostname !== "localhost" ||
    uatBase.port !== "3000" ||
    (uatBase.protocol !== "http:" && uatBase.protocol !== "https:")
  )
    return false;

  const match = ACCESS_CONTROL_MESSAGE.exec(message);
  if (!match) return false;

  const resource = new URL(match[1], UAT_ORIGIN);
  if (resource.origin !== UAT_ORIGIN) return false;
  const isPublicRsc =
    /^\/(?:en|ar)(?:\/|$)/.test(resource.pathname) &&
    Boolean(resource.searchParams.get("_rsc"));
  const isObservedPublicApi =
    resource.pathname === "/api/v1/catalog/courses" ||
    resource.pathname === "/api/v1/taxonomy";

  return isPublicRsc || isObservedPublicApi;
}

export function isSameOriginServerError(
  responseUrl: string,
  status: number,
  baseUrl: string,
): boolean {
  return (
    status >= 500 &&
    status < 600 &&
    new URL(responseUrl).origin === new URL(baseUrl).origin
  );
}
