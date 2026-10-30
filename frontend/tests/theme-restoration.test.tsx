import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeRestoration } from "@/components/theme-restoration";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe.each(["en", "ar"])("locale theme restoration from %s", (locale) => {
  it.each(["light", "dark"])(
    "restores %s before a locale update returns",
    (theme) => {
      localStorage.setItem("betcco-theme", theme);
      const view = render(<ThemeRestoration locale={locale} />);
      expect(document.documentElement.dataset.theme).toBe(theme);
      delete document.documentElement.dataset.theme;
      view.rerender(
        <ThemeRestoration locale={locale === "ar" ? "en" : "ar"} />,
      );
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(localStorage.getItem("betcco-theme")).toBe(theme);
    },
  );
  it.each([null, "invalid-theme"])(
    "uses Dark for stored %s without rewriting it",
    (stored) => {
      if (stored) localStorage.setItem("betcco-theme", stored);
      render(<ThemeRestoration locale={locale} />);
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(localStorage.getItem("betcco-theme")).toBe(stored);
    },
  );
  it("uses Dark when storage access is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage denied");
    });
    render(<ThemeRestoration locale={locale} />);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
