import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CommandPalette } from "@/components/navigation/command-palette";
import { NotificationCenter } from "@/components/navigation/notification-center";
import { ThemeToggle } from "@/components/theme-toggle";
import { FilePicker } from "@/components/forms/file-picker";
import LocaleError from "@/app/[locale]/error";
import LocaleLoading from "@/app/[locale]/loading";
import ar from "../messages/ar.json";
import en from "../messages/en.json";

const { apiMock, push } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function setup(locale: "ar" | "en", children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? ar : en}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { client, user: userEvent.setup(), m: locale === "ar" ? ar : en };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe.each(["ar", "en"] as const)(
  "shared shell translated UI and contracts in %s",
  (locale) => {
    it("renders error/loading copy, keeps reset and hides raw error/digest", async () => {
      const reset = vi.fn();
      const { m, user } = setup(
        locale,
        <>
          <LocaleError
            error={Object.assign(new Error("RAW server failure"), {
              digest: "RAW digest",
            })}
            reset={reset}
          />
          <LocaleLoading />
        </>,
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        m.appShell.error.description,
      );
      expect(
        screen.getByRole("heading", { name: m.appShell.error.title }),
      ).toBeVisible();
      expect(screen.getByText(m.appShell.loading)).toBeInTheDocument();
      expect(
        screen.getByText(m.appShell.loading).closest("main"),
      ).toHaveAttribute("aria-busy", "true");
      expect(
        screen.getByText(m.appShell.loading).closest("main"),
      ).toHaveAttribute("aria-live", "polite");
      expect(screen.queryByText(/RAW/)).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: m.appShell.error.retry }),
      );
      expect(reset).toHaveBeenCalledOnce();
    });
    it("preserves raw file names, metadata and caller label/help with translated defaults", () => {
      const file = new File(["ok"], "RAW-ملف.pdf");
      const onFilesChange = vi.fn();
      const { m } = setup(
        locale,
        <FilePicker
          label="RAW label"
          helpText="RAW help"
          files={[file]}
          locale={locale}
          onFilesChange={onFilesChange}
          accept=".pdf"
        />,
      );
      expect(screen.getByText("RAW-ملف.pdf")).toBeVisible();
      expect(screen.getByText("PDF · 0.00 MB")).toBeVisible();
      expect(screen.getByText("RAW help")).toBeVisible();
      expect(
        screen.getByLabelText(
          m.forms.filePicker.chooseInput.replace("{label}", "RAW label"),
        ),
      ).toHaveAttribute("accept", ".pdf");
      fireEvent.click(
        screen.getByRole("button", {
          name: m.forms.filePicker.removeFile.replace("{fileName}", file.name),
        }),
      );
      expect(onFilesChange).toHaveBeenCalledExactlyOnceWith([]);
    });
    it("localizes palette chrome, preserves raw search results, endpoint/query key and destination", async () => {
      apiMock.mockResolvedValue({
        items: [
          {
            id: "RAW id",
            title: "RAW title عنوان",
            track: "RAW track",
            slug: "raw-course",
          },
        ],
      });
      const onClose = vi.fn();
      const { m, user, client } = setup(
        locale,
        <CommandPalette open onClose={onClose} />,
      );
      expect(
        screen.getByRole("dialog", { name: m.navigation.commandPalette.label }),
      ).toBeVisible();
      const input = screen.getByRole("textbox", {
        name: m.navigation.accessibility.searchCourses,
      });
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute(
        "placeholder",
        m.navigation.commandPalette.placeholder,
      );
      expect(
        screen.getByText(m.navigation.commandPalette.keyboardHelp),
      ).toBeVisible();
      expect(
        screen.getByRole("button", {
          name: m.navigation.commandPalette.browseCourses,
        }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", {
          name: m.navigation.commandPalette.tracks,
        }),
      ).toBeVisible();
      await user.type(input, "ab");
      const item = await screen.findByRole("button", {
        name: /RAW title عنوان.*RAW track/,
      });
      expect(apiMock).toHaveBeenCalledWith(
        `/catalog/courses?locale=${locale}&search=ab&pageSize=5`,
      );
      expect(
        client.getQueryCache().find({
          queryKey: ["command-course-search", locale, "ab"],
          exact: true,
        }),
      ).toBeDefined();
      await user.click(item);
      expect(push).toHaveBeenCalledExactlyOnceWith(
        `/${locale}/courses/raw-course`,
      );
      expect(onClose).toHaveBeenCalledOnce();
    });
    it("retains palette loading/error/empty precedence and a bounded user retry", async () => {
      let rejectSearch!: (error: Error) => void;
      apiMock.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectSearch = reject;
          }),
      );
      const { m, user } = setup(
        locale,
        <CommandPalette open onClose={vi.fn()} />,
      );
      await user.type(screen.getByRole("textbox"), "ab");
      expect(
        await screen.findByText(m.navigation.commandPalette.searching),
      ).toBeVisible();
      rejectSearch(new Error("RAW failure"));
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(
        screen.queryByText(m.navigation.commandPalette.empty),
      ).not.toBeInTheDocument();
      apiMock.mockResolvedValue({ items: [] });
      await user.click(
        screen.getByRole("button", { name: m.auth.accountProfile.retry }),
      );
      expect(
        await screen.findByText(m.navigation.commandPalette.empty),
      ).toBeVisible();
      expect(apiMock).toHaveBeenCalledTimes(2);
    });
    it("keeps raw notifications, unread counts, single/all read POSTs and invalidations", async () => {
      const items = [
        {
          id: "first",
          title: "RAW title إشعار",
          body: "RAW user body نص",
          createdAtUtc: "2026-10-10T00:00:00Z",
          deepLink: "/teacher/courses",
        },
        {
          id: "read",
          title: "RAW read",
          body: "RAW read body",
          readAtUtc: "2026-10-10T01:00:00Z",
          deepLink: `/${locale}/teacher/courses`,
        },
      ];
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(path === "/notifications" ? items : {}),
      );
      const { m, user, client } = setup(
        locale,
        <NotificationCenter locale={locale} enabled />,
      );
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const trigger = await screen.findByRole("button", {
        name: m.navigation.notifications.unreadLabel.replace("{count}", "1"),
      });
      expect(
        client
          .getQueryCache()
          .find({ queryKey: ["notifications"], exact: true }),
      ).toBeDefined();
      await user.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(trigger).toHaveAttribute("aria-controls", "notification-center");
      expect(
        screen.getByRole("dialog", { name: m.navigation.notifications.title }),
      ).toHaveAttribute("id", "notification-center");
      expect(screen.getByText("RAW user body نص")).toBeVisible();
      const unreadLink = screen.getByRole("link", {
        name: "RAW title إشعار RAW user body نص",
      });
      expect(unreadLink).toHaveAttribute("href", `/${locale}/teacher/courses`);
      expect(
        screen.getByRole("link", { name: "RAW read RAW read body" }),
      ).toHaveAttribute("href", `/${locale}/teacher/courses`);
      await user.click(
        screen.getByRole("button", {
          name: m.navigation.notifications.readAll,
        }),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith("/notifications/read-all", {
          method: "POST",
        }),
      );
      await user.click(unreadLink);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith("/notifications/first/read", {
          method: "POST",
        }),
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    it("retains notification empty/up-to-date copy, Escape/outside dismissal and disabled queries", async () => {
      apiMock.mockResolvedValue([]);
      const { m, user } = setup(
        locale,
        <NotificationCenter locale={locale} enabled />,
      );
      const trigger = screen.getByRole("button");
      await user.click(trigger);
      expect(
        await screen.findByText(m.navigation.notifications.empty),
      ).toBeVisible();
      expect(
        screen.getByText(m.navigation.notifications.upToDate),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", {
          name: m.navigation.notifications.readAll,
        }),
      ).not.toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await user.click(trigger);
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      cleanup();
      apiMock.mockClear();
      setup(locale, <NotificationCenter locale={locale} enabled={false} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(apiMock).not.toHaveBeenCalled();
    });
    it("translates theme accessible copy while preserving both toggles, storage and events", async () => {
      const listener = vi.fn();
      window.addEventListener("betcco:theme", listener);
      const { m, user } = setup(locale, <ThemeToggle locale={locale} />);
      const button = screen.getByRole("button", {
        name: m.navigation.theme.toggle,
      });
      expect(button).toHaveAttribute("type", "button");
      expect(screen.getByText(m.navigation.theme.label)).toBeInTheDocument();
      await user.click(button);
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(localStorage.getItem("betcco-theme")).toBe("dark");
      await user.click(button);
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(localStorage.getItem("betcco-theme")).toBe("light");
      expect(listener).toHaveBeenCalledTimes(2);
      window.removeEventListener("betcco:theme", listener);
    });
  },
);
