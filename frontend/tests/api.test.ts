import { afterEach, describe, expect, it, vi } from "vitest";
import { api, invalidateCsrfToken } from "@/lib/api";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("api", () => {
  afterEach(() => {
    invalidateCsrfToken();
    vi.restoreAllMocks();
  });

  it("refreshes a stale antiforgery token once before retrying an unsafe request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: "expired-token" }))
      .mockResolvedValueOnce(jsonResponse({ title: "Bad Request" }, 400))
      .mockResolvedValueOnce(jsonResponse({ token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ created: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api<{ created: boolean }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: "student@example.test" }),
      }),
    ).resolves.toEqual({ created: true });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("X-CSRF-TOKEN"),
    ).toBe("expired-token");
    expect(
      new Headers(fetchMock.mock.calls[3]?.[1]?.headers).get("X-CSRF-TOKEN"),
    ).toBe("fresh-token");
  });

  it("does not retry normal validation failures", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: "valid-token" }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: "PASSWORD_POLICY",
            title: "One or more validation errors occurred.",
          },
          400,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api("/auth/register", { method: "POST" }),
    ).rejects.toMatchObject({
      status: 400,
      code: "PASSWORD_POLICY",
      message: "One or more validation errors occurred.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
