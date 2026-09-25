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
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";
import { AuditLogViewer } from "@/features/admin/audit-log";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
}));

function renderAuditLog(locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AuditLogViewer />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("Admin audit log filters", () => {
  it("sends structured filters to the server and clears the draft controls", async () => {
    apiMock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
    });
    renderAuditLog();
    const user = userEvent.setup();

    await screen.findByText("No audit events match this search.");
    await user.type(screen.getByLabelText("Action contains"), "EmailChange");
    await user.type(screen.getByLabelText("Entity type contains"), "User");
    await user.selectOptions(screen.getByLabelText("Outcome"), "Success");
    fireEvent.change(screen.getByLabelText("From date (UTC)"), {
      target: { value: "2026-09-20" },
    });
    fireEvent.change(screen.getByLabelText("To date (UTC)"), {
      target: { value: "2026-09-21" },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        expect.stringContaining("action=EmailChange"),
      ),
    );
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("entityType=User"),
    );
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("outcome=Success"),
    );
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("fromUtc=2026-09-20T00%3A00%3A00Z"),
    );
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("toUtc=2026-09-21T23%3A59%3A59.999Z"),
    );

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByLabelText("Action contains")).toHaveValue("");
    expect(screen.getByLabelText("Entity type contains")).toHaveValue("");
    expect(screen.getByLabelText("Outcome")).toHaveValue("");
  });

  it("renders the structured filters in Arabic", async () => {
    apiMock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
    });
    renderAuditLog("ar");

    expect(await screen.findByLabelText("العملية تحتوي على")).toBeVisible();
    expect(screen.getByLabelText("نوع الكيان يحتوي على")).toBeVisible();
    expect(screen.getByLabelText("النتيجة")).toBeVisible();
    expect(screen.getByLabelText("من تاريخ (UTC)")).toBeVisible();
    expect(screen.getByLabelText("إلى تاريخ (UTC)")).toBeVisible();
  });
});
