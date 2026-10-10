import { AdminArea } from "@/features/admin/admin-area";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import baseline from "./fixtures/admin-a5-5-10-15-copy-baseline.json";
import { mount, deferred } from "./helpers/admin-governance-gradebook-render";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
const status = {
  provider: "RAW Provider",
  isConfigured: true,
  isReachable: false,
  message: "RAW <provider message>",
};
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue(status);
});
for (const locale of ["ar", "en"] as const) {
  const copy = (en: string) =>
    baseline.scopes.schoolIntegrations.cases.find((c) => c.en === en)![locale];
  async function ready() {
    const result = mount(locale, <AdminArea segment={["integrations"]} />);
    await screen.findByText(status.message);
    return result;
  }
  describe(`School integration translation contracts ${locale}`, () => {
    it.each([
      [false, false, "Disabled"],
      [true, false, "Configured"],
      [true, true, "Connected"],
      [false, true, "Connected"],
    ] as const)(
      "keeps reachable/configured precedence %s/%s",
      async (isConfigured, isReachable, label) => {
        apiMock.mockResolvedValue({ ...status, isConfigured, isReachable });
        await ready();
        expect(screen.getByText(copy(label))).toBeVisible();
        const button = screen.getByRole("button", {
          name: copy("Test connection"),
        });
        if (isConfigured) expect(button).toBeEnabled();
        else expect(button).toBeDisabled();
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/integrations/school/status",
        );
        expect(apiMock).toHaveBeenCalledTimes(1);
      },
    );
    it("preserves raw provider/messages including nullish versus empty semantics", async () => {
      const { client } = await ready();
      expect(
        screen.getByRole("heading", { name: status.provider }),
      ).toBeVisible();
      expect(screen.getByText(status.message)).toBeVisible();
      apiMock.mockResolvedValue({ ...status, provider: "", message: "" });
      await client.refetchQueries();
      await waitFor(() =>
        expect(screen.queryByText(status.message)).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByText(copy("Loading integration status…")),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "OneRoster" }),
      ).not.toBeInTheDocument();
      apiMock.mockResolvedValue({ ...status, provider: null, message: null });
      await client.refetchQueries();
      expect(
        await screen.findByRole("heading", { name: "OneRoster" }),
      ).toBeVisible();
      expect(
        screen.getByText(copy("Loading integration status…")),
      ).toBeVisible();
    });
    it("keeps the initial nullish fallback and disables unconfigured/pending tests", async () => {
      const load = deferred();
      apiMock.mockReturnValue(load.promise);
      mount(locale, <AdminArea segment={["integrations"]} />);
      expect(
        screen.getByText(copy("Loading integration status…")),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: copy("Test connection") }),
      ).toBeDisabled();
      load.resolve(status);
      await screen.findByText(status.message);
      const test = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method ? test.promise : Promise.resolve(status),
      );
      await userEvent.click(
        screen.getByRole("button", { name: copy("Test connection") }),
      );
      expect(
        screen.getByRole("button", { name: copy("Test connection") }),
      ).toBeDisabled();
      test.resolve({ ...status, isReachable: true });
      expect(await screen.findByText(copy("Connected"))).toBeVisible();
    });
    it("posts a bodyless explicit connection test, prefers its result and never imports", async () => {
      const { invalidations } = await ready();
      const response = {
        provider: "RAW TEST PROVIDER",
        isConfigured: false,
        isReachable: true,
        message: "RAW TEST MESSAGE",
      };
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        Promise.resolve(o?.method ? response : status),
      );
      await userEvent.click(
        screen.getByRole("button", { name: copy("Test connection") }),
      );
      expect(await screen.findByText(response.message)).toBeVisible();
      expect(
        screen.getByRole("heading", { name: response.provider }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: copy("Test connection") }),
      ).toBeDisabled();
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/integrations/school/test-connection",
        { method: "POST" },
      );
      expect(
        apiMock.mock.calls.filter(
          ([p]) => p === "/admin/integrations/school/status",
        ),
      ).toHaveLength(1);
      expect(invalidations).not.toHaveBeenCalled();
      expect(
        apiMock.mock.calls.some(([p]) =>
          /import|roster|students/.test(String(p)),
        ),
      ).toBe(false);
    });
    it.each([new Error("RAW CONNECTION ERROR"), "non-Error"])(
      "preserves raw Error or localized fallback (%s)",
      async (error) => {
        await ready();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method ? Promise.reject(error) : Promise.resolve(status),
        );
        await userEvent.click(
          screen.getByRole("button", { name: copy("Test connection") }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          error instanceof Error ? error.message : copy("Request failed."),
        );
        expect(screen.getByText(status.message)).toBeVisible();
      },
    );
  });
}
