import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { StudentComprehensivePractice } from "@/features/learning/comprehensive-practice";
import { StudentLearningAimPractice } from "@/features/learning/learning-aim-practice";

const state = vi.hoisted(() => ({
  index: 0,
  errorSlot: -1,
  error: null as Error | null,
  calls: [] as { mutationFn: () => unknown }[],
}));
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api: apiMock,
  ApiError: class extends Error {},
}));
// Capture the real production mutation callbacks at the hook boundary. Normal
// controls prevent this state; forcing the resulting error proves its UI sink.
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: (options: { queryKey: unknown[] }) => ({
    isPending: false,
    isError: false,
    data:
      options.queryKey[0] === "learning-aim-practice"
        ? [{ id: "unit", arabicTitle: "وحدة", englishTitle: "Unit", aims: [] }]
        : [],
  }),
  useMutation: (options: { mutationFn: () => unknown }) => {
    const slot = state.index++;
    state.calls.push(options);
    return {
      isPending: false,
      isSuccess: false,
      isError: slot === state.errorSlot,
      error: slot === state.errorSlot ? state.error : null,
      mutate: vi.fn(),
    };
  },
}));
beforeEach(() => {
  state.index = 0;
  state.errorSlot = -1;
  state.error = null;
  state.calls = [];
});
afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

for (const [kind, Component] of [
  ["comprehensive", StudentComprehensivePractice],
  ["aim", StudentLearningAimPractice],
] as const) {
  describe(`${kind} guard classification`, () => {
    it.each([
      ["ar", 1],
      ["ar", 2],
      ["en", 1],
      ["en", 2],
    ] as const)(
      "the actual %s mutation %s guard is client STATIC_UI and retains throw/no-request semantics",
      async (locale, slot) => {
        const messages = locale === "ar" ? ar : en;
        const view = () =>
          render(
            <NextIntlClientProvider locale={locale} messages={messages}>
              <Component courseId="raw-course" />
            </NextIntlClientProvider>,
          );
        view();
        const callback = state.calls[slot].mutationFn;
        let error: unknown;
        try {
          await callback();
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(Error);
        if (!(error instanceof Error)) throw new Error("Guard did not throw");
        expect(error.message).toBe(
          messages.learningPractice[kind].noActiveSubmission,
        );
        expect(apiMock).not.toHaveBeenCalled();
        cleanup();
        state.index = 0;
        state.calls = [];
        state.errorSlot = slot;
        state.error = error;
        view();
        expect(screen.getByRole("alert")).toHaveTextContent(error.message);
        expect(apiMock).not.toHaveBeenCalled();
      },
    );
  });
}
