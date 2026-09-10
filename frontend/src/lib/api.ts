export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

let csrfToken: string | undefined;

export function invalidateCsrfToken(): void {
  csrfToken = undefined;
}

type ProblemResponse = {
  code?: string;
  message?: string;
  title?: string;
  detail?: string;
};

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/v1/security/antiforgery", {
    credentials: "include",
  });
  if (!response.ok)
    throw new ApiError(
      response.status,
      "Unable to initialize request security.",
    );
  const body = (await response.json()) as { token: string };
  csrfToken = body.token;
  return csrfToken;
}

async function isStaleCsrfResponse(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  const body = (await response
    .clone()
    .json()
    .catch(() => undefined)) as ProblemResponse | undefined;

  // ASP.NET Core returns this generic problem response before an action runs
  // when the antiforgery token belongs to an earlier server session.
  return body?.title === "Bad Request" && !body.message && !body.detail;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const requiresCsrf = !["GET", "HEAD", "OPTIONS"].includes(method);
  const send = async () => {
    const headers = new Headers(options.headers);
    if (requiresCsrf) headers.set("X-CSRF-TOKEN", await ensureCsrf());
    if (options.body && !(options.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    return fetch(`/api/v1${path}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  };

  let response = await send();
  if (requiresCsrf && (await isStaleCsrfResponse(response))) {
    invalidateCsrfToken();
    response = await send();
  }

  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({ message: "Request failed." }))) as ProblemResponse;
    throw new ApiError(
      response.status,
      body.message ?? body.detail ?? body.title ?? "Request failed.",
      body.code,
    );
  }
  return response.json() as Promise<T>;
}
