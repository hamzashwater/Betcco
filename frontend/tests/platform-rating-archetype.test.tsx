import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformRatingModeration } from "@/features/admin/platform-rating-moderation";
import { formatLocalizedNumber } from "@/i18n/number-format";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import {
  mount,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";
import {
  moderationRatings as ratings,
  moderationSummary as summary,
} from "./fixtures/platform-rating-archetype";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const list = "/admin/platform-ratings",
  summaryPath = list + "/summary";
const read = (p: string) => {
  if (p === list) return ratings;
  if (p === summaryPath) return summary;
  throw Error("Unexpected GET " + p);
};
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(o ? {} : read(p)),
    );
});
async function setup(locale: "en" | "ar") {
  const v = mount(locale, <PlatformRatingModeration />),
    c = v.copy.platformRatingModeration;
  await screen.findByText(ratings[0].comment);
  const rows = () => screen.getAllByRole("article"),
    row = (i: number) => within(rows()[i]);
  return { ...v, c, rows, row };
}
describe.each(["en", "ar"] as const)(
  "Slice 4 moderation %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    it("uses exact independent query keys/endpoints with no parameters or extra fan-out", async () => {
      const v = await setup(locale);
      expect(apiMock.mock.calls).toEqual([[list], [summaryPath]]);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([
        ["admin-platform-ratings"],
        ["admin-platform-ratings-summary"],
      ]);
      expect(writes()).toEqual([]);
    });
    it("preserves raw server order, four raw scores, exact average arithmetic and localized date/one decimal", async () => {
      const v = await setup(locale);
      expect(v.rows()).toHaveLength(ratings.length);
      ratings.forEach((r, i) => {
        expect(v.row(i).getByRole("textbox")).toHaveValue(r.moderationReason);
        expect(
          v.row(i).getByText(formatLocalizedDateTime(r.updatedAtUtc, locale)),
        ).toBeVisible();
        const average =
          (r.courseQualityScore +
            r.easeOfUseScore +
            r.supportScore +
            r.recommendationScore) /
          4;
        expect(
          v.row(i).getByText(
            formatLocalizedNumber(average, locale, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }) + " / 5",
          ),
        ).toBeVisible();
        expect(
          Array.from(v.rows()[i].querySelectorAll("strong")).map(
            (n) => n.textContent,
          ),
        ).toEqual(
          [
            r.courseQualityScore,
            r.easeOfUseScore,
            r.supportScore,
            r.recommendationScore,
          ].map((s) => s + " / 5"),
        );
        if (r.comment)
          expect(v.rows()[i].querySelectorAll("p")[1].textContent).toBe(
            r.comment,
          );
      });
      expect(
        v.row(4).getByText(v.c.theLearnerDidNotAddAWrittenComment),
      ).toBeVisible();
      expect(writes()).toEqual([]);
    });
    it("uses authoritative summary totals and average, never loaded unpublished count or loaded average", async () => {
      const v = await setup(locale),
        region = within(
          screen.getByRole("region", { name: v.c.learnerExperienceSummary }),
        );
      for (const [label, value] of [
        [v.c.allFeedback, 843],
        [v.c.published, 300],
        [v.c.awaitingModeration, 400],
        [v.c.privateWithoutConsent, 143],
        [v.c.experienceAverage, "4.3 / 5"],
      ] as const)
        expect(region.getByText(label).parentElement).toHaveTextContent(
          String(value),
        );
      expect(
        screen.queryByText(v.c.countAwaitingReview.replace("{count}", "3")),
      ).not.toBeInTheDocument();
      expect(screen.getByText(v.c.loadedScope)).toBeVisible();
    });
    it("keeps publication and consent independent including inconsistent legacy fields, no invented lifecycle or identity", async () => {
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(
          p === list
            ? ratings.map((r) => ({
                ...r,
                studentUserId: "PRIVATE-LEARNER-ID",
                studentName: "PRIVATE-NAME",
                email: "PRIVATE-EMAIL",
              }))
            : summary,
        ),
      );
      const v = await setup(locale);
      expect(v.row(3).getByText(v.c.published)).toBeVisible();
      expect(
        v.row(3).getByText(v.c.noDisplayConsent, { selector: "span" }),
      ).toBeVisible();
      expect(v.row(0).getByText(v.c.notPublished)).toBeVisible();
      expect(v.row(1).getByText(v.c.consentGranted)).toBeVisible();
      expect(
        v.row(2).getByRole("button", { name: v.c.publishReview }),
      ).toBeEnabled();
      expect(document.body.textContent).not.toMatch(
        /PRIVATE-LEARNER-ID|PRIVATE-NAME|PRIVATE-EMAIL|Unreviewed|Approved|Rejected|Verified/,
      );
      expect(document.querySelector('a[href*="rating-z"]')).toBeNull();
    });
    it("blocks publishing without consent, including published/no-consent, and leaves Keep Private available", async () => {
      const v = await setup(locale),
        user = userEvent.setup();
      for (const i of [0, 3]) {
        const publish = v
          .row(i)
          .getByRole("button", { name: v.c.noDisplayConsent });
        expect(publish).toBeDisabled();
        await user.click(publish);
        expect(
          v.row(i).getByRole("button", { name: v.c.keepPrivate }),
        ).toBeEnabled();
      }
      expect(writes()).toEqual([]);
    });
    it.each([true, false])(
      "posts exact publish=%s with null local reason, without implicit stored-note fallback",
      async (publish) => {
        const v = await setup(locale),
          i = publish ? 1 : 0;
        await userEvent.click(
          v.row(i).getByRole("button", {
            name: publish ? v.c.publishReview : v.c.keepPrivate,
          }),
        );
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toEqual([
          `${list}/${ratings[i].id}/moderation`,
          { method: "POST", body: JSON.stringify({ publish, reason: null }) },
        ]);
        expect(refreshKeys(v.invalidations)).toEqual([
          ["admin-platform-ratings"],
          ["admin-platform-ratings-summary"],
          ["platform-ratings"],
        ]);
      },
    );
    it.each([true, false])(
      "preserves exact trimming/null payload and per-row reasons for publish=%s",
      async (publish) => {
        const v = await setup(locale);
        fireEvent.change(v.row(0).getByRole("textbox"), {
          target: { value: "Other row retained" },
        });
        const input = v.row(1).getByRole("textbox");
        expect(input).toHaveAttribute("maxlength", "500");
        expect(input).not.toBeRequired();
        for (const reason of ["  raw note\nسبب خام  ", "   ", ""]) {
          fireEvent.change(input, { target: { value: reason } });
          await userEvent.click(
            v.row(1).getByRole("button", {
              name: publish ? v.c.publishReview : v.c.keepPrivate,
            }),
          );
          await waitFor(() =>
            expect(writes().at(-1)).toEqual([
              `${list}/rating-a/moderation`,
              {
                method: "POST",
                body: JSON.stringify({
                  publish,
                  reason: reason.trim() || null,
                }),
              },
            ]),
          );
          await waitFor(() =>
            expect(
              v.row(1).getByRole("button", {
                name: publish ? v.c.publishReview : v.c.keepPrivate,
              }),
            ).toBeEnabled(),
          );
          expect(v.row(0).getByRole("textbox")).toHaveValue(
            "Other row retained",
          );
          expect(input).toHaveValue(reason);
        }
      },
    );
    it("keeps the single global mutation pending guard across all rows and preserves all reason drafts after success", async () => {
      const pending = deferred<unknown>();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o ? pending.promise : Promise.resolve(read(p)),
      );
      const v = await setup(locale);
      fireEvent.change(v.row(0).getByRole("textbox"), {
        target: { value: "first draft" },
      });
      fireEvent.change(v.row(1).getByRole("textbox"), {
        target: { value: "second draft" },
      });
      await userEvent.click(
        v.row(1).getByRole("button", { name: v.c.publishReview }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        v.c.moderating,
      );
      for (const row of v.rows())
        for (const button of within(row).getAllByRole("button"))
          expect(button).toBeDisabled();
      await userEvent.click(
        v.row(0).getByRole("button", { name: v.c.keepPrivate }),
      );
      expect(writes()).toHaveLength(1);
      await act(async () => pending.resolve({}));
      await waitFor(() =>
        expect(
          v.row(0).getByRole("button", { name: v.c.keepPrivate }),
        ).toBeEnabled(),
      );
      expect(v.row(0).getByRole("textbox")).toHaveValue("first draft");
      expect(v.row(1).getByRole("textbox")).toHaveValue("second draft");
    });
    it.each([true, false])(
      "retains all local drafts and exact error ownership on failure (Error=%s)",
      async (isError) => {
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o
            ? Promise.reject(
                isError ? Error("Raw moderation failure") : "non-error",
              )
            : Promise.resolve(read(p)),
        );
        const v = await setup(locale);
        fireEvent.change(v.row(0).getByRole("textbox"), {
          target: { value: "private draft" },
        });
        fireEvent.change(v.row(1).getByRole("textbox"), {
          target: { value: "other draft" },
        });
        await userEvent.click(
          v.row(0).getByRole("button", { name: v.c.keepPrivate }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          isError
            ? "Raw moderation failure"
            : v.c.reviewStatusCouldNotBeUpdated,
        );
        expect(v.row(0).getByRole("textbox")).toHaveValue("private draft");
        expect(v.row(1).getByRole("textbox")).toHaveValue("other draft");
        expect(refreshKeys(v.invalidations)).toEqual([]);
      },
    );
    it.each([list, summaryPath])(
      "keeps independent cold pending/error states for %s without a false empty",
      async (path) => {
        const pending = deferred<unknown>();
        apiMock.mockImplementation((p: string) =>
          p === path ? pending.promise : Promise.resolve(read(p)),
        );
        const v = mount(locale, <PlatformRatingModeration />),
          c = v.copy.platformRatingModeration;
        expect(await screen.findByRole("status")).toHaveTextContent(
          path === list ? c.loadingReviews : c.loadingSummary,
        );
        if (path === summaryPath) {
          expect(await screen.findAllByRole("article")).toHaveLength(
            ratings.length,
          );
          expect(
            screen.getAllByRole("button", { name: c.publishReview })[0],
          ).toBeEnabled();
        } else expect(screen.queryByRole("article")).not.toBeInTheDocument();
        expect(screen.queryByText(c.emptyLoaded)).not.toBeInTheDocument();
        await act(async () => pending.reject(Error("Synthetic cold error")));
        expect(await screen.findByRole("alert")).toHaveTextContent(
          path === list
            ? c.platformReviewsCouldNotBeLoaded
            : c.summaryUnavailable,
        );
        expect(screen.queryByText(c.emptyLoaded)).not.toBeInTheDocument();
        if (path === summaryPath)
          expect(screen.getAllByRole("article")).toHaveLength(ratings.length);
        expect(writes()).toEqual([]);
      },
    );
    it.each([list, summaryPath])(
      "retains actual cached ratings and drafts after %s refresh failure",
      async (path) => {
        const v = await setup(locale);
        fireEvent.change(v.row(1).getByRole("textbox"), {
          target: { value: "retained cached draft" },
        });
        apiMock.mockImplementation((p: string) =>
          p === path
            ? Promise.reject(Error("Synthetic refresh error"))
            : Promise.resolve(read(p)),
        );
        await act(async () => {
          await v.client.refetchQueries({
            queryKey:
              path === list
                ? ["admin-platform-ratings"]
                : ["admin-platform-ratings-summary"],
            exact: true,
          });
        });
        expect(await screen.findByRole("alert")).toHaveTextContent(
          path === list
            ? v.c.platformReviewsCouldNotBeLoaded
            : v.c.summaryUnavailable,
        );
        expect(v.rows()).toHaveLength(ratings.length);
        expect(v.row(1).getByRole("textbox")).toHaveValue(
          "retained cached draft",
        );
        expect(
          v.row(1).getByRole("button", { name: v.c.publishReview }),
        ).toBeEnabled();
        expect(
          v.row(0).getByRole("button", { name: v.c.noDisplayConsent }),
        ).toBeDisabled();
      },
    );
    it("keeps empty ratings independent from nonzero summary and populated ratings independent from zero summary", async () => {
      const v = await setup(locale);
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(p === list ? [] : summary),
      );
      await act(async () => {
        await v.client.refetchQueries({
          queryKey: ["admin-platform-ratings"],
          exact: true,
        });
      });
      expect(await screen.findByText(v.c.emptyLoaded)).toBeVisible();
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
      expect(
        within(
          screen.getByRole("region", { name: v.c.learnerExperienceSummary }),
        ).getByText("843"),
      ).toBeVisible();
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(
          p === list
            ? ratings
            : {
                ...summary,
                totalCount: 0,
                publishedCount: 0,
                awaitingModerationCount: 0,
                privateWithoutConsentCount: 0,
              },
        ),
      );
      await act(async () => {
        await v.client.refetchQueries();
      });
      expect(await screen.findAllByRole("article")).toHaveLength(
        ratings.length,
      );
      expect(screen.queryByText(v.c.emptyLoaded)).not.toBeInTheDocument();
    });
    it("keeps multiline reason and enabled actions keyboard reachable with independent drafts", async () => {
      const v = await setup(locale),
        user = userEvent.setup(),
        input = v.row(1).getByRole("textbox");
      input.focus();
      await user.clear(input);
      await user.keyboard("Draft{Enter}سبب");
      expect(input).toHaveValue("Draft\nسبب");
      await user.tab();
      expect(
        v.row(1).getByRole("button", { name: v.c.keepPrivate }),
      ).toHaveFocus();
      await user.tab();
      expect(
        v.row(1).getByRole("button", { name: v.c.publishReview }),
      ).toHaveFocus();
      expect(writes()).toEqual([]);
      expect(v.row(0).getByRole("textbox")).toHaveValue(
        ratings[0].moderationReason,
      );
    });
  },
);
