#!/usr/bin/env python3
"""Focused tests for the immutable release artifact contract."""

import unittest

from validate_release_images import (
    ContractError,
    validate_deployment_images,
    validate_manifest,
    validate_same_release,
    validate_source_commit,
)


SHA = "a" * 40
API = "registry.example/betcco/api@sha256:" + "1" * 64
WEB = "registry.example/betcco/web@sha256:" + "2" * 64


def manifest(source=SHA, api=API, web=WEB):
    return {
        "schemaVersion": 1,
        "sourceCommit": source,
        "apiImage": api,
        "webImage": web,
        "migrationImage": api,
        "createdAtUtc": "2026-09-29T12:00:00Z",
        "previousRelease": None,
        "staging": {
            "result": "not-run",
            "verifiedAtUtc": None,
            "evidenceReference": None,
        },
        "production": {
            "result": "not-promoted",
            "verifiedAtUtc": None,
            "evidenceReference": None,
        },
    }


class ReleaseImageContractTests(unittest.TestCase):
    def test_a_digest_pinned_api_and_web_are_accepted(self):
        validate_deployment_images(API, WEB, API, SHA)

    def test_empty_image_references_are_rejected(self):
        with self.assertRaises(ContractError):
            validate_deployment_images("", WEB, "", SHA)

    def test_b_tag_only_references_are_rejected(self):
        with self.assertRaises(ContractError):
            validate_deployment_images("registry.example/betcco/api:v1", WEB, API, SHA)

    def test_c_latest_is_rejected(self):
        with self.assertRaises(ContractError):
            validate_deployment_images("registry.example/betcco/api:latest", WEB, API, SHA)

    def test_d_malformed_digest_is_rejected(self):
        malformed = "registry.example/betcco/api@sha256:" + "f" * 63
        with self.assertRaises(ContractError):
            validate_deployment_images(malformed, WEB, malformed, SHA)

    def test_e_migration_reference_must_exactly_match_api(self):
        other_api = "registry.example/betcco/api@sha256:" + "3" * 64
        with self.assertRaises(ContractError):
            validate_deployment_images(API, WEB, other_api, SHA)

    def test_f_same_release_with_different_environment_digests_is_rejected(self):
        production = manifest(api="registry.example/betcco/api@sha256:" + "4" * 64)
        with self.assertRaises(ContractError):
            validate_same_release(manifest(), production)

    def test_g_identical_digests_across_environments_are_accepted(self):
        staging = manifest()
        production = manifest()
        production["production"] = {
            "result": "deployed",
            "verifiedAtUtc": "2026-09-29T13:00:00Z",
            "evidenceReference": "change-record-123",
        }
        validate_same_release(staging, production)

    def test_h_malformed_source_sha_is_rejected(self):
        for source in ("main", "v1.0", "a" * 39, "g" * 40):
            with self.subTest(source=source), self.assertRaises(ContractError):
                validate_source_commit(source)

    def test_i_full_source_sha_is_accepted_case_insensitively(self):
        self.assertEqual(validate_source_commit("A" * 40), "a" * 40)

    def test_manifest_records_previous_rollback_images_and_evidence_fields(self):
        record = manifest()
        record["previousRelease"] = {
            "sourceCommit": "b" * 40,
            "apiImage": "registry.example/betcco/api@sha256:" + "5" * 64,
            "webImage": "registry.example/betcco/web@sha256:" + "6" * 64,
        }
        record["staging"] = {
            "result": "passed",
            "verifiedAtUtc": "2026-09-29T12:30:00Z",
            "evidenceReference": "staging-run-456",
        }
        validate_manifest(record)

    def test_manifest_rejects_claimed_result_without_evidence(self):
        record = manifest()
        record["staging"] = {
            "result": "passed",
            "verifiedAtUtc": None,
            "evidenceReference": None,
        }
        with self.assertRaises(ContractError):
            validate_manifest(record)


if __name__ == "__main__":
    unittest.main()
