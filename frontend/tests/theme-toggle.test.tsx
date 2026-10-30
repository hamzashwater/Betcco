import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";
import { NextIntlClientProvider } from "next-intl";
import en from "../messages/en.json";
import ar from "../messages/ar.json";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ThemeToggle", () => {
  it("persists the selected theme without a hydration-dependent default", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ThemeToggle />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("betcco-theme")).toBe("dark");
  });
});

describe.each(["en", "ar"] as const)(
  "restored theme control in %s",
  (locale) => {
    it.each(["dark", "light"] as const)(
      "keeps native keyboard activation and storage/events from %s",
      async (initial) => {
        document.documentElement.dataset.theme = initial;
        localStorage.setItem("betcco-theme", initial);
        const messages = locale === "ar" ? ar : en;
        const listener = vi.fn();
        window.addEventListener("betcco:theme", listener);
        try {
          render(
            <NextIntlClientProvider locale={locale} messages={messages}>
              <ThemeToggle />
            </NextIntlClientProvider>,
          );
          const button = screen.getByRole("button", {
            name: messages.navigation.theme.toggle,
          });
          await userEvent.tab();
          expect(button).toHaveFocus();
          await userEvent.keyboard("{Enter}");
          const next = initial === "dark" ? "light" : "dark";
          expect(document.documentElement.dataset.theme).toBe(next);
          expect(localStorage.getItem("betcco-theme")).toBe(next);
          expect(listener).toHaveBeenCalledOnce();
        } finally {
          window.removeEventListener("betcco:theme", listener);
        }
      },
    );
  },
);
