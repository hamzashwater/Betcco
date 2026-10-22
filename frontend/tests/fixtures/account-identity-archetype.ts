// Synthetic records in deliberate server order. MOCKED UI-CONTRACT EVIDENCE.
export const identityItems = [
  {
    id: "identity-z",
    displayName: "Zed Operator",
    email: "zed@example.test",
    emailConfirmed: true,
    isFrozen: false,
    mustChangePassword: false,
  },
  {
    id: "identity-frozen",
    displayName: "Alpha Frozen",
    email: "frozen@example.test",
    emailConfirmed: false,
    isFrozen: true,
    mustChangePassword: true,
  },
  {
    id: "identity-pending",
    displayName: "Pending Activation",
    email: "pending@example.test",
    emailConfirmed: false,
    isFrozen: false,
    mustChangePassword: true,
  },
  {
    id: "identity-unconfirmed",
    displayName: "Unconfirmed Operator",
    email: "unconfirmed@example.test",
    emailConfirmed: false,
    isFrozen: false,
    mustChangePassword: false,
  },
  {
    id: "identity-password",
    displayName: "Confirmed Operator",
    email: "confirmed@example.test",
    emailConfirmed: true,
    isFrozen: false,
    mustChangePassword: true,
  },
  {
    id: "identity-a",
    displayName: "Beta Operator",
    email: "beta@example.test",
    emailConfirmed: true,
    isFrozen: false,
    mustChangePassword: false,
  },
  {
    id: "identity-frozen-confirmed",
    displayName: "Frozen Confirmed",
    email: "frozen.confirmed@example.test",
    emailConfirmed: true,
    isFrozen: true,
    mustChangePassword: false,
  },
  {
    id: "identity-long",
    displayName:
      "مسؤول متابعة شؤون المعلمين ومساعدي الإدارة وإدارة هويات الحسابات في المنصة التعليمية",
    email: `${"long.raw.identity.".repeat(10)}@example.test`,
    emailConfirmed: true,
    isFrozen: false,
    mustChangePassword: false,
  },
];
export const identityPage = (items = identityItems, totalCount = 51) => ({
  items,
  totalCount,
});
