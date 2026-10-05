# Required Application quality gate

The Quality workflow has one authoritative required check named **Application quality**. The display name, not the job ID, is the branch-protection contract.

The job graph is `classify → application-quality`. There is no job scheduled after application validation solely to aggregate its result. This removes one runner allocation for application changes and pushes to main. Documentation-only PRs still use two runners: trusted classification and documentation validation.

## Classification and validation paths

Initial PR classification executes `.github/scripts/classify_docs_only.py` from the exact PR base checkout at `.trusted-classifier`. A missing trusted classifier conservatively selects full validation. A failed classifier, missing/invalid boolean output, or an attempt to use the docs path outside a PR fails the required job before checkout or validation steps.

For `docs_only=false`, the same required job executes the complete application validation sequence. Every existing validation retains its commands, environment, pinned actions, and failure behavior. It also runs the lightweight standard-library classifier tests. Steps use GitHub's default `success()` behavior; there is no `continue-on-error` or terminal success-only aggregator.

For `docs_only=true` on a PR, the shared source checkout fetches the full comparison history. A second checkout retrieves the classifier from the exact PR base without persisting credentials. The trusted classifier rechecks the same base/head paths; disagreement or missing output fails. `git diff --check` must then succeed. Full application steps and MinIO setup are skipped. PostgreSQL uses an empty service image on this path, so GitHub does not start the service. On the full path the service retains its original pinned image, port, database credentials, and readiness settings. See [GitHub service-image syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idservicesservice_idimage).

Any required step failure fails **Application quality** in the runner that performs the validation. Cancelled or unassigned jobs are not successful checks. Reducing runner handoffs does not guarantee GitHub-hosted runner availability.

## Focused maintainer validation

From the repository root:

```text
python .github/scripts/test_classify_docs_only.py
python .github/scripts/test_validate_docker_base_images.py
python .github/scripts/test_validate_release_images.py
git diff --check
```

For workflow structure/guard tests, use an isolated tooling environment containing PyYAML (validated with 6.0.3), then run:

```text
<tooling-python> .github/scripts/test_quality_workflow.py
actionlint .github/workflows/quality.yml
```

PyYAML is only a maintainer parser dependency; it is not installed by the workflow or added to application dependency/lock files. The structure tests parse YAML with duplicate-key rejection, execute the actual shell guards, and exercise real good/bad whitespace diffs. Bash is required; `BETCCO_TEST_BASH` may select its executable. Full application commands are checked structurally rather than rerun by these focused tests. The classifier tests are included in the full Quality path; workflow-parser tests remain a separate maintainer check.

After a workflow change, inspect GitHub's generated jobs on the exact PR HEAD. Confirm the single **Application quality** check, the selected validation path, and actual states/step outcomes. Local syntax/tests do not substitute for live runner or integration evidence. Do not retrigger events with cosmetic commits when runners are degraded.

## Independent review and merge boundary

Workflow changes require independent review of the exact HEAD, preserved validation coverage, fail-closed paths, actual generated jobs, and required checks. Do not change branch protection to bypass a blocked check. A CI-fix Draft handoff does not authorize merging or refreshing another PR; those actions belong to the subsequent merge-control process.
