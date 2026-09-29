#!/usr/bin/env python3
"""Focused tests for production Docker base image digest validation."""

import unittest
from pathlib import Path

from validate_docker_base_images import DockerfileValidationError, validate_dockerfile_text


DIGEST = "a" * 64


class DockerBaseImageValidationTests(unittest.TestCase):
    def test_digest_pinned_external_images_are_accepted(self):
        validate_dockerfile_text(
            f"FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:{DIGEST} AS build\n"
            f"FROM node:24-bookworm-slim@sha256:{DIGEST} AS runtime\n"
        )

    def test_internal_stage_references_are_accepted(self):
        validate_dockerfile_text(
            f"FROM node:24-bookworm-slim@sha256:{DIGEST} AS dependencies\n"
            "FROM dependencies AS build\n"
        )

    def test_tag_only_dotnet_base_is_rejected(self):
        with self.assertRaises(DockerfileValidationError):
            validate_dockerfile_text("FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build\n")

    def test_tag_only_node_base_is_rejected(self):
        with self.assertRaises(DockerfileValidationError):
            validate_dockerfile_text("FROM node:24-bookworm-slim AS runtime\n")

    def test_missing_digest_is_rejected(self):
        with self.assertRaises(DockerfileValidationError):
            validate_dockerfile_text("FROM node:24-bookworm-slim\n")

    def test_malformed_digest_is_rejected(self):
        with self.assertRaises(DockerfileValidationError):
            validate_dockerfile_text("FROM node:24-bookworm-slim@sha256:abc\n")

    def test_unresolved_stage_name_is_treated_as_external(self):
        with self.assertRaises(DockerfileValidationError):
            validate_dockerfile_text("FROM dependencies AS build\n")

    def test_real_production_dockerfiles_are_accepted(self):
        repository_root = Path(__file__).resolve().parents[2]
        for relative_path in (
            "backend/src/Betcco.Api/Dockerfile",
            "frontend/Dockerfile",
        ):
            path = repository_root / relative_path
            with self.subTest(path=relative_path):
                validate_dockerfile_text(path.read_text(encoding="utf-8"), relative_path)


if __name__ == "__main__":
    unittest.main()
