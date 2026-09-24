# Learning Aim Practice — Slice 1

This is a formative BETCCO learning flow. It does not create or modify a formal ASSESS evaluation.

## Academic authority

- A canonical `UnitDefinition` linked to a published `CourseModule` supplies its `LearningAimDefinition` set and order. The delivery `BtecLearningAim` must map one-to-one to those definitions. Missing, duplicate, or foreign mappings fail closed.
- Historical modules without a canonical Unit link continue their existing coursework flow. No identity is inferred from titles or codes.
- The number of aims and learning items is data-driven. Published, non-`LegacyArchived` lessons linked directly to an aim or one of its topics count as content. An aim with no such lesson cannot complete its content stage.

## Completion and release

1. Aim A is unlocked when the published course and Unit are accessible. Each later aim requires every earlier aim to be complete.
2. Practice unlocks only after every published learning item for its aim has a completed `LessonProgress`. A course entitlement, Unit/content release rules, and the assignment's publication and deadline also apply. The API enforces these checks at submission start, upload, and final submit.
3. Teacher review is terminal when an authorized course teacher finalizes a submitted practice with one `TrainingOutcome` and nonempty strengths, gaps, and improvement guidance. Submission alone does not unlock the next aim. `NotYetAchieved` is a recorded formative outcome and also completes the review stage in this slice.
4. An aim is complete when its content is complete **and** its practice has a finalized teacher review with a training outcome. The next aim then unlocks. All aims complete is exposed as learning progress; final Unit completion and Comprehensive Practice are future work.

`CourseAssignmentPurpose.LearningAimPractice` identifies the activity. Existing coursework remains `Coursework`. Practice uses the existing validated, scanned, private submission file pipeline, but stores a separate `TrainingOutcome`; no `EvaluationGrade` or formal criterion result is written. The existing gradebook excludes practice assignments.

The additive migration defaults existing assignments to `Coursework` and leaves existing submissions' training fields null. Its `Down` path drops new training fields and would discard any training reviews recorded after deployment, so rollback requires separate data preservation planning.
