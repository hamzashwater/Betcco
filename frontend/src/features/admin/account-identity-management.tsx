"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { QueryState, MutationOutcome } from "@/components/ui/query-state";
import styles from "./account-identity-management.module.css";

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
    <section className={`shell py-8 ${styles.workspace}`}>
      <h1 className={styles.title}>{t("accountIdentities.title")}</h1>
      <p className={styles.context}>{t("accountIdentities.description")}</p>
      {notice && <MutationOutcome kind="success">{notice}</MutationOutcome>}
      <div className={styles.roles}>
        {(["Teacher", "SupportAdmin"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={role === value}
            onClick={() => {
              setRole(value);
              setPage(1);
            }}
            className={styles.roleControl}
          >
            {value === "Teacher"
              ? t("accountIdentities.teachers")
              : t("accountIdentities.supportAdmins")}
          </button>
        ))}
      </div>
      {role === "SupportAdmin" && (
        <form
          className={styles.invite}
          onSubmit={(event) => {
            event.preventDefault();
            setNotice("");
            invite.mutate();
          }}
        >
          <label className={styles.field}>
            <span>{t("accountIdentities.name")}</span>
            <input
              required
              minLength={2}
              maxLength={160}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{t("accountIdentities.email")}</span>
            <input
              type="email"
              required
              maxLength={320}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button
            disabled={invite.isPending}
            aria-busy={invite.isPending}
            className={styles.primary}
          >
            {t("accountIdentities.send")}
          </button>
          {invite.isError && (
            <QueryState
              kind="error"
              title={t("accountIdentities.inviteError")}
            />
          )}
        </form>
      )}
      <div className={styles.ledger}>
        {users.isPending ? (
          <QueryState kind="loading" title={t("accountIdentities.loading")} />
        ) : users.isError ? (
          <QueryState kind="error" title={t("accountIdentities.loadError")} />
        ) : users.data?.items.length ? (
          users.data.items.map((user) => (
            <article key={user.id} className={styles.row}>
              <div className={styles.identity}>
                <h2 className={styles.name}>{user.displayName}</h2>
                <p className={styles.email} dir="ltr">
                  {user.email}
                </p>
              </div>
              <p
                className={`${styles.status} ${user.isFrozen ? styles.frozen : !user.emailConfirmed ? styles.awaiting : styles.active}`}
              >
                {user.isFrozen
                  ? t("accountIdentities.frozen")
                  : !user.emailConfirmed
                    ? t("accountIdentities.awaitingActivation")
                    : t("accountIdentities.active")}
              </p>
              <div className={styles.primaryActions}>
                {role === "SupportAdmin" &&
                  !user.emailConfirmed &&
                  user.mustChangePassword && (
                    <button
                      type="button"
                      disabled={resend.isPending}
                      aria-busy={resend.isPending}
                      onClick={() => resend.mutate(user.id)}
                      className={styles.secondaryAction}
                    >
                      {t("accountIdentities.resend")}
                    </button>
                  )}
                <button
                  type="button"
                  disabled={freeze.isPending}
                  aria-busy={freeze.isPending}
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
                  className={styles.contextAction}
                >
                  {user.isFrozen
                    ? t("accountIdentities.reactivate")
                    : t("accountIdentities.freeze")}
                </button>
              </div>
              {role === "SupportAdmin" && (
                <div className={styles.revokeControl}>
                  <button
                    type="button"
                    disabled={revokeSupportAccess.isPending}
                    aria-busy={revokeSupportAccess.isPending}
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
                    className={styles.danger}
                  >
                    {t("accountIdentities.revoke")}
                  </button>
                </div>
              )}
              <details className={styles.emailDetail}>
                <summary>{t("accountIdentities.newEmail")}</summary>
                <form
                  className={styles.emailForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    setNotice("");
                    changeEmail.mutate(user.id);
                  }}
                >
                  <label className={styles.emailField}>
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
                    />
                  </label>
                  <button
                    disabled={
                      changeEmail.isPending ||
                      user.mustChangePassword ||
                      !user.emailConfirmed
                    }
                    aria-busy={changeEmail.isPending}
                    className={styles.primary}
                  >
                    {t("accountIdentities.changeEmail")}
                  </button>
                </form>
                {(user.mustChangePassword || !user.emailConfirmed) && (
                  <p className={styles.hint}>
                    {t("accountIdentities.activationRequired")}
                  </p>
                )}
              </details>
            </article>
          ))
        ) : (
          <QueryState kind="empty" title={t("accountIdentities.empty")} />
        )}
        {(changeEmail.isError ||
          freeze.isError ||
          resend.isError ||
          revokeSupportAccess.isError) && (
          <QueryState kind="error" title={t("accountIdentities.actionError")} />
        )}
      </div>
      {users.data && (
        <div className={styles.pagination}>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            {t("accountIdentities.previous")}
          </button>
          <span>{page}</span>
          <button
            type="button"
            disabled={page * 25 >= users.data.totalCount}
            onClick={() => setPage(page + 1)}
          >
            {t("accountIdentities.next")}
          </button>
        </div>
      )}
    </section>
  );
}
