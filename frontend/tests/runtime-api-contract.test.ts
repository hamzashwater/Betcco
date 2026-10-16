import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, invalidateCsrfToken } from "@/lib/api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const token = (value = "csrf-token") => json({ token: value });
const mockFetch = () => {
  const mock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", mock);
  return mock;
};
afterEach(() => {
  invalidateCsrfToken();
  vi.unstubAllGlobals();
});

describe("unchanged locale-independent API transport contract", () => {
  it.each(["GET", "HEAD", "OPTIONS", "get"])(
    "%s is safe and keeps URL, credentials and cache",
    async (method) => {
      const fetch = mockFetch().mockResolvedValue(
        new Response(null, { status: 204 }),
      );
      await expect(api("/contract", { method })).resolves.toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/contract",
        expect.objectContaining({
          method,
          credentials: "include",
          cache: "no-store",
        }),
      );
      expect(
        new Headers(fetch.mock.calls[0][1]?.headers).has("X-CSRF-TOKEN"),
      ).toBe(false);
    },
  );

  it("defaults to GET without CSRF and returns parsed successful data", async () => {
    const fetch = mockFetch().mockResolvedValue(
      json({ value: "raw server data" }),
    );
    await expect(api("/contract")).resolves.toEqual({
      value: "raw server data",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/contract");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "post"])(
    "%s initializes antiforgery and sets exact JSON headers",
    async (method) => {
      const fetch = mockFetch()
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(json({ ok: true }));
      const body = JSON.stringify({ raw: "payload" });
      await api("/contract", {
        method,
        body,
        headers: { "X-Custom": "retained" },
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0]).toEqual([
        "/api/v1/security/antiforgery",
        { credentials: "include" },
      ]);
      expect(fetch.mock.calls[1][0]).toBe("/api/v1/contract");
      expect(fetch.mock.calls[1][1]).toMatchObject({
        method,
        body,
        credentials: "include",
        cache: "no-store",
      });
      const headers = new Headers(fetch.mock.calls[1][1]?.headers);
      expect(headers.get("X-CSRF-TOKEN")).toBe("csrf-token");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(headers.get("X-Custom")).toBe("retained");
    },
  );

  it("caches CSRF across unsafe calls and explicit invalidation requests a fresh token", async () => {
    const fetch = mockFetch()
      .mockResolvedValueOnce(token("first"))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(token("second"))
      .mockResolvedValueOnce(json({}));
    await api("/one", { method: "POST" });
    await api("/two", { method: "DELETE" });
    invalidateCsrfToken();
    await api("/three", { method: "PATCH" });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(
      fetch.mock.calls.filter(
        ([path]) => path === "/api/v1/security/antiforgery",
      ),
    ).toHaveLength(2);
    expect(
      [1, 2, 4].map((index) =>
        new Headers(fetch.mock.calls[index][1]?.headers).get("X-CSRF-TOKEN"),
      ),
    ).toEqual(["first", "first", "second"]);
  });

  it("exempts FormData from JSON content type and preserves the exact body", async () => {
    const fetch = mockFetch()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const body = new FormData();
    body.set("file", new File(["answer"], "answer.pdf"));
    await expect(
      api("/files", { method: "POST", body }),
    ).resolves.toBeUndefined();
    expect(fetch.mock.calls[1][1]?.body).toBe(body);
    const headers = new Headers(fetch.mock.calls[1][1]?.headers);
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("X-CSRF-TOKEN")).toBe("csrf-token");
  });

  it("does not set JSON content type for an absent body", async () => {
    const fetch = mockFetch()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({}));
    await api("/empty", { method: "POST" });
    expect(
      new Headers(fetch.mock.calls[1][1]?.headers).has("Content-Type"),
    ).toBe(false);
  });

  it("pins the security initialization runtime fallback and aborts the intended request", async () => {
    const fetch = mockFetch().mockResolvedValueOnce(
      json({ message: "Server security detail", code: "PRIVATE" }, 503),
    );
    await expect(api("/protected", { method: "POST" })).rejects.toMatchObject({
      status: 503,
      message: "Unable to initialize request security.",
      code: undefined,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/security/antiforgery");
  });

  it("invalidates stale CSRF and retries exactly once even if the second response is stale", async () => {
    const fetch = mockFetch()
      .mockResolvedValueOnce(token("old"))
      .mockResolvedValueOnce(json({ title: "Bad Request" }, 400))
      .mockResolvedValueOnce(token("fresh"))
      .mockResolvedValueOnce(json({ title: "Bad Request" }, 400));
    await expect(api("/protected", { method: "POST" })).rejects.toMatchObject({
      status: 400,
      message: "Bad Request",
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(
      new Headers(fetch.mock.calls[1][1]?.headers).get("X-CSRF-TOKEN"),
    ).toBe("old");
    expect(
      new Headers(fetch.mock.calls[3][1]?.headers).get("X-CSRF-TOKEN"),
    ).toBe("fresh");
  });

  it.each([
    [403, { title: "Bad Request" }],
    [400, { title: "bad request" }],
    [400, { title: "Bad Request", message: "Validation failure" }],
    [400, { title: "Bad Request", detail: "Validation detail" }],
    [400, {}],
  ])("does not retry non-stale response %s %j", async (status, body) => {
    const fetch = mockFetch()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(body, status));
    await expect(api("/protected", { method: "POST" })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry safe requests with the generic stale-token response", async () => {
    const fetch = mockFetch().mockResolvedValue(
      json({ title: "Bad Request" }, 400),
    );
    await expect(api("/safe")).rejects.toMatchObject({
      status: 400,
      message: "Bad Request",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      {
        message: "Raw server message",
        detail: "Other detail",
        title: "Other title",
        code: "CODE",
      },
      "Raw server message",
    ],
    [
      {
        message: null,
        detail: "Raw server detail",
        title: "Other title",
        code: "CODE",
      },
      "Raw server detail",
    ],
    [
      { detail: null, title: "Raw server title", code: "CODE" },
      "Raw server title",
    ],
    [{ message: "", detail: "Do not replace empty message", code: "CODE" }, ""],
    [{ message: "رسالة الخادم الخام", code: "CODE" }, "رسالة الخادم الخام"],
    [{ code: "CODE" }, "Request failed."],
  ])(
    "preserves nullish message/detail/title/final precedence %j",
    async (body, expected) => {
      mockFetch().mockResolvedValue(json(body, 422));
      await expect(api("/error")).rejects.toMatchObject({
        status: 422,
        code: "CODE",
        message: expected,
      });
    },
  );

  it("pins the JSON-parse runtime fallback without losing HTTP status", async () => {
    mockFetch().mockResolvedValue(new Response("not-json", { status: 502 }));
    await expect(api("/error")).rejects.toMatchObject({
      status: 502,
      code: undefined,
      message: "Request failed.",
    });
  });

  it("keeps ApiError as raw Error data with status, code and unchanged message", () => {
    const error = new ApiError(409, "Raw transport data", "SERVER_CODE");
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      status: 409,
      code: "SERVER_CODE",
      message: "Raw transport data",
    });
  });
});
