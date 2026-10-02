import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { CommandPalette } from "@/components/navigation/command-palette";
import en from "../messages/en.json";
const { apiMock, push } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Search opener</button>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <QueryClientProvider client={client}>
        <Host />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return userEvent.setup();
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("public command palette shell", () => {
  it("shows shortcuts below two characters and preserves arrows/Enter", async () => {
    const u = setup();
    await u.click(screen.getByRole("button", { name: "Search opener" }));
    const input = screen.getByRole("textbox", { name: "Search courses" });
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
    await u.type(input, "a");
    expect(apiMock).not.toHaveBeenCalled();
    await u.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/en/courses");
    expect(screen.getByRole("button", { name: "Search opener" })).toHaveFocus();
  });
  it("uses the existing catalogue endpoint at two characters", async () => {
    apiMock.mockResolvedValue({
      items: [{ id: "1", title: "Public course", slug: "public-course" }],
    });
    const u = setup();
    await u.click(screen.getByRole("button", { name: "Search opener" }));
    await u.type(screen.getByRole("textbox"), "ab");
    expect(
      await screen.findByRole("button", { name: "Public course" }),
    ).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(
      "/catalog/courses?locale=en&search=ab&pageSize=5",
    );
    await u.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/en/courses/public-course");
  });
  it("distinguishes a failed search from successful empty results", async () => {
    apiMock.mockRejectedValue(new Error("Network"));
    const u = setup();
    await u.click(screen.getByRole("button", { name: "Search opener" }));
    await u.type(screen.getByRole("textbox"), "ab");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByText("No matching courses found."),
    ).not.toBeInTheDocument();
    apiMock.mockResolvedValue({ items: [] });
    await u.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("No matching courses found."),
    ).toBeInTheDocument();
  });
  it("traps focus, lets Enter activate Close search, restores focus on Escape", async () => {
    const u = setup();
    const opener = screen.getByRole("button", { name: "Search opener" });
    await u.click(opener);
    const dialog = screen.getByRole("dialog");
    const input = screen.getByRole("textbox");
    await u.tab({ shift: true });
    expect(
      within(dialog).getByRole("button", {
        name: "Tracks and specializations",
      }),
    ).toHaveFocus();
    await u.tab();
    expect(input).toHaveFocus();
    await u.tab();
    await u.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
    await u.click(opener);
    await u.keyboard("{Escape}");
    expect(opener).toHaveFocus();
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });
});
