import { ContentStudio } from "@/features/admin/content-studio";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import { mount } from "./helpers/admin-governance-gradebook-render";
import { studioFixture } from "./fixtures/content-studio-archetype";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
beforeEach(() => apiMock.mockReset());

for (const locale of ["en", "ar"] as const) {
  const t = (locale === "en" ? en : ar).adminContent;
  const attendancePath = "/admin/content/live-sessions/session-a/attendance";

  function setup() {
    const fixture = studioFixture();
    const sessions = {
      "session-a": fixture.attendance,
      "session-b": structuredClone(fixture.attendance),
    };
    const paths: Record<string, unknown> = {
      "/admin/content/teachers": fixture.teachers,
      "/admin/content/courses": fixture.courses,
      "/admin/content/blog": fixture.blog,
      "/admin/content/packages": fixture.packages,
      "/admin/content/live-sessions": fixture.sessions,
      "/admin/content/live-session-providers": fixture.providers,
      "/admin/users?role=Student&pageSize=100": fixture.students,
    };
    const writes: { path: string; method: string; body: unknown }[] = [];
    const timeline: Record<string, unknown>[] = [];
    let save: () => Promise<unknown> = () => Promise.resolve({});
    apiMock.mockImplementation(async (path: string, options?: RequestInit) => {
      if (options?.method) {
        writes.push({
          path,
          method: options.method,
          body: JSON.parse(String(options.body)),
        });
        return save();
      }
      const session =
        /^\/admin\/content\/live-sessions\/(session-[ab])\/attendance$/.exec(
          path,
        )?.[1] as keyof typeof sessions | undefined;
      const value = structuredClone(session ? sessions[session] : paths[path]);
      if (session)
        timeline.push({
          step: "GET response",
          session,
          items: sessions[session].map(({ id, status }) => ({ id, status })),
        });
      return value;
    });
    const { client, invalidations } = mount(locale, <ContentStudio />);
    const select = (i: number) =>
      screen.getByLabelText(
        `${t.attendanceStatus} · Synthetic learner ${i}`,
      ) as HTMLSelectElement;
    const row = (i: number) => select(i).parentElement!.parentElement!;
    const update = (i: number) =>
      within(row(i)).getByRole("button", { name: t.updateAttendance });
    const record = (step: string, originalNode?: HTMLSelectElement) => {
      const cache = client.getQueryData<typeof fixture.attendance>([
        "admin-live-attendance",
        "session-a",
      ]);
      timeline.push({
        step,
        itemId: cache?.[0]?.id,
        itemStatusInCache: cache?.[0]?.status,
        itemStatusRendered: row(0).querySelector("span")?.textContent,
        localDraft: select(0).value,
        otherDraft: select(1).value,
        updateDisabled: (update(0) as HTMLButtonElement).disabled,
        originalNodeConnected: originalNode?.isConnected,
        originalNodeDraft: originalNode?.value,
        writes: writes.length,
      });
    };
    const open = async () => {
      fireEvent.click(
        screen
          .getByRole("navigation", { name: t.workspaceNavigation })
          .querySelector('button[aria-controls="content-attendance"]')!,
      );
      await waitFor(() =>
        expect(
          document.querySelector('option[value="session-a"]'),
        ).not.toBeNull(),
      );
      fireEvent.change(
        screen.getByLabelText(t.attendanceSession, { selector: "select" }),
        { target: { value: "session-a" } },
      );
      await screen.findByText("Synthetic learner 0");
    };
    const persist = (name: string) => {
      if (!process.env.BETCCO_ATTENDANCE_TIMELINE_DIR) return;
      mkdirSync(process.env.BETCCO_ATTENDANCE_TIMELINE_DIR, {
        recursive: true,
      });
      writeFileSync(
        join(
          process.env.BETCCO_ATTENDANCE_TIMELINE_DIR,
          `${name}-${locale}.json`,
        ),
        JSON.stringify(
          {
            classification: "MOCKED COMPONENT-CONTRACT EVIDENCE",
            locale,
            timeline,
            writes,
          },
          null,
          2,
        ),
      );
    };
    return {
      fixture,
      sessions,
      client,
      invalidations,
      writes,
      timeline,
      select,
      row,
      update,
      record,
      open,
      persist,
      setSave: (fn: () => Promise<unknown>) => {
        save = fn;
      },
    };
  }

  it(`independently traces refetch completion versus committed row render and protects unsaved drafts (${locale})`, async () => {
    const c = setup();
    await c.open();
    const originalNode = c.select(0);
    c.record("initial server status and local draft", originalNode);
    expect(c.select(0)).toHaveValue("Present");
    expect(c.update(0)).toBeDisabled();
    fireEvent.change(c.select(0), { target: { value: "Excused" } });
    fireEvent.change(c.select(1), { target: { value: "Absent" } });
    c.record("user changed independent local drafts", originalNode);
    expect(c.select(0)).toHaveValue("Excused");
    expect(
      c.client.getQueryData<typeof c.fixture.attendance>([
        "admin-live-attendance",
        "session-a",
      ])?.[0].status,
    ).toBe("Present");
    c.sessions["session-a"][0].status = "Late";
    await act(async () => {
      await c.client.refetchQueries({
        queryKey: ["admin-live-attendance", "session-a"],
      });
    });
    c.record(
      "refetch promise resolved; before waiting for committed render",
      originalNode,
    );
    expect(
      c.client.getQueryData<typeof c.fixture.attendance>([
        "admin-live-attendance",
        "session-a",
      ])?.[0].status,
    ).toBe("Late");
    await waitFor(() => expect(c.select(0)).toHaveValue("Late"));
    c.record(
      "server status committed; key reconciliation complete",
      originalNode,
    );
    expect(originalNode.isConnected).toBe(false);
    expect(c.select(0)).not.toBe(originalNode);
    expect(c.row(0)).toHaveTextContent(t.late);
    expect(c.update(0)).toBeDisabled();
    expect(c.select(1)).toHaveValue("Absent");
    expect(c.writes).toEqual([]); // Original failing case never issued a PUT.

    fireEvent.change(c.select(0), { target: { value: "Excused" } });
    const editedNode = c.select(0);
    c.sessions["session-a"][0].joinedAtUtc = "2026-10-29T10:05:00Z";
    await act(async () => {
      await c.client.refetchQueries({
        queryKey: ["admin-live-attendance", "session-a"],
      });
    });
    await waitFor(() =>
      expect(c.row(0)).toHaveTextContent(
        formatLocalizedDateTime("2026-10-29T10:05:00Z", locale),
      ),
    );
    c.record(
      "unrelated timestamp refresh preserves legitimate unsaved draft",
      editedNode,
    );
    expect(c.select(0)).toBe(editedNode);
    expect(c.select(0)).toHaveValue("Excused");
    expect(c.update(0)).toBeEnabled();
    expect(c.select(1)).toHaveValue("Absent");

    fireEvent.change(
      screen.getByLabelText(t.attendanceSession, { selector: "select" }),
      { target: { value: "session-b" } },
    );
    await waitFor(() => expect(c.select(0)).toHaveValue("Present"));
    expect(c.select(1)).toHaveValue("Late");
    expect(c.update(0)).toBeDisabled();
    c.timeline.push({
      step: "different session resets unrelated row drafts",
      session: "session-b",
      itemId: c.sessions["session-b"][0].id,
      itemStatus: c.sessions["session-b"][0].status,
      localDraft: c.select(0).value,
    });
    c.persist("refetch-render");
  });

  it(`traces real mutation callbacks, exact invalidation, pending guards, confirmed status and rejected draft (${locale})`, async () => {
    const c = setup();
    await c.open();
    c.record("initial committed rows");
    fireEvent.change(c.select(0), { target: { value: "Late" } });
    fireEvent.change(c.select(1), { target: { value: "Absent" } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    c.setSave(async () => {
      await gate;
      c.sessions["session-a"][0].status = "Late";
      c.timeline.push({
        step: "PUT resolves; server now committed Late",
        itemId: "attendance-0",
        itemStatus: "Late",
        localDraft: c.select(0).value,
      });
      return {};
    });
    fireEvent.click(c.update(0));
    await waitFor(() => expect(c.writes).toHaveLength(1));
    await waitFor(() => expect(c.update(0)).toBeDisabled());
    c.record("PUT pending; original committed status retained");
    expect(c.select(0)).toBeDisabled();
    expect(
      c.client.getQueryData<typeof c.fixture.attendance>([
        "admin-live-attendance",
        "session-a",
      ])?.[0].status,
    ).toBe("Present");
    expect(screen.queryByText(t.attendanceSaved)).toBeNull();
    fireEvent.click(c.update(0));
    expect(c.writes).toEqual([
      {
        path: attendancePath,
        method: "PUT",
        body: { studentUserId: "student-0", status: "Late" },
      },
    ]);
    await act(async () => {
      release();
      await gate;
    });
    await screen.findByText(t.attendanceSaved);
    await waitFor(() => expect(c.row(0)).toHaveTextContent(t.late));
    c.record(
      "success invalidated exact session and rendered confirmed server status",
    );
    expect(c.invalidations).toHaveBeenCalledTimes(1);
    expect(c.invalidations).toHaveBeenCalledWith({
      queryKey: ["admin-live-attendance", "session-a"],
    });
    expect(c.select(0)).toHaveValue("Late");
    expect(c.update(0)).toBeDisabled();
    expect(c.select(1)).toHaveValue("Absent");

    c.setSave(() =>
      Promise.reject(new Error("Synthetic attendance rejection")),
    );
    fireEvent.change(c.select(0), { target: { value: "Excused" } });
    fireEvent.click(c.update(0));
    await screen.findByText("Synthetic attendance rejection");
    c.record(
      "PUT rejected; committed Late and unsaved Excused remain distinct",
    );
    expect(screen.queryByText(t.attendanceSaved)).toBeNull();
    expect(c.select(0)).toHaveValue("Excused");
    expect(c.update(0)).toBeEnabled();
    expect(c.invalidations).toHaveBeenCalledTimes(1);
    expect(
      c.client.getQueryData<typeof c.fixture.attendance>([
        "admin-live-attendance",
        "session-a",
      ])?.[0].status,
    ).toBe("Late");
    expect(c.select(1)).toHaveValue("Absent");
    expect(c.writes[1]).toEqual({
      path: attendancePath,
      method: "PUT",
      body: { studentUserId: "student-0", status: "Excused" },
    });
    c.persist("mutation-lifecycle");
  });
}
