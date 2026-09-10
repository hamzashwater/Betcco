import { NotificationCenter } from "@/components/navigation/notification-center";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function renderNotifications() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationCenter locale="ar" enabled />
    </QueryClientProvider>,
  );
}

describe("navigation popovers", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("closes notifications when pressing outside", () => {
    renderNotifications();
    fireEvent.click(
      screen.getByRole("button", { name: "الإشعارات، 0 غير مقروءة" }),
    );
    expect(
      screen.getByRole("dialog", { name: "الإشعارات" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("dialog", { name: "الإشعارات" }),
    ).not.toBeInTheDocument();
  });
});
