# Resit commerce and payment contract (L12)

## Identity and price

A Resit is identified by `ResitAuthorization.ResitEvaluationRequestId == EvaluationRequest.Id`. An activated authorization must retain its original request for the same student. The activation service persists `AssessmentPricing.StandardEvaluationPrice` (currently `5.000 JOD`) on the new Evaluation request. Checkout reads that persisted price and currency; the browser cannot submit either value.

## Checkout and settlement

A Resit never consumes an `IncludedEvaluationEntitlement`, including on credit replay. An inconsistent historical credit linked to a Resit requires reconciliation. A Resit checkout requires the owned activated Draft, first attempt, a clean file, and its attempt-matched authenticity declaration. It uses `Payment.Purpose = "Evaluation"` and `ReferenceId = Resit EvaluationRequest.Id`.

One processing Evaluation payment is reused for the same request. PostgreSQL locks the Evaluation row during payment creation; the in-process gate covers the InMemory provider. Provider session recovery remains authoritative when the outcome is unknown. Trusted confirmation checks the payment reference, owner, local state, monetary snapshot, and Resit relationship before advancing to `PendingAssignment`. Provider success that cannot be safely finalized is retained for reconciliation.

Safe cancellation and definite failure return `PendingPayment` to `Draft`, allowing a new checkout key. An unresolved provider session or reconciliation case does not unlock a new attempt.

## Refund limitation

Resit refunds require manual finance review. Internal refund recording and PayTabs provider initiation reject a Resit before accounting or provider side effects with `RESIT_REFUND_REVIEW_REQUIRED`. Evaluation-purpose PayTabs refunds are also blocked before provider execution because the existing refund accounting only supports `CourseCart`. A Resit refund never changes an included Unit credit or course access. Automated Evaluation refund accounting needs a separate approved policy; this slice adds no schema or migration and does not enable PayTabs partial refunds.
