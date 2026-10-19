import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminArea } from "@/features/admin/admin-area";
import { ApiError, invalidateCsrfToken } from "@/lib/api";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import dashboard from "./fixtures/admin-dashboard.json";
import {
  courseApprovals,
  courseDetail,
} from "./fixtures/admin-evaluations-approvals";

const fetchMock = vi.fn();
const clients: QueryClient[] = [];
type View = "dashboard" | "approvals";
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
  invalidateCsrfToken();
});
const response = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function mount(locale: "en" | "ar", view: View) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  clients.push(client);
  const result = render(
    <div dir={locale === "ar" ? "rtl" : "ltr"}>
      <QueryClientProvider client={client}>
        <NextIntlClientProvider
          locale={locale}
          messages={locale === "ar" ? ar : en}
        >
          <AdminArea
            segment={view === "dashboard" ? [] : ["course-approvals"]}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>
    </div>,
  );
  return { ...result, client };
}

describe.each(["en", "ar"] as const)(
  "actual Admin API/query-state contract in %s",
  (locale) => {
    const copy = (locale === "ar" ? ar : en).adminWorkspace;
    for (const view of ["dashboard", "approvals"] as const) {
      const key = view === "dashboard" ? ["admin-dashboard"] : ["approvals"];
      const signIn =
        view === "dashboard"
          ? copy.dashboard.signIn
          : copy.courseApprovals.signIn;
      const failure =
        view === "dashboard"
          ? copy.dashboard.requestError
          : copy.courseApprovals.requestError;
      const success = view === "dashboard" ? dashboard : courseApprovals;

      it(`${view}: initial loading is busy, never sign-in/denial/zero data`, async () => {
        let resolve!: (value: Response) => void;
        fetchMock.mockReturnValue(
          new Promise<Response>((yes) => {
            resolve = yes;
          }),
        );
        mount(locale, view);
        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
        expect(screen.queryByText(signIn)).not.toBeInTheDocument();
        expect(
          screen.queryByText(copy.courseApprovals.accessDenied),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
        await act(async () => resolve(response(200, success)));
        expect(
          await screen.findByRole("heading", {
            name:
              view === "dashboard"
                ? copy.dashboard.title
                : copy.courseApprovals.title,
          }),
        ).toBeVisible();
      });

      it.each(["401", "403", "500", "404", "network", "timeout", "unknown"])(
        `${view}: maps %s only through the real ApiError status`,
        async (scenario) => {
          if (scenario === "network")
            fetchMock.mockRejectedValue(new TypeError("Network failure"));
          else if (scenario === "timeout")
            fetchMock.mockRejectedValue(
              new DOMException("Timed out", "AbortError"),
            );
          else if (scenario === "unknown")
            fetchMock.mockRejectedValue(
              Object.assign(new Error("401 Sign in. Access denied."), {
                status: 401,
              }),
            );
          else
            fetchMock.mockResolvedValue(
              response(Number(scenario), {
                message: "Raw error mentioning 401 Sign in Access denied",
                code: "RAW",
              }),
            );
          const { client } = mount(locale, view);
          const expected =
            scenario === "401"
              ? signIn
              : scenario === "403"
                ? copy.courseApprovals.accessDenied
                : failure;
          expect(await screen.findByText(expected)).toBeVisible();
          if (scenario !== "401")
            expect(screen.queryByText(signIn)).not.toBeInTheDocument();
          if (scenario !== "403")
            expect(
              screen.queryByText(copy.courseApprovals.accessDenied),
            ).not.toBeInTheDocument();
          if (!["401", "403"].includes(scenario))
            expect(screen.getByRole("alert")).toHaveTextContent(failure);
          const error = client
            .getQueryCache()
            .find({ queryKey: key, exact: false })?.state.error;
          if (/^\d+$/.test(scenario)) {
            expect(error).toBeInstanceOf(ApiError);
            expect(error).toMatchObject({
              status: Number(scenario),
              code: "RAW",
            });
          } else expect(error).not.toBeInstanceOf(ApiError);
          expect(
            fetchMock.mock.calls.every(
              ([, options]) => options.method === undefined,
            ),
          ).toBe(true);
        },
      );

      it.each([401, 403, 503])(
        `${view}: retains usable cached data, selections, actions and destinations after HTTP %s`,
        async (status) => {
          let fail = false;
          fetchMock.mockImplementation((url: string) => {
            if (url.includes("/admin/courses/course-"))
              return Promise.resolve(
                response(200, courseDetail(url.split("/").at(-1))),
              );
            return Promise.resolve(
              fail
                ? response(status, { message: "Raw refresh error" })
                : response(200, success),
            );
          });
          const { client, container } = mount(locale, view);
          await screen.findByRole("heading", {
            name:
              view === "dashboard"
                ? copy.dashboard.title
                : copy.courseApprovals.title,
          });
          if (view === "approvals") {
            fireEvent.change(
              screen.getAllByPlaceholderText(
                copy.courseApprovals.reasonPlaceholder,
              )[0],
              { target: { value: "Raw reason — سبب خامّ" } },
            );
            fireEvent.click(
              screen.getAllByRole("button", {
                name: copy.courseApprovals.reviewContent,
              })[0],
            );
            await screen.findByText(
              locale === "ar"
                ? courseDetail().arabicDescription
                : courseDetail().englishDescription,
            );
          }
          const beforeText = container.textContent;
          const links = [...container.querySelectorAll("a")].map((link) =>
            link.getAttribute("href"),
          );
          const actions = [...container.querySelectorAll("button")].map(
            (button) => ({
              text: button.textContent,
              disabled: button.disabled,
              pressed: button.getAttribute("aria-pressed"),
            }),
          );
          fail = true;
          await act(async () => {
            await client.refetchQueries({ queryKey: key });
          });
          const expected =
            status === 403 ? copy.courseApprovals.accessDenied : failure;
          expect(await screen.findByText(expected)).toBeVisible();
          expect(screen.queryByText(signIn)).not.toBeInTheDocument();
          expect(container.textContent?.replace(expected, "")).toBe(beforeText);
          expect(
            [...container.querySelectorAll("a")].map((link) =>
              link.getAttribute("href"),
            ),
          ).toEqual(links);
          expect(
            [...container.querySelectorAll("button")].map((button) => ({
              text: button.textContent,
              disabled: button.disabled,
              pressed: button.getAttribute("aria-pressed"),
            })),
          ).toEqual(actions);
          expect(
            client.getQueryCache().find({ queryKey: key, exact: false })?.state,
          ).toMatchObject({ status: "error", data: success });
          if (view === "approvals")
            expect(
              screen.getAllByPlaceholderText(
                copy.courseApprovals.reasonPlaceholder,
              )[0],
            ).toHaveValue("Raw reason — سبب خامّ");
          expect(
            fetchMock.mock.calls.every(
              ([, options]) => options.method === undefined,
            ),
          ).toBe(true);
        },
      );
    }

    it("shows successful empty approvals without denial", async () => {
      fetchMock.mockResolvedValue(response(200, []));
      mount(locale, "approvals");
      expect(await screen.findByText(copy.courseApprovals.empty)).toBeVisible();
      expect(
        screen.queryByText(copy.courseApprovals.accessDenied),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("retains successful server values and exact dashboard request", async () => {
      fetchMock.mockResolvedValue(response(200, dashboard));
      const { client } = mount(locale, "dashboard");
      await screen.findByRole("heading", { name: copy.dashboard.title });
      expect(
        client
          .getQueryCache()
          .find({ queryKey: ["admin-dashboard"], exact: false })?.state.data,
      ).toEqual(dashboard);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/v1/admin/dashboard?period=30d",
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  },
);
