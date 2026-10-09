import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, vi } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

const clients: QueryClient[] = [];
export function mount(locale: "ar" | "en", component: ReactElement) {
  const messages = locale === "ar" ? ar : en;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const invalidations = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {component}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { client, invalidations, copy: messages.adminWorkspace };
}
export function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
export function refreshKeys(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(([v]) => (v as { queryKey: unknown[] }).queryKey);
}
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
