import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminArea } from "@/features/admin/admin-area";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import {
  identities,
  invitations,
  students,
  teachers,
} from "./fixtures/admin-users";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en/admin/students",
}));
const clients: QueryClient[] = [];
function mockRead(path: string) {
  if (path.startsWith("/admin/users?role=Student")) return { items: students };
  if (path === "/admin/users?role=Teacher&pageSize=100")
    return { items: teachers, totalCount: teachers.length };
  if (path === "/admin/users/teachers/invitations?pageSize=100")
    return { items: invitations, totalCount: invitations.length };
  if (path.startsWith("/admin/users?"))
    return { items: identities, totalCount: 26 };
  throw new Error(`Unexpected read: ${path}`);
}
function setup(
  locale: "ar" | "en",
  segment: "students" | "teachers" | "account-identities",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const invalidations = vi.spyOn(client, "invalidateQueries");
  const messages = locale === "ar" ? ar : en;
  const t = createTranslator({ locale, messages, namespace: "adminWorkspace" });
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AdminArea segment={[segment]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, client, invalidations, copy: messages.adminWorkspace, t };
}
function card(name: string) {
  return screen.getByText(name, { exact: true }).closest("article")!;
}
function writes() {
  return apiMock.mock.calls.filter(([, options]) => options?.method);
}
function refreshed(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(
    ([options]) => (options as { queryKey: string[] }).queryKey[0],
  );
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((path: string, options?: RequestInit) =>
      Promise.resolve(options?.method ? {} : mockRead(path)),
    );
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});

describe.each(["ar", "en"] as const)(
  "Admin users %s — mocked UI-contract evidence",
  (locale) => {
    describe("StudentManagement", () => {
      it("renders header, raw identities, statuses and encoded search/query key; search clears selection", async () => {
        const { copy, t, client } = setup(locale, "students");
        const s = copy.students;
        await screen.findByText(students[0].displayName);
        expect(screen.getByRole("heading", { name: s.title })).toBeVisible();
        expect(screen.getByText(s.description)).toBeVisible();
        expect(screen.getByLabelText(s.searchLabel)).toHaveAttribute(
          "placeholder",
          s.searchPlaceholder,
        );
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/users?role=Student&pageSize=100&search=",
        );
        expect(
          client.getQueryCache().find({ queryKey: ["admin-students", ""] }),
        ).toBeDefined();
        expect(
          within(card(students[0].displayName)).getByText(s.emailVerified),
        ).toBeVisible();
        expect(
          within(card(students[1].displayName)).getByText(
            `${s.emailUnverified} · ${s.accountFrozen}`,
          ),
        ).toBeVisible();
        for (const student of students)
          expect(screen.getByText(student.email)).toBeVisible();
        fireEvent.click(
          screen.getByLabelText(
            t("students.selectStudent", { name: students[0].displayName }),
          ),
        );
        expect(
          screen.getByRole("button", { name: s.clearSelection }),
        ).toBeVisible();
        const search = "A+B & طالب";
        fireEvent.change(screen.getByLabelText(s.searchLabel), {
          target: { value: search },
        });
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            `/admin/users?role=Student&pageSize=100&search=${encodeURIComponent(search)}`,
          ),
        );
        expect(
          client.getQueryCache().find({ queryKey: ["admin-students", search] }),
        ).toBeDefined();
        expect(
          screen.queryByRole("button", { name: s.clearSelection }),
        ).not.toBeInTheDocument();
      });
      it.each(["loading", "error", "empty"] as const)(
        "keeps the %s state localized",
        async (state) => {
          apiMock.mockImplementation(() =>
            state === "loading"
              ? new Promise(() => {})
              : state === "error"
                ? Promise.reject(new Error("RAW load error"))
                : Promise.resolve({ items: [] }),
          );
          const { copy, container } = setup(locale, "students");
          if (state === "loading")
            expect(
              container.querySelector('[aria-busy="true"]'),
            ).toHaveTextContent(copy.shared.loadingIndicator);
          else
            expect(
              await screen.findByText(
                state === "error"
                  ? copy.students.loadError
                  : copy.students.empty,
              ),
            ).toBeVisible();
        },
      );
      it("preserves bodyless approve and exact freeze/unfreeze payloads", async () => {
        const { copy, invalidations } = setup(locale, "students");
        await screen.findByText(students[0].displayName);
        const s = copy.students;
        fireEvent.click(
          within(card(students[2].displayName)).getByRole("button", {
            name: s.approve,
          }),
        );
        await waitFor(() =>
          expect(writes()).toContainEqual([
            "/admin/users/student-pending/approve",
            { method: "POST" },
          ]),
        );
        fireEvent.click(
          within(card(students[0].displayName)).getByRole("button", {
            name: s.freeze,
          }),
        );
        await waitFor(() =>
          expect(writes()).toContainEqual([
            "/admin/users/student-active/freeze",
            { method: "POST", body: JSON.stringify({ frozen: true }) },
          ]),
        );
        fireEvent.click(
          within(card(students[1].displayName)).getByRole("button", {
            name: s.unfreeze,
          }),
        );
        await waitFor(() =>
          expect(writes()).toContainEqual([
            "/admin/users/student-frozen/freeze",
            { method: "POST", body: JSON.stringify({ frozen: false }) },
          ]),
        );
        await waitFor(() =>
          expect(refreshed(invalidations)).toEqual([
            "admin-students",
            "admin-students",
            "admin-students",
          ]),
        );
      });
      it("blocks frozen reset and blank reasons, sends the untrimmed reason, clears modal/reason and refreshes", async () => {
        const { copy, t, invalidations } = setup(locale, "students");
        await screen.findByText(students[0].displayName);
        const s = copy.students;
        expect(
          within(card(students[1].displayName)).getByRole("button", {
            name: s.resetDevice,
          }),
        ).toBeDisabled();
        const open = () =>
          fireEvent.click(
            within(card(students[0].displayName)).getByRole("button", {
              name: s.resetDevice,
            }),
          );
        open();
        expect(
          screen.getByRole("heading", { name: s.resetTitle }),
        ).toBeVisible();
        expect(
          screen.getByText(
            t("students.resetWarning", { name: students[0].displayName }),
          ),
        ).toBeVisible();
        const reason = screen.getByLabelText(s.resetReason),
          confirm = screen.getByRole("button", { name: s.confirmReset });
        expect(confirm).toBeDisabled();
        fireEvent.change(reason, { target: { value: "   " } });
        expect(confirm).toBeDisabled();
        fireEvent.change(reason, { target: { value: "  RAW reason  " } });
        fireEvent.click(confirm);
        await waitFor(() =>
          expect(writes()).toEqual([
            [
              "/admin/users/student-active/reset-device",
              {
                method: "POST",
                body: JSON.stringify({ reason: "  RAW reason  " }),
              },
            ],
          ]),
        );
        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
        expect(refreshed(invalidations)).toEqual(["admin-students"]);
        open();
        expect(screen.getByLabelText(s.resetReason)).toHaveValue("");
        fireEvent.click(
          screen.getByRole("button", { name: copy.shared.cancel }),
        );
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      it("preserves permanent delete warning, endpoint and students/dashboard invalidations", async () => {
        const { copy, t, invalidations } = setup(locale, "students");
        await screen.findByText(students[0].displayName);
        const s = copy.students;
        fireEvent.click(
          within(card(students[0].displayName)).getByRole("button", {
            name: s.delete,
          }),
        );
        expect(
          screen.getByRole("dialog", { name: s.deleteDialogLabel }),
        ).toBeVisible();
        expect(
          screen.getByText(
            t("students.deleteWarning", { name: students[0].displayName }),
          ),
        ).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: s.confirmDelete }));
        await waitFor(() =>
          expect(writes()).toEqual([
            ["/admin/users/student-active", { method: "DELETE" }],
          ]),
        );
        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
        expect(refreshed(invalidations)).toEqual([
          "admin-students",
          "admin-dashboard",
        ]);
      });
      it.each(["approve", "freeze", "unfreeze", "delete"] as const)(
        "preserves bulk %s partial failure, failed selection and exact invalidations",
        async (action) => {
          apiMock.mockImplementation((path: string, options?: RequestInit) =>
            options?.method
              ? path.includes("student-frozen")
                ? Promise.reject(new Error("RAW failure"))
                : Promise.resolve({})
              : Promise.resolve(mockRead(path)),
          );
          const { copy, t, invalidations } = setup(locale, "students");
          await screen.findByText(students[0].displayName);
          const s = copy.students;
          fireEvent.click(screen.getByLabelText(s.selectAll));
          expect(
            screen.getByText(t("students.selectedCount", { count: 3 })),
          ).toBeVisible();
          fireEvent.click(
            screen.getByRole("button", { name: s[`${action}Selected`] }),
          );
          const dialog = screen.getByRole("dialog", {
            name: s.bulkActions[action],
          });
          expect(
            within(dialog).getByText(
              t(
                action === "delete"
                  ? "students.bulkDeleteWarning"
                  : "students.bulkActionWarning",
                { count: 3 },
              ),
            ),
          ).toBeVisible();
          fireEvent.click(
            within(dialog).getByRole("button", { name: s.confirmAction }),
          );
          await screen.findByText(
            t("students.bulkResult", {
              action: s.bulkActions[action],
              succeeded: 2,
              failed: 1,
            }),
          );
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
          for (const student of students)
            expect(
              screen
                .getByLabelText(
                  t("students.selectStudent", { name: student.displayName }),
                )
                .matches(":checked"),
            ).toBe(student.id === "student-frozen");
          expect(screen.getByLabelText(s.selectAll)).not.toBeChecked();
          const expected = students.map((student) =>
            action === "approve"
              ? [`/admin/users/${student.id}/approve`, { method: "POST" }]
              : action === "delete"
                ? [`/admin/users/${student.id}`, { method: "DELETE" }]
                : [
                    `/admin/users/${student.id}/freeze`,
                    {
                      method: "POST",
                      body: JSON.stringify({ frozen: action === "freeze" }),
                    },
                  ],
          );
          expect(writes()).toEqual(expected);
          expect(refreshed(invalidations)).toEqual(
            action === "delete"
              ? ["admin-students", "admin-dashboard"]
              : ["admin-students"],
          );
        },
      );
      it.each(["reset", "delete"] as const)(
        "keeps raw %s errors ahead of translated fallback",
        async (action) => {
          let raw = true;
          apiMock.mockImplementation((path: string, options?: RequestInit) =>
            options?.method
              ? Promise.reject(
                  raw ? new Error("RAW server message") : "non-Error",
                )
              : Promise.resolve(mockRead(path)),
          );
          const { copy } = setup(locale, "students");
          await screen.findByText(students[0].displayName);
          const s = copy.students;
          fireEvent.click(
            within(card(students[0].displayName)).getByRole("button", {
              name: action === "reset" ? s.resetDevice : s.delete,
            }),
          );
          if (action === "reset")
            fireEvent.change(screen.getByLabelText(s.resetReason), {
              target: { value: "reason" },
            });
          const click = () =>
            fireEvent.click(
              screen.getByRole("button", {
                name: action === "reset" ? s.confirmReset : s.confirmDelete,
              }),
            );
          click();
          expect(await screen.findByText("RAW server message")).toBeVisible();
          raw = false;
          click();
          expect(
            await screen.findByText(
              action === "reset" ? s.resetError : s.deleteError,
            ),
          ).toBeVisible();
        },
      );
    });
    describe("TeacherInvites", () => {
      it("renders counts, raw identities, four lifecycle statuses and conditional localized timestamps", async () => {
        const { copy } = setup(locale, "teachers");
        const c = copy.teacherInvites;
        await screen.findByText(teachers[0].displayName);
        await screen.findByText(invitations[0].displayName);
        expect(screen.getByRole("heading", { name: c.title })).toBeVisible();
        expect(screen.getByText(c.description)).toBeVisible();
        expect(screen.getByText(c.inviteDescription)).toBeVisible();
        expect(
          screen.getByText(c.totalTeachers).parentElement,
        ).toHaveTextContent("2");
        expect(
          screen.getByText(c.activeTeachers).parentElement,
        ).toHaveTextContent("1");
        for (const invite of invitations) {
          const view = within(card(invite.displayName));
          expect(
            view.getByText(
              c.statuses[invite.status as keyof typeof c.statuses],
            ),
          ).toBeVisible();
          expect(view.getByText(invite.email)).toBeVisible();
          const date = formatLocalizedDateTime(invite.createdAtUtc, locale);
          expect(
            view.getByText(`${c.issuedAt}${date} · ${c.expiresAt}${date}`),
          ).toBeVisible();
          if (invite.status === "Accepted")
            expect(view.getByText(`${c.acceptedAt}${date}`)).toBeVisible();
          else
            expect(
              view.queryByText(`${c.acceptedAt}${date}`),
            ).not.toBeInTheDocument();
          if (invite.status === "Revoked")
            expect(view.getByText(`${c.revokedAt}${date}`)).toBeVisible();
          else
            expect(
              view.queryByText(`${c.revokedAt}${date}`),
            ).not.toBeInTheDocument();
        }
      });
      it("keeps invite payload, resets fields and invalidates all four refresh keys", async () => {
        const { copy, invalidations } = setup(locale, "teachers");
        const c = copy.teacherInvites;
        await screen.findByText(teachers[0].displayName);
        const name = screen.getByPlaceholderText(c.namePlaceholder),
          email = screen.getByPlaceholderText(c.emailPlaceholder);
        fireEvent.change(name, { target: { value: "RAW Teacher" } });
        fireEvent.change(email, { target: { value: "raw@example.test" } });
        fireEvent.click(screen.getByRole("button", { name: c.send }));
        expect(await screen.findByText(c.sent)).toBeVisible();
        expect(name).toHaveValue("");
        expect(email).toHaveValue("");
        expect(writes()).toEqual([
          [
            "/admin/users/teachers/invite",
            {
              method: "POST",
              body: JSON.stringify({
                displayName: "RAW Teacher",
                email: "raw@example.test",
              }),
            },
          ],
        ]);
        expect(refreshed(invalidations)).toEqual([
          "admin-dashboard",
          "admin-teachers",
          "teachers-for-evaluation",
          "teacher-invitations",
        ]);
      });
      it("keeps teacher freeze/unfreeze endpoints and refreshes", async () => {
        const { copy, invalidations } = setup(locale, "teachers");
        const c = copy.teacherInvites;
        await screen.findByText(teachers[0].displayName);
        fireEvent.click(
          within(card(teachers[0].displayName)).getByRole("button", {
            name: c.freeze,
          }),
        );
        await waitFor(() =>
          expect(writes()).toContainEqual([
            "/admin/users/teacher-active/freeze",
            { method: "POST", body: JSON.stringify({ frozen: true }) },
          ]),
        );
        fireEvent.click(
          within(card(teachers[1].displayName)).getByRole("button", {
            name: c.activate,
          }),
        );
        await waitFor(() =>
          expect(writes()).toContainEqual([
            "/admin/users/teacher-frozen/freeze",
            { method: "POST", body: JSON.stringify({ frozen: false }) },
          ]),
        );
        await waitFor(() => expect(refreshed(invalidations)).toHaveLength(8));
      });
      it("enforces revocation reason/500 characters, preserves trimming and clears only the submitted reason", async () => {
        const { copy, invalidations } = setup(locale, "teachers");
        const c = copy.teacherInvites;
        await screen.findByText(invitations[0].displayName);
        const first = within(card(invitations[0].displayName)),
          second = within(card(invitations[1].displayName));
        const reason = first.getByPlaceholderText(c.reasonPlaceholder),
          other = second.getByPlaceholderText(c.reasonPlaceholder),
          revoke = first.getByRole("button", { name: c.revoke });
        expect(reason).toHaveAttribute("maxLength", "500");
        expect(revoke).toBeDisabled();
        fireEvent.change(reason, { target: { value: "  " } });
        expect(revoke).toBeDisabled();
        fireEvent.change(other, { target: { value: "keep reason" } });
        fireEvent.change(reason, { target: { value: "  revoke reason  " } });
        fireEvent.click(revoke);
        await waitFor(() => expect(reason).toHaveValue(""));
        expect(other).toHaveValue("keep reason");
        expect(writes()).toEqual([
          [
            "/admin/users/teachers/invitations/invitation-issued/revoke",
            {
              method: "POST",
              body: JSON.stringify({ reason: "revoke reason" }),
            },
          ],
        ]);
        expect(refreshed(invalidations)).toEqual([
          "admin-dashboard",
          "admin-teachers",
          "teachers-for-evaluation",
          "teacher-invitations",
        ]);
      });
      it.each(["loading", "error", "empty"] as const)(
        "localizes teacher/history %s states",
        async (state) => {
          apiMock.mockImplementation(() =>
            state === "loading"
              ? new Promise(() => {})
              : state === "error"
                ? Promise.reject(new Error("RAW error"))
                : Promise.resolve({ items: [], totalCount: 0 }),
          );
          const { copy, container } = setup(locale, "teachers");
          const c = copy.teacherInvites;
          if (state === "loading")
            expect(
              container.querySelectorAll('[aria-busy="true"]'),
            ).toHaveLength(2);
          else
            for (const text of state === "error"
              ? [c.loadError, c.historyError]
              : [c.empty, c.historyEmpty])
              expect(await screen.findByText(text)).toBeVisible();
        },
      );
      it("preserves raw invitation errors and the original English-only non-Error fallback", async () => {
        let raw = true;
        apiMock.mockImplementation((path: string, options?: RequestInit) =>
          options?.method
            ? Promise.reject(raw ? new Error("RAW invite error") : "non-Error")
            : Promise.resolve(mockRead(path)),
        );
        const { copy } = setup(locale, "teachers");
        const c = copy.teacherInvites;
        await screen.findByText(teachers[0].displayName);
        fireEvent.change(screen.getByPlaceholderText(c.namePlaceholder), {
          target: { value: "Teacher" },
        });
        fireEvent.change(screen.getByPlaceholderText(c.emailPlaceholder), {
          target: { value: "teacher@example.test" },
        });
        fireEvent.click(screen.getByRole("button", { name: c.send }));
        expect(await screen.findByText("RAW invite error")).toBeVisible();
        raw = false;
        fireEvent.click(screen.getByRole("button", { name: c.send }));
        expect(await screen.findByText(c.requestError)).toBeVisible();
      });
    });
    describe("AccountIdentityManagement", () => {
      it("preserves default role, role query/key, pagination bounds and reset to page 1 on role switch", async () => {
        const { copy, client } = setup(locale, "account-identities");
        const c = copy.accountIdentities;
        await screen.findByText(identities[0].displayName);
        expect(screen.getByRole("heading", { name: c.title })).toBeVisible();
        expect(screen.getByText(c.description)).toBeVisible();
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/users?role=Teacher&page=1",
        );
        expect(
          client.getQueryCache().find({
            queryKey: ["managed-identities", "Teacher", 1],
          }),
        ).toBeDefined();
        expect(
          screen.getByRole("button", { name: c.teachers }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: c.previous })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: c.next }));
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            "/admin/users?role=Teacher&page=2",
          ),
        );
        expect(
          await screen.findByRole("button", { name: c.next }),
        ).toBeDisabled();
        expect(screen.getByRole("button", { name: c.previous })).toBeEnabled();
        fireEvent.click(screen.getByRole("button", { name: c.supportAdmins }));
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            "/admin/users?role=SupportAdmin&page=1",
          ),
        );
        expect(
          client.getQueryCache().find({
            queryKey: ["managed-identities", "SupportAdmin", 1],
          }),
        ).toBeDefined();
        expect(
          await screen.findByRole("button", { name: c.previous }),
        ).toBeDisabled();
      });
      it("preserves status precedence and email/resend/authority eligibility", async () => {
        const { copy } = setup(locale, "account-identities");
        const c = copy.accountIdentities;
        await screen.findByText(identities[0].displayName);
        expect(
          within(card(identities[0].displayName)).getByText(c.active),
        ).toBeVisible();
        expect(
          within(card(identities[1].displayName)).getByText(c.frozen),
        ).toBeVisible();
        expect(
          within(card(identities[2].displayName)).getByText(
            c.awaitingActivation,
          ),
        ).toBeVisible();
        expect(
          screen.queryByRole("button", { name: c.resend }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: c.revoke }),
        ).not.toBeInTheDocument();
        for (const [index, user] of identities.entries()) {
          const v = within(card(user.displayName));
          expect(v.getByLabelText(c.newEmail).matches(":disabled")).toBe(
            index !== 0,
          );
          expect(
            v.getByRole("button", { name: c.changeEmail }).matches(":disabled"),
          ).toBe(index !== 0);
        }
        fireEvent.click(screen.getByRole("button", { name: c.supportAdmins }));
        await screen.findByRole("button", { name: c.send });
        await screen.findByText(identities[0].displayName);
        for (const user of identities) {
          const v = within(card(user.displayName));
          expect(v.queryByRole("button", { name: c.resend }) !== null).toBe(
            !user.emailConfirmed && user.mustChangePassword,
          );
          expect(v.getByRole("button", { name: c.revoke })).toBeVisible();
        }
      });
      it("preserves support invite limits, payload, notice, clears inputs and refreshes", async () => {
        const { copy, invalidations } = setup(locale, "account-identities");
        const c = copy.accountIdentities;
        await screen.findByText(identities[0].displayName);
        fireEvent.click(screen.getByRole("button", { name: c.supportAdmins }));
        const name = await screen.findByLabelText(c.name),
          email = screen.getByLabelText(c.email);
        expect(name).toBeRequired();
        expect(name).toHaveAttribute("minLength", "2");
        expect(name).toHaveAttribute("maxLength", "160");
        expect(email).toBeRequired();
        expect(email).toHaveAttribute("type", "email");
        expect(email).toHaveAttribute("maxLength", "320");
        fireEvent.change(name, { target: { value: "RAW Support" } });
        fireEvent.change(email, { target: { value: "support@example.test" } });
        fireEvent.click(screen.getByRole("button", { name: c.send }));
        expect(await screen.findByRole("status")).toHaveTextContent(
          c.inviteSuccess,
        );
        expect(name).toHaveValue("");
        expect(email).toHaveValue("");
        expect(writes()).toEqual([
          [
            "/admin/users/support-admins/invite",
            {
              method: "POST",
              body: JSON.stringify({
                displayName: "RAW Support",
                email: "support@example.test",
              }),
            },
          ],
        ]);
        expect(refreshed(invalidations)).toEqual(["managed-identities"]);
      });
      it("keeps email-change payload, per-user input clearing and success notice", async () => {
        const { copy, invalidations } = setup(locale, "account-identities");
        const c = copy.accountIdentities;
        await screen.findByText(identities[0].displayName);
        const first = within(card(identities[0].displayName));
        const input = first.getByLabelText(c.newEmail);
        expect(input).toHaveAttribute("maxLength", "320");
        fireEvent.change(input, { target: { value: "new@example.test" } });
        fireEvent.change(
          within(card(identities[3].displayName)).getByLabelText(c.newEmail),
          { target: { value: "keep@example.test" } },
        );
        fireEvent.click(first.getByRole("button", { name: c.changeEmail }));
        expect(await screen.findByRole("status")).toHaveTextContent(
          c.emailSuccess,
        );
        expect(input).toHaveValue("");
        expect(
          within(card(identities[3].displayName)).getByLabelText(c.newEmail),
        ).toHaveValue("keep@example.test");
        expect(writes()).toEqual([
          [
            "/admin/users/identity-active/email-change/request",
            {
              method: "POST",
              body: JSON.stringify({ newEmail: "new@example.test" }),
            },
          ],
        ]);
        expect(refreshed(invalidations)).toEqual([]);
      });
      it("preserves bodyless resend activation and notice", async () => {
        const { copy, invalidations } = setup(locale, "account-identities");
        const c = copy.accountIdentities;
        await screen.findByText(identities[0].displayName);
        fireEvent.click(screen.getByRole("button", { name: c.supportAdmins }));
        await screen.findByText(identities[2].displayName);
        const resend = await within(card(identities[2].displayName)).findByRole(
          "button",
          { name: c.resend },
        );
        fireEvent.click(resend);
        expect(await screen.findByRole("status")).toHaveTextContent(
          c.resendSuccess,
        );
        expect(writes()).toEqual([
          [
            "/admin/users/support-admins/identity-pending/resend-activation",
            { method: "POST" },
          ],
        ]);
        expect(refreshed(invalidations)).toEqual([]);
      });
      it("preserves freeze/reactivate confirmations, cancellation, inverse payload and refresh", async () => {
        const { copy, invalidations } = setup(locale, "account-identities");
        const c = copy.accountIdentities;
        await screen.findByText(identities[0].displayName);
        vi.mocked(window.confirm).mockReturnValueOnce(false);
        const freeze = within(card(identities[0].displayName)).getByRole(
          "button",
          { name: c.freeze },
        );
        fireEvent.click(freeze);
        expect(writes()).toEqual([]);
        expect(window.confirm).toHaveBeenLastCalledWith(c.freezeConfirmation);
        fireEvent.click(freeze);
        await waitFor(() =>
          expect(writes()).toContainEqual([
            "/admin/users/identity-active/freeze",
            { method: "POST", body: JSON.stringify({ frozen: true }) },
          ]),
        );
        fireEvent.click(
          within(card(identities[1].displayName)).getByRole("button", {
            name: c.reactivate,
          }),
        );
        expect(window.confirm).toHaveBeenLastCalledWith(
          c.reactivateConfirmation,
        );
        await waitFor(() =>
          expect(writes()).toContainEqual([
            "/admin/users/identity-frozen/freeze",
            { method: "POST", body: JSON.stringify({ frozen: false }) },
          ]),
        );
        await waitFor(() =>
          expect(refreshed(invalidations)).toEqual([
            "managed-identities",
            "managed-identities",
          ]),
        );
      });
      it("preserves support-authority confirmation, bodyless endpoint, account-retention notice and refresh", async () => {
        const { copy, t, invalidations } = setup(locale, "account-identities");
        const c = copy.accountIdentities;
        await screen.findByText(identities[0].displayName);
        fireEvent.click(screen.getByRole("button", { name: c.supportAdmins }));
        await screen.findByRole("button", { name: c.send });
        await screen.findByText(identities[0].displayName);
        const revoke = within(card(identities[0].displayName)).getByRole(
          "button",
          { name: c.revoke },
        );
        vi.mocked(window.confirm).mockReturnValueOnce(false);
        fireEvent.click(revoke);
        expect(writes()).toEqual([]);
        expect(window.confirm).toHaveBeenLastCalledWith(
          t("accountIdentities.revokeConfirmation", {
            name: identities[0].displayName,
          }),
        );
        fireEvent.click(revoke);
        expect(await screen.findByRole("status")).toHaveTextContent(
          c.revokeSuccess,
        );
        expect(writes()).toEqual([
          [
            "/admin/users/support-admins/identity-active/revoke-authority",
            { method: "POST" },
          ],
        ]);
        expect(refreshed(invalidations)).toEqual(["managed-identities"]);
      });
      it.each(["loading", "error", "empty"] as const)(
        "localizes identity %s states",
        async (state) => {
          apiMock.mockImplementation(() =>
            state === "loading"
              ? new Promise(() => {})
              : state === "error"
                ? Promise.reject(new Error("RAW error"))
                : Promise.resolve({ items: [], totalCount: 0 }),
          );
          const { copy } = setup(locale, "account-identities");
          const c = copy.accountIdentities;
          expect(
            await screen.findByText(
              state === "loading"
                ? c.loading
                : state === "error"
                  ? c.loadError
                  : c.empty,
            ),
          ).toBeVisible();
        },
      );
      it("preserves translated invite/action errors and notice clearing on the next submission", async () => {
        let fail = false;
        apiMock.mockImplementation((path: string, options?: RequestInit) =>
          options?.method
            ? fail
              ? Promise.reject(new Error("RAW server error"))
              : Promise.resolve({})
            : Promise.resolve(mockRead(path)),
        );
        const { copy } = setup(locale, "account-identities");
        const c = copy.accountIdentities;
        await screen.findByText(identities[0].displayName);
        fireEvent.click(screen.getByRole("button", { name: c.supportAdmins }));
        const send = await screen.findByRole("button", { name: c.send });
        fireEvent.submit(send.closest("form")!);
        expect(await screen.findByRole("status")).toHaveTextContent(
          c.inviteSuccess,
        );
        fail = true;
        fireEvent.submit(send.closest("form")!);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(await screen.findByText(c.inviteError)).toBeVisible();
        fireEvent.click(
          within(card(identities[0].displayName)).getByRole("button", {
            name: c.freeze,
          }),
        );
        expect(await screen.findByText(c.actionError)).toBeVisible();
        expect(screen.queryByText("RAW server error")).not.toBeInTheDocument();
      });
    });
  },
);
