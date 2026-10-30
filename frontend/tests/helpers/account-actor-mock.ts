import type { Page } from "@playwright/test";

export const accountIds = {
  Student: "00000000-0000-0000-0000-000000000001",
  Teacher: "00000000-0000-0000-0000-000000000002",
  SystemAdmin: "00000000-0000-0000-0000-000000000003",
  SupportAdmin: "00000000-0000-0000-0000-000000000004",
} as const;
type Actor = "Student" | "SystemAdmin" | "SupportAdmin";
type Operation = "email" | "invite" | "freeze";

// Scoped UI fixture, aligned with AdminUsersController and the permission map.
// Real cookie/MFA/CSRF/SQL enforcement is covered independently by HTTP tests.
export async function mockAccountActor(page: Page, actor: Actor) {
  const csrf = "account-actor-test-token";
  const failures = new Set<Operation>();
  const calls: {
    path: string;
    method: string;
    status: number;
    body: unknown;
  }[] = [];
  const frozen = new Map<string, boolean>();
  const manage = actor === "SystemAdmin";
  const mayFreeze = manage || actor === "SupportAdmin";
  const users = [
    {
      id: accountIds.Teacher,
      displayName: "Teacher One",
      email: "teacher@example.com",
      role: "Teacher",
    },
    {
      id: accountIds.Student,
      displayName: "Student One",
      email: "student@example.com",
      role: "Student",
    },
    {
      id: accountIds.SupportAdmin,
      displayName: "Support One",
      email: "existing-support@example.com",
      role: "SupportAdmin",
    },
    {
      id: accountIds.SystemAdmin,
      displayName: "System One",
      email: "system@example.com",
      role: "SystemAdmin",
    },
  ];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    const method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    const reply = (status: number, json?: unknown) => {
      calls.push({ path, method, status, body });
      return route.fulfill(
        status === 204 ? { status } : { status, json: json ?? {} },
      );
    };
    const fail = (operation: Operation) => failures.delete(operation);
    if (path === "/api/v1/security/antiforgery")
      return reply(200, { token: csrf });
    if (path === "/api/v1/auth/me")
      return reply(200, {
        id: accountIds[actor],
        roles: [actor],
        displayName:
          actor === "Student"
            ? "Sam Learner"
            : actor === "SystemAdmin"
              ? "System One"
              : "Support One",
        requiresMfaEnrollment: false,
      });
    const managedPath =
      path === "/api/v1/admin/users" ||
      path === "/api/v1/admin/users/support-admins/invite" ||
      /^\/api\/v1\/admin\/users\/[^/]+\/email-change\/request$/.test(path);
    const freezePath =
      path === "/api/v1/admin/users/freeze-targets" ||
      /^\/api\/v1\/admin\/users\/[^/]+\/freeze$/.test(path);
    if (managedPath || freezePath) {
      const expectedMethod =
        path === "/api/v1/admin/users" || path.endsWith("/freeze-targets")
          ? "GET"
          : "POST";
      if (method !== expectedMethod) return reply(405);
      // Authorization middleware precedes MVC's antiforgery filter.
      if ((managedPath && !manage) || (freezePath && !mayFreeze))
        return reply(403);
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      request.headers()["x-csrf-token"] !== csrf
    )
      return reply(400, { message: "Antiforgery token required" });
    if (path === "/api/v1/auth/profile")
      return reply(200, {
        displayName: "Sam Learner",
        email: "old@example.com",
        phone: null,
        marketingConsent: false,
      });
    if (path === "/api/v1/memberships/me")
      return reply(200, { memberships: [], subscriptions: [] });
    if (path === "/api/v1/notifications") return reply(200, []);
    if (path === "/api/v1/cart") return reply(200, { items: [] });
    if (path === "/api/v1/taxonomy")
      return reply(200, {
        tracks: [],
        grades: [],
        specializations: [],
        subjects: [],
      });
    if (path === "/api/v1/settings/public") return reply(200, {});
    if (path === "/api/v1/auth/email-change/request")
      return reply(actor === "Student" ? 202 : 403);
    if (path === "/api/v1/auth/email-change/confirm")
      return reply(actor === "Student" ? 204 : 403);
    if (path === "/api/v1/admin/users") {
      if (!manage) return reply(403);
      const items = users
        .filter(
          (user) =>
            user.role === url.searchParams.get("role") &&
            user.id !== accountIds[actor],
        )
        .map((user) => ({
          ...user,
          emailConfirmed: true,
          mustChangePassword: false,
          isFrozen: frozen.get(user.id) ?? false,
        }));
      return reply(200, {
        items,
        totalCount: items.length,
        page: 1,
        pageSize: 25,
      });
    }
    if (path === "/api/v1/admin/users/freeze-targets") {
      if (!mayFreeze) return reply(403);
      const role = url.searchParams.get("role");
      if (role !== "Student" && role !== "Teacher") return reply(400);
      const items = users
        .filter((user) => user.role === role)
        .map((user) => ({ ...user, isFrozen: frozen.get(user.id) ?? false }));
      return reply(200, {
        items,
        totalCount: items.length,
        page: 1,
        pageSize: 25,
      });
    }
    if (path === "/api/v1/admin/users/support-admins/invite") {
      if (!manage) return reply(403);
      if (users.some((user) => user.email === body.email)) return reply(409);
      if (fail("invite"))
        return reply(500, { message: "Synthetic invitation failure" });
      return reply(202, { id: "00000000-0000-0000-0000-000000000005" });
    }
    const managed = path.match(
      /^\/api\/v1\/admin\/users\/([^/]+)\/email-change\/request$/,
    );
    if (managed) {
      if (!manage) return reply(403);
      const target = users.find((user) => user.id === managed[1]);
      if (
        !target ||
        target.id === accountIds[actor] ||
        !["Teacher", "SupportAdmin"].includes(target.role)
      )
        return reply(404);
      if (fail("email"))
        return reply(500, { message: "Synthetic email failure" });
      return reply(202, { message: "Sent" });
    }
    const freeze = path.match(/^\/api\/v1\/admin\/users\/([^/]+)\/freeze$/);
    if (freeze) {
      if (!mayFreeze) return reply(403);
      const target = users.find((user) => user.id === freeze[1]);
      if (!target || target.id === accountIds[actor]) return reply(400);
      if (!manage && !["Student", "Teacher"].includes(target.role))
        return reply(404);
      if (fail("freeze"))
        return reply(500, { message: "Synthetic freeze failure" });
      frozen.set(target.id, body.frozen);
      return reply(204);
    }
    return reply(404, { message: "Unmocked account route" });
  });
  return {
    actor,
    calls,
    failNext: (operation: Operation) => failures.add(operation),
  };
}

export async function deniedManagementStatuses(page: Page) {
  return page.evaluate(
    async ({ teacher }) => {
      const { token } = await (
        await fetch("/api/v1/security/antiforgery")
      ).json();
      return Promise.all(
        [
          ["/api/v1/admin/users?role=Teacher", undefined],
          [
            `/api/v1/admin/users/${teacher}/email-change/request`,
            { newEmail: "forbidden@example.com" },
          ],
          [
            "/api/v1/admin/users/support-admins/invite",
            { displayName: "Forbidden", email: "forbidden@example.com" },
          ],
        ].map(
          async ([path, body]) =>
            (
              await fetch(
                path as string,
                body
                  ? {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-TOKEN": token,
                      },
                      body: JSON.stringify(body),
                    }
                  : undefined,
              )
            ).status,
        ),
      );
    },
    { teacher: accountIds.Teacher },
  );
}
