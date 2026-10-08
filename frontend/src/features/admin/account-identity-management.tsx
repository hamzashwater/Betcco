"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

type ManagedUser = {
  id: string;
  displayName: string;
  email: string;
  emailConfirmed: boolean;
  isFrozen: boolean;
  mustChangePassword: boolean;
};

export function AccountIdentityManagement() {
  const t = useTranslations("adminWorkspace");
  const client = useQueryClient();
  const [role, setRole] = useState<"Teacher" | "SupportAdmin">("Teacher");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [newEmails, setNewEmails] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const users = useQuery({
    queryKey: ["managed-identities", role, page],
    queryFn: () =>
      api<{ items: ManagedUser[]; totalCount: number }>(
        `/admin/users?${new URLSearchParams({ role, page: String(page) })}`,
      ),
  });
  const refresh = () =>
    void client.invalidateQueries({ queryKey: ["managed-identities"] });
  const invite = useMutation({
    mutationFn: () =>
      api<void>("/admin/users/support-admins/invite", {
        method: "POST",
        body: JSON.stringify({ displayName, email }),
      }),
    onSuccess: () => {
      setDisplayName("");
      setEmail("");
      setNotice(t("accountIdentities.inviteSuccess"));
      refresh();
    },
  });
  const changeEmail = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/users/${id}/email-change/request`, {
        method: "POST",
        body: JSON.stringify({ newEmail: newEmails[id] }),
      }),
    onSuccess: (_, id) => {
      setNewEmails((value) => ({ ...value, [id]: "" }));
      setNotice(t("accountIdentities.emailSuccess"));
    },
  });
  const resend = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/users/support-admins/${id}/resend-activation`, {
        method: "POST",
      }),
    onSuccess: () => setNotice(t("accountIdentities.resendSuccess")),
  });
  const freeze = useMutation({
    mutationFn: ({ id, frozen }: { id: string; frozen: boolean }) =>
      api<void>(`/admin/users/${id}/freeze`, {
        method: "POST",
        body: JSON.stringify({ frozen }),
      }),
    onSuccess: refresh,
  });
  const revokeSupportAccess = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/users/support-admins/${id}/revoke-authority`, {
        method: "POST",
      }),
    onSuccess: () => {
      setNotice(t("accountIdentities.revokeSuccess"));
      refresh();
    },
  });

  return (
    <section className="shell min-w-0 py-8">
      <h1 className="text-3xl font-black">{t("accountIdentities.title")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("accountIdentities.description")}
      </p>
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-500/35 p-3 text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["Teacher", "SupportAdmin"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={role === value}
            onClick={() => {
              setRole(value);
              setPage(1);
            }}
            className="focus-ring rounded-xl border border-border px-4 py-2 text-sm font-bold aria-pressed:bg-primary aria-pressed:text-slate-950"
          >
            {value === "Teacher"
              ? t("accountIdentities.teachers")
              : t("accountIdentities.supportAdmins")}
          </button>
        ))}
      </div>
      {role === "SupportAdmin" && (
        <form
          className="card mt-5 grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setNotice("");
            invite.mutate();
          }}
        >
          <label className="grid gap-1 text-sm font-bold">
            <span>{t("accountIdentities.name")}</span>
            <input
              required
              minLength={2}
              maxLength={160}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="focus-ring min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            <span>{t("accountIdentities.email")}</span>
            <input
              type="email"
              required
              maxLength={320}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="focus-ring min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
            />
          </label>
          <button
            disabled={invite.isPending}
            className="focus-ring self-end rounded-xl bg-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60"
          >
            {t("accountIdentities.send")}
          </button>
          {invite.isError && (
            <p role="alert" className="text-sm text-red-600 sm:col-span-3">
              {t("accountIdentities.inviteError")}
            </p>
          )}
        </form>
      )}
      <div className="mt-5 grid gap-3">
        {users.isPending ? (
          <p aria-busy="true">{t("accountIdentities.loading")}</p>
        ) : users.isError ? (
          <p role="alert" className="text-red-600">
            {t("accountIdentities.loadError")}
          </p>
        ) : users.data?.items.length ? (
          users.data.items.map((user) => (
            <article key={user.id} className="card grid min-w-0 gap-3 p-5">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-black">{user.displayName}</h2>
                  <p className="break-all text-sm text-muted" dir="ltr">
                    {user.email}
                  </p>
                  <p className="text-xs text-muted">
                    {user.isFrozen
                      ? t("accountIdentities.frozen")
                      : !user.emailConfirmed
                        ? t("accountIdentities.awaitingActivation")
                        : t("accountIdentities.active")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {role === "SupportAdmin" &&
                    !user.emailConfirmed &&
                    user.mustChangePassword && (
                      <button
                        type="button"
                        disabled={resend.isPending}
                        onClick={() => resend.mutate(user.id)}
                        className="focus-ring rounded-xl border border-border px-3 py-2 text-sm font-bold"
                      >
                        {t("accountIdentities.resend")}
                      </button>
                    )}
                  <button
                    type="button"
                    disabled={freeze.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          user.isFrozen
                            ? t("accountIdentities.reactivateConfirmation")
                            : t("accountIdentities.freezeConfirmation"),
                        )
                      )
                        freeze.mutate({ id: user.id, frozen: !user.isFrozen });
                    }}
                    className="focus-ring rounded-xl border border-border px-3 py-2 text-sm font-bold"
                  >
                    {user.isFrozen
                      ? t("accountIdentities.reactivate")
                      : t("accountIdentities.freeze")}
                  </button>
                </div>
              </div>
              {role === "SupportAdmin" && (
                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    disabled={revokeSupportAccess.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          t("accountIdentities.revokeConfirmation", {
                            name: user.displayName,
                          }),
                        )
                      )
                        revokeSupportAccess.mutate(user.id);
                    }}
                    className="focus-ring rounded-xl border border-red-500/50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-60"
                  >
                    {t("accountIdentities.revoke")}
                  </button>
                </div>
              )}
              <form
                className="flex min-w-0 flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setNotice("");
                  changeEmail.mutate(user.id);
                }}
              >
                <label className="min-w-0 flex-1 text-sm font-bold">
                  <span className="sr-only">
                    {t("accountIdentities.newEmail")}
                  </span>
                  <input
                    type="email"
                    required
                    disabled={user.mustChangePassword || !user.emailConfirmed}
                    maxLength={320}
                    value={newEmails[user.id] ?? ""}
                    onChange={(event) =>
                      setNewEmails((values) => ({
                        ...values,
                        [user.id]: event.target.value,
                      }))
                    }
                    placeholder={t("accountIdentities.newEmail")}
                    className="focus-ring w-full min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
                  />
                </label>
                <button
                  disabled={
                    changeEmail.isPending ||
                    user.mustChangePassword ||
                    !user.emailConfirmed
                  }
                  className="focus-ring rounded-xl bg-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60"
                >
                  {t("accountIdentities.changeEmail")}
                </button>
              </form>
              {(user.mustChangePassword || !user.emailConfirmed) && (
                <p className="text-xs text-muted">
                  {t("accountIdentities.activationRequired")}
                </p>
              )}
            </article>
          ))
        ) : (
          <p className="text-sm text-muted">{t("accountIdentities.empty")}</p>
        )}
        {(changeEmail.isError ||
          freeze.isError ||
          resend.isError ||
          revokeSupportAccess.isError) && (
          <p role="alert" className="text-sm text-red-600">
            {t("accountIdentities.actionError")}
          </p>
        )}
      </div>
      {users.data && (
        <div className="mt-4 flex gap-3 text-sm">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="focus-ring disabled:opacity-50"
          >
            {t("accountIdentities.previous")}
          </button>
          <span>{page}</span>
          <button
            type="button"
            disabled={page * 25 >= users.data.totalCount}
            onClick={() => setPage(page + 1)}
            className="focus-ring disabled:opacity-50"
          >
            {t("accountIdentities.next")}
          </button>
        </div>
      )}
    </section>
  );
}
