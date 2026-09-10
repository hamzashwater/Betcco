# BETCCO data model

```mermaid
erDiagram
  ApplicationUser ||--o{ Enrollment : owns
  LearningTrack ||--o{ Grade : contains
  LearningTrack ||--o{ Specialization : contains
  Specialization ||--o{ Subject : contains
  LearningTrack ||--o{ Course : classifies
  Course ||--o{ CourseModule : contains
  CourseModule ||--o{ Lesson : contains
  Course ||--o{ Enrollment : grants
  Cart ||--o{ CartItem : contains
  Payment ||--o{ Enrollment : confirms
  EvaluationRequest ||--o{ SubmissionFile : includes
  RubricTemplate ||--o{ RubricCriterion : defines
  EvaluationRequest ||--o{ CriterionResult : receives
  EvaluationRequest ||--o| EvaluatorAssignment : assigned
  ApplicationUser ||--o{ Notification : receives
```

Sensitive IDs use UUIDs. Unique indexes cover slugs, cart owner keys, enrollment `(student, course)`, progress `(student, lesson)`, coupons, payment idempotency/provider references, and webhook events. Financial and audit records are retained; they are not soft-deleted or overwritten. The initial migration also configures identity tables, settings, support, notifications, and private uploads.
