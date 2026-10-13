// Synthetic data only. Mocked UI checks do not prove backend access/persistence.
export const supportTarget = {
  id: "raw-account-17",
  displayName: "RAW User اسم المستخدم",
  email: "raw.student@example.invalid",
  isFrozen: false,
};
export const supportSummary = {
  id: "raw-ticket-17",
  subject: "RAW Subject موضوع المستخدم",
  category: "RAW ServerCategory",
  status: "Open",
  createdAtUtc: "2026-09-20T10:00:00Z",
  updatedAtUtc: "2026-09-21T11:00:00Z",
};
export const supportDetail = {
  ...supportSummary,
  messages: [
    {
      id: "raw-message-17",
      body: "RAW learner message\nرسالة الطالب الخام",
      createdAtUtc: "2026-09-20T10:00:00Z",
      isFromCurrentUser: true,
    },
    {
      id: "raw-reply-17",
      body: "RAW support answer\nرد الدعم الخام",
      createdAtUtc: "2026-09-21T11:00:00Z",
      isFromCurrentUser: false,
    },
  ],
};
export const supportList = {
  items: [supportSummary],
  page: 1,
  pageSize: 50,
  totalCount: 1,
};
