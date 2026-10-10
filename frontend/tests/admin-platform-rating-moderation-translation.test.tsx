import { PlatformRatingModeration } from "@/features/admin/platform-rating-moderation";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import { formatLocalizedNumber } from "@/i18n/number-format";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import baseline from "./fixtures/admin-a5-5-10-15-copy-baseline.json";
import {
  mount,
  deferred,
  refreshKeys,
} from "./helpers/admin-governance-gradebook-render";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
const timestamp = "2026-10-10T12:34:00Z";
const rating = {
  id: "r",
  courseQualityScore: 1,
  easeOfUseScore: 2,
  supportScore: 4,
  recommendationScore: 5,
  comment: "RAW <comment>",
  allowPublicDisplay: true,
  isPublished: false,
  moderationReason: "RAW OLD REASON",
  updatedAtUtc: timestamp,
};
const summary = {
  totalCount: 7,
  publishedCount: 2,
  awaitingModerationCount: 3,
  privateWithoutConsentCount: 2,
  averageScore: 3.7,
};
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, o?: RequestInit) =>
    Promise.resolve(
      o?.method ? rating : p.endsWith("/summary") ? summary : [rating],
    ),
  );
});
for (const locale of ["ar", "en"] as const) {
  const copy = (en: string) =>
    baseline.scopes.platformRatingModeration.cases.find((c) => c.en === en)![
      locale
    ];
  async function ready() {
    const result = mount(locale, <PlatformRatingModeration />);
    await screen.findByRole("button", { name: copy("Publish review") });
    return result;
  }
  describe(`Platform moderation translated contracts ${locale}`, () => {
    it("keeps the exact four-score average, raw comment and locale date/number formatting", async () => {
      await ready();
      expect(screen.getByText(rating.comment)).toBeVisible();
      expect(screen.getByText("3.7 / 5")).toBeVisible();
      expect(
        screen.getByText(
          (_, e) =>
            e?.tagName === "DIV" &&
            e.textContent ===
              formatLocalizedNumber(3, locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }) +
                " / 5",
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          (_, e) =>
            e?.tagName === "P" &&
            e.textContent === formatLocalizedDateTime(timestamp, locale),
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          copy("{count} awaiting review").replace("{count}", "1"),
        ),
      ).toBeVisible();
      expect(
        screen.getByLabelText(
          copy("Reason for keeping private / internal note"),
        ),
      ).toHaveValue("RAW OLD REASON");
      expect(
        screen.getByLabelText(
          copy("Reason for keeping private / internal note"),
        ),
      ).toHaveAttribute("maxlength", "500");
    });
    it.each([true, false])(
      "posts publish=%s with no implicit stored-reason fallback",
      async (publish) => {
        const { invalidations } = await ready();
        await userEvent.click(
          screen.getByRole("button", {
            name: copy(publish ? "Publish review" : "Keep private"),
          }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            "/admin/platform-ratings/r/moderation",
            { method: "POST", body: JSON.stringify({ publish, reason: null }) },
          ),
        );
        expect(refreshKeys(invalidations)).toEqual([
          ["admin-platform-ratings"],
          ["admin-platform-ratings-summary"],
          ["platform-ratings"],
        ]);
      },
    );
    it.each([" review reason ", "   "])(
      "preserves explicit note trimming/null (%s)",
      async (reason) => {
        await ready();
        fireEvent.change(
          screen.getByLabelText(
            copy("Reason for keeping private / internal note"),
          ),
          {
            target: { value: reason },
          },
        );
        await userEvent.click(
          screen.getByRole("button", { name: copy("Publish review") }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            "/admin/platform-ratings/r/moderation",
            {
              method: "POST",
              body: JSON.stringify({
                publish: true,
                reason: reason.trim() || null,
              }),
            },
          ),
        );
      },
    );
    it("blocks every public action without consent but allows keeping private", async () => {
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        Promise.resolve(
          o?.method
            ? {}
            : p.endsWith("/summary")
              ? summary
              : [{ ...rating, allowPublicDisplay: false }],
        ),
      );
      mount(locale, <PlatformRatingModeration />);
      expect(
        await screen.findByRole("button", { name: copy("No display consent") }),
      ).toBeDisabled();
      await userEvent.click(
        screen.getByRole("button", { name: copy("Keep private") }),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/platform-ratings/r/moderation",
          {
            method: "POST",
            body: JSON.stringify({ publish: false, reason: null }),
          },
        ),
      );
    });
    it("disables both actions during pending moderation", async () => {
      await ready();
      const pending = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method
          ? pending.promise
          : Promise.resolve(p.endsWith("/summary") ? summary : [rating]),
      );
      await userEvent.click(
        screen.getByRole("button", { name: copy("Publish review") }),
      );
      expect(
        screen.getByRole("button", { name: copy("Publish review") }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: copy("Keep private") }),
      ).toBeDisabled();
      pending.resolve(rating);
    });
    it.each([new Error("RAW MODERATION ERROR"), "non-error rejection"])(
      "preserves raw errors and the localized non-Error fallback (%s)",
      async (error) => {
        await ready();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method
            ? Promise.reject(error)
            : Promise.resolve(p.endsWith("/summary") ? summary : [rating]),
        );
        await userEvent.click(
          screen.getByRole("button", { name: copy("Keep private") }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          error instanceof Error
            ? error.message
            : copy("Review status could not be updated."),
        );
      },
    );
    it("renders published state, empty comment and optional summary independently", async () => {
      apiMock.mockImplementation((p: string) =>
        p.endsWith("/summary")
          ? Promise.reject(new Error("summary unavailable"))
          : Promise.resolve([{ ...rating, isPublished: true, comment: null }]),
      );
      await ready();
      expect(
        screen.getByText(
          copy("{count} awaiting review").replace("{count}", "0"),
        ),
      ).toBeVisible();
      expect(
        screen.getByText(copy("The learner did not add a written comment.")),
      ).toBeVisible();
      expect(
        screen.queryByLabelText(copy("Learner experience summary")),
      ).not.toBeInTheDocument();
    });
    it("keeps localized load failure and empty states", async () => {
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(p.endsWith("/summary") ? summary : []),
      );
      mount(locale, <PlatformRatingModeration />);
      expect(
        await screen.findByText(copy("No reviews have been submitted yet.")),
      ).toBeVisible();
      expect(
        within(
          screen.getByRole("region", {
            name: copy("Learner experience summary"),
          }),
        ).getByText("7"),
      ).toBeVisible();
    });
  });
}
