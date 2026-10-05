#!/usr/bin/env python3
"""Maintainer checks for the required Quality context and its fail-closed paths.

Uses PyYAML in an isolated validation environment, not an application dependency.
Shell tests execute the actual workflow guards; full application tools are not run.
"""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
FULL_IF = "${{ needs.classify.outputs.docs_only == 'false' }}"
DOCS_IF = "${{ github.event_name == 'pull_request' && needs.classify.outputs.docs_only == 'true' }}"
PG_IMAGE = "pgvector/pgvector:pg16@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b"


class UniqueKeyLoader(yaml.BaseLoader):
    """Parse real YAML, retaining Actions scalars and rejecting duplicate keys."""


def unique_mapping(loader, node):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if key in result:
            raise ValueError(f"Duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node)
    return result


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def load_workflow():
    return yaml.load((ROOT / ".github/workflows/quality.yml").read_text(encoding="utf-8"), Loader=UniqueKeyLoader)


def bash():
    configured = os.environ.get("BETCCO_TEST_BASH")
    git_bash = Path("C:/Program Files/Git/bin/bash.exe")
    return configured or (str(git_bash) if os.name == "nt" and git_bash.is_file() else shutil.which("bash"))


class QualityWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.workflow = load_workflow()
        self.jobs = self.workflow["jobs"]
        self.gate = self.jobs["application-quality"]
        self.steps = self.gate["steps"]

    def named_step(self, name):
        return next(step for step in self.steps if step.get("name") == name)

    def shell(self, script, environment, cwd=None):
        self.assertIsNotNone(bash(), "Bash is required to execute the workflow guards")
        return subprocess.run([bash(), "--noprofile", "--norc", "-eo", "pipefail", "-c", script], env={**os.environ, **environment}, cwd=cwd, capture_output=True, text=True)

    def test_one_authoritative_context_without_a_post_validation_job(self):
        self.assertEqual(set(self.jobs), {"classify", "application-quality"})
        self.assertEqual([job["name"] for job in self.jobs.values()].count("Application quality"), 1)
        self.assertEqual(self.gate["name"], "Application quality")
        self.assertEqual(self.gate["needs"], "classify")
        self.assertEqual(self.gate["if"], "${{ always() }}")
        self.assertEqual(self.gate["runs-on"], "ubuntu-latest")

    def test_permissions_and_events_are_not_privileged(self):
        self.assertEqual(self.workflow["permissions"], {"contents": "read"})
        self.assertEqual(set(self.workflow["on"]), {"push", "pull_request", "workflow_dispatch"})
        for job in self.jobs.values():
            self.assertNotIn("permissions", job)
            self.assertNotIn("continue-on-error", job)

    def test_all_required_steps_fail_normally_and_full_steps_share_the_full_path(self):
        for step in self.steps:
            with self.subTest(step=step.get("name", step.get("uses"))):
                self.assertNotIn("continue-on-error", step)
                self.assertNotIn("always()", step.get("if", ""))
                self.assertNotIn("failure()", step.get("if", ""))
        full_steps = [step for step in self.steps if step.get("if") == FULL_IF]
        self.assertGreater(len(full_steps), 20)
        self.assertEqual(self.steps[-1]["name"], "Verify production API image health endpoints")

    def test_full_validation_coverage_is_present(self):
        commands = {
            "Validate production Docker base image digests": "validate_docker_base_images.py",
            "Test production Docker base image validator": "test_validate_docker_base_images.py",
            "Validate immutable release artifact contract": "test_validate_release_images.py",
            "Test documentation classifier behavior": "test_classify_docs_only.py",
            "Install frontend dependencies": "install --frozen-lockfile",
            "Install Playwright Chromium": "playwright install --with-deps chromium",
            "Frontend format, lint, types and tests": "pnpm --dir frontend test",
            "Build frontend": "pnpm --dir frontend build",
            "Restore .NET tools and dependencies": "--locked-mode",
            "Verify .NET formatting and build": "--verify-no-changes",
            "Apply migrations to an empty PostgreSQL database": "dotnet-ef database update",
            "Verify PostgreSQL backup and isolated restore": "run-postgres-recovery-drill.sh",
            "Verify S3 private-object recovery": "S3PrivateObjectRecoveryTests",
            "Verify Data Protection key-ring recovery": "DataProtectionRecoveryTests",
            "Run .NET tests including required PostgreSQL finance and S3 storage tests": "dotnet test backend/Betcco.sln --no-build --no-restore",
            "Prepare standalone frontend for Playwright": ".next-ci/static",
            "Run public Playwright smoke tests": "tests/e2e/public.spec.ts",
            "Validate Docker compose syntax": "compose.deploy.yml",
            "Build non-root production images": "--tag betcco-web:ci",
            "Verify controlled migration command from the production API image": "betcco-api:ci --migrate",
            "Verify production API image health endpoints": "/health/live",
            "Start private S3-compatible test storage": "mc anonymous set none",
        }
        for name, command in commands.items():
            with self.subTest(name=name):
                step = self.named_step(name)
                self.assertEqual(step["if"], FULL_IF)
                self.assertIn(command, step["run"])
        frontend = self.named_step("Frontend format, lint, types and tests")["run"]
        for command in ("format:check", "lint", "typecheck", "test"):
            self.assertIn(f"pnpm --dir frontend {command}\n", frontend)
        self.assertIn("dotnet tool restore", self.named_step("Restore .NET tools and dependencies")["run"])
        self.assertIn("dotnet build backend/Betcco.sln --no-restore", self.named_step("Verify .NET formatting and build")["run"])
        self.assertIn("--tag betcco-api:ci", self.named_step("Build non-root production images")["run"])

    def test_action_pins_are_preserved(self):
        allowed = {
            "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
            "pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320",
            "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
            "actions/setup-dotnet@26b0ec14cb23fa6904739307f278c14f94c95bf1",
        }
        for job in self.jobs.values():
            for step in job["steps"]:
                if "uses" in step:
                    self.assertIn(step["uses"], allowed)

    def test_postgres_service_is_disabled_for_docs_and_keeps_the_full_contract(self):
        service = self.gate["services"]["postgres"]
        self.assertEqual(service["image"], "${{ needs.classify.result == 'success' && needs.classify.outputs.docs_only == 'false' && '" + PG_IMAGE + "' || '' }}")
        self.assertEqual(service["ports"], ["5432:5432"])
        self.assertEqual(service["env"]["POSTGRES_DB"], "betcco_ci")
        self.assertIn("pg_isready -U betcco_ci -d betcco_ci", service["options"])
        self.assertIn("--health-retries 20", service["options"])

    def test_base_classifier_is_used_for_initial_and_docs_recheck(self):
        for steps in (self.jobs["classify"]["steps"], self.steps):
            trusted = next(step for step in steps if step.get("with", {}).get("path") == ".trusted-classifier")
            self.assertEqual(trusted["with"]["ref"], "${{ github.event.pull_request.base.sha }}")
            self.assertEqual(trusted["with"]["persist-credentials"], "false")
        classifier_step = self.jobs["classify"]["steps"][-1]
        self.assertIn("python3 .trusted-classifier/.github/scripts/classify_docs_only.py", classifier_step["run"])
        self.assertIn('echo "docs_only=false"', classifier_step["run"])
        recheck = self.named_step("Recheck documentation-only allowlist")
        self.assertEqual(recheck["if"], DOCS_IF)
        self.assertEqual(recheck["run"].strip(), "python3 .trusted-classifier/.github/scripts/classify_docs_only.py")
        self.assertEqual(recheck["env"]["PR_BASE_SHA"], "${{ github.event.pull_request.base.sha }}")
        self.assertEqual(recheck["env"]["PR_HEAD_SHA"], "${{ github.event.pull_request.head.sha }}")

    def test_docs_checkout_fetches_the_exact_comparison_history(self):
        checkout = self.steps[1]
        self.assertNotIn("if", checkout)
        self.assertEqual(checkout["with"]["fetch-depth"], "${{ needs.classify.outputs.docs_only == 'true' && '0' || '1' }}")

    def test_classifier_failure_cancel_skip_and_missing_output_fail_closed(self):
        guard = self.steps[0]
        self.assertNotIn("if", guard)
        self.assertEqual(guard["env"], {"EVENT_NAME": "${{ github.event_name }}", "CLASSIFY_RESULT": "${{ needs.classify.result }}", "DOCS_ONLY": "${{ needs.classify.outputs.docs_only }}"})
        for result in ("failure", "cancelled", "skipped", ""):
            for docs_only in ("true", "false", ""):
                with self.subTest(result=result, docs_only=docs_only):
                    self.assertNotEqual(self.shell(guard["run"], {"EVENT_NAME": "pull_request", "CLASSIFY_RESULT": result, "DOCS_ONLY": docs_only}).returncode, 0)
        for output in ("", "TRUE", "False", "unknown"):
            with self.subTest(output=output):
                self.assertNotEqual(self.shell(guard["run"], {"EVENT_NAME": "pull_request", "CLASSIFY_RESULT": "success", "DOCS_ONLY": output}).returncode, 0)

    def test_valid_docs_and_full_paths_are_admitted(self):
        for event, output in (("pull_request", "true"), ("pull_request", "false"), ("push", "false"), ("workflow_dispatch", "false")):
            with self.subTest(event=event, output=output):
                self.assertEqual(self.shell(self.steps[0]["run"], {"EVENT_NAME": event, "CLASSIFY_RESULT": "success", "DOCS_ONLY": output}).returncode, 0)

    def test_push_and_dispatch_cannot_enter_docs_path(self):
        for event in ("push", "workflow_dispatch"):
            self.assertNotEqual(self.shell(self.steps[0]["run"], {"EVENT_NAME": event, "CLASSIFY_RESULT": "success", "DOCS_ONLY": "true"}).returncode, 0)

    def test_docs_recheck_disagreement_and_missing_output_fail_closed(self):
        step = self.named_step("Require the documentation recheck to agree")
        self.assertEqual(step["if"], DOCS_IF)
        self.assertEqual(step["env"]["RECHECK_DOCS_ONLY"], "${{ steps.docs-paths.outputs.docs_only }}")
        for output in ("false", "", "unknown"):
            self.assertNotEqual(self.shell(step["run"], {"RECHECK_DOCS_ONLY": output}).returncode, 0)
        self.assertEqual(self.shell(step["run"], {"RECHECK_DOCS_ONLY": "true"}).returncode, 0)

    def test_docs_whitespace_validation_rejects_a_real_bad_diff(self):
        step = self.named_step("Check documentation diff whitespace")
        self.assertEqual(step["if"], DOCS_IF[:-3] + " && steps.docs-paths.outputs.docs_only == 'true' }}")
        with tempfile.TemporaryDirectory(prefix="betcco-quality-diff-test-") as directory:
            for args in (("init", "--quiet"), ("config", "user.name", "Quality test"), ("config", "user.email", "quality@example.test")):
                subprocess.run(["git", *args], cwd=directory, check=True, capture_output=True)
            document = Path(directory) / "README.md"
            document.write_text("Base\n", encoding="utf-8")
            subprocess.run(["git", "add", "README.md"], cwd=directory, check=True, capture_output=True)
            subprocess.run(["git", "commit", "--quiet", "-m", "Fixture"], cwd=directory, check=True, capture_output=True)
            sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=directory, text=True).strip()
            for text, expected_success in (("Good\n", True), ("Bad trailing whitespace \n", False)):
                with self.subTest(expected_success=expected_success):
                    document.write_text(text, encoding="utf-8")
                    subprocess.run(["git", "add", "README.md"], cwd=directory, check=True, capture_output=True)
                    subprocess.run(["git", "commit", "--quiet", "-m", "Changed fixture"], cwd=directory, check=True, capture_output=True)
                    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=directory, text=True).strip()
                    self.assertEqual(self.shell(step["run"], {"PR_BASE_SHA": sha, "PR_HEAD_SHA": head}, directory).returncode == 0, expected_success)

    def test_step_failure_cannot_be_converted_to_success(self):
        # These conditions retain GitHub's default success() guard. No terminal
        # aggregator, status override or continue-on-error can hide a failed step.
        for step in self.steps:
            if step.get("if") == FULL_IF:
                with self.subTest(step=step.get("name", step.get("uses"))):
                    self.assertNotIn("continue-on-error", step)
                    self.assertEqual(step["if"], FULL_IF)
        self.assertNotIn("continue-on-error", self.gate)
        result = self.shell("false\necho should-not-run", {})
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("should-not-run", result.stdout)

    def test_duplicate_yaml_keys_are_rejected(self):
        with self.assertRaises(ValueError):
            yaml.load("jobs:\n  gate: {}\n  gate: {}\n", Loader=UniqueKeyLoader)


if __name__ == "__main__":
    unittest.main()
