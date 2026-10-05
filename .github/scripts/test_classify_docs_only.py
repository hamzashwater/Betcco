#!/usr/bin/env python3
"""Fail-closed documentation classifier tests; no third-party dependencies."""

import contextlib
import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import classify_docs_only as classifier


class DocumentationClassifierTests(unittest.TestCase):
    def test_allowlisted_documentation(self):
        for path in ("README.md", "AGENTS.md", "docs/CI_QUALITY_GATE.md", "docs/a/b.txt"):
            with self.subTest(path=path):
                self.assertTrue(classifier.approved_documentation_path(path))

    def test_application_and_workflow_paths_are_not_documentation(self):
        for path in (
            ".github/workflows/quality.yml",
            ".github/scripts/classify_docs_only.py",
            "frontend/messages/en.json",
            "backend/src/Betcco.Api/Program.cs",
            "README.md.py",
            "docs-other/a.md",
        ):
            with self.subTest(path=path):
                self.assertFalse(classifier.approved_documentation_path(path))

    def test_empty_and_unsafe_paths_are_not_documentation(self):
        for path in ("", "/docs/a.md", "docs/", "docs//a.md", "docs/./a.md", "docs/../a.md", "docs\\a.md"):
            with self.subTest(path=path):
                self.assertFalse(classifier.approved_documentation_path(path))

    def test_empty_comparison_requires_full_validation(self):
        self.assertFalse(classifier.classify_paths([]))

    def test_mixed_comparison_requires_full_validation(self):
        self.assertFalse(classifier.classify_paths(["docs/a.md", ".github/workflows/quality.yml"]))

    def invoke(self, environment, git_output=b"docs/a.md\0", error=None):
        with tempfile.TemporaryDirectory(prefix="betcco-classifier-test-") as directory:
            output = Path(directory) / "outputs"
            env = {"GITHUB_EVENT_NAME": "pull_request", "PR_BASE_SHA": "base", "PR_HEAD_SHA": "head", "GITHUB_OUTPUT": str(output)}
            env.update(environment)
            stdout, stderr = io.StringIO(), io.StringIO()
            response = subprocess.CompletedProcess([], 0, stdout=git_output, stderr=b"")
            with patch.dict(os.environ, env, clear=True), patch.object(classifier.subprocess, "run", return_value=response, side_effect=error) as run, contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = classifier.main()
            return code, output.read_text(encoding="utf-8"), stdout.getvalue(), run.call_args

    def test_exact_git_diff_uses_base_head_no_renames_and_nul_paths(self):
        code, output, _, call = self.invoke({})
        self.assertEqual(code, 0)
        self.assertEqual(output, "docs_only=true\n")
        self.assertEqual(call.args[0], ["git", "diff", "--no-renames", "--name-only", "-z", "base", "head", "--"])
        self.assertTrue(call.kwargs["check"])

    def test_application_diff_returns_false(self):
        code, output, _, _ = self.invoke({}, b"docs/a.md\0.github/workflows/quality.yml\0")
        self.assertEqual((code, output), (0, "docs_only=false\n"))

    def test_empty_git_diff_returns_false(self):
        code, output, _, _ = self.invoke({}, b"")
        self.assertEqual((code, output), (0, "docs_only=false\n"))

    def test_push_and_dispatch_always_require_full_validation(self):
        for event in ("push", "workflow_dispatch", ""):
            with self.subTest(event=event):
                code, output, _, call = self.invoke({"GITHUB_EVENT_NAME": event})
                self.assertEqual((code, output, call), (0, "docs_only=false\n", None))

    def test_missing_base_or_head_fails_closed(self):
        for missing in ("PR_BASE_SHA", "PR_HEAD_SHA"):
            with self.subTest(missing=missing):
                code, output, _, call = self.invoke({missing: ""})
                self.assertEqual((code, output, call), (1, "docs_only=false\n", None))

    def test_git_failure_fails_closed(self):
        code, output, _, _ = self.invoke({}, error=subprocess.CalledProcessError(128, "git"))
        self.assertEqual((code, output), (1, "docs_only=false\n"))

    def test_os_failure_fails_closed(self):
        code, output, _, _ = self.invoke({}, error=OSError("git unavailable"))
        self.assertEqual((code, output), (1, "docs_only=false\n"))

    def test_invalid_utf8_fails_closed(self):
        code, output, _, _ = self.invoke({}, b"docs/\xff.md\0")
        self.assertEqual((code, output), (1, "docs_only=false\n"))

    def test_unusual_filename_is_printed_as_json_not_shell_code(self):
        name = 'docs/quote"\n$(command).md'
        code, output, stdout, _ = self.invoke({}, name.encode() + b"\0")
        self.assertEqual((code, output), (0, "docs_only=true\n"))
        self.assertIn(json.dumps(name), stdout.splitlines())


if __name__ == "__main__":
    unittest.main()
