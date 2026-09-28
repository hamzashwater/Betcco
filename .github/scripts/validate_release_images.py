#!/usr/bin/env python3
"""Validate BETCCO's provider-neutral immutable release artifact contract."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


_SOURCE_SHA = re.compile(r"^[0-9a-fA-F]{40}$")
_IMAGE_REFERENCE = re.compile(
    r"^(?P<name>(?:(?:[a-z0-9]+(?:[.-][a-z0-9]+)*)(?::[0-9]+)?/)?"
    r"[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*)"
    r"@sha256:(?P<digest>[0-9a-fA-F]{64})$"
)


class ContractError(ValueError):
    """An input does not satisfy the immutable release contract."""


def validate_source_commit(source_commit: Any) -> str:
    if not isinstance(source_commit, str) or not _SOURCE_SHA.fullmatch(source_commit):
        raise ContractError("sourceCommit must be a full 40-character hexadecimal Git SHA")
    return source_commit.lower()


def image_digest(image_reference: Any, field_name: str = "image reference") -> str:
    if not isinstance(image_reference, str) or not image_reference:
        raise ContractError(f"{field_name} must not be empty")
    match = _IMAGE_REFERENCE.fullmatch(image_reference)
    if not match:
        raise ContractError(
            f"{field_name} must be a full OCI reference ending in @sha256:<64 hex>"
        )
    return match.group("digest").lower()


def validate_deployment_images(
    api_image: Any, web_image: Any, migration_image: Any, source_commit: Any
) -> None:
    validate_source_commit(source_commit)
    image_digest(api_image, "apiImage")
    image_digest(web_image, "webImage")
    image_digest(migration_image, "migrationImage")
    if migration_image != api_image:
        raise ContractError("migrationImage must exactly equal apiImage")


def _validate_utc_datetime(value: Any, field_name: str) -> None:
    if not isinstance(value, str):
        raise ContractError(f"{field_name} must be an ISO-8601 UTC timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ContractError(f"{field_name} must be an ISO-8601 UTC timestamp") from error
    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
        raise ContractError(f"{field_name} must use UTC")


def _validate_environment_record(record: Any, environment: str) -> None:
    if not isinstance(record, dict):
        raise ContractError(f"{environment} must be an object")
    allowed = {"result", "verifiedAtUtc", "evidenceReference"}
    if set(record) != allowed:
        raise ContractError(f"{environment} must contain only {sorted(allowed)}")

    valid_results = {
        "staging": {"not-run", "passed", "failed"},
        "production": {"not-promoted", "approved", "deployed", "failed"},
    }[environment]
    result = record["result"]
    if not isinstance(result, str) or result not in valid_results:
        raise ContractError(f"{environment}.result must be one of {sorted(valid_results)}")

    verified_at = record["verifiedAtUtc"]
    evidence = record["evidenceReference"]
    if result in {"not-run", "not-promoted"}:
        if verified_at is not None or evidence is not None:
            raise ContractError(f"{environment} cannot claim evidence before it is recorded")
    else:
        _validate_utc_datetime(verified_at, f"{environment}.verifiedAtUtc")
        if not isinstance(evidence, str) or not evidence.strip():
            raise ContractError(f"{environment}.evidenceReference is required for a result")


def validate_manifest(manifest: Any) -> dict[str, Any]:
    if not isinstance(manifest, dict):
        raise ContractError("release manifest must be a JSON object")
    required = {
        "schemaVersion",
        "sourceCommit",
        "apiImage",
        "webImage",
        "migrationImage",
        "createdAtUtc",
        "previousRelease",
        "staging",
        "production",
    }
    if set(manifest) != required:
        raise ContractError(f"release manifest must contain exactly {sorted(required)}")
    if type(manifest["schemaVersion"]) is not int or manifest["schemaVersion"] != 1:
        raise ContractError("schemaVersion must be 1")

    validate_deployment_images(
        manifest["apiImage"],
        manifest["webImage"],
        manifest["migrationImage"],
        manifest["sourceCommit"],
    )
    _validate_utc_datetime(manifest["createdAtUtc"], "createdAtUtc")

    previous = manifest["previousRelease"]
    if previous is not None:
        if not isinstance(previous, dict) or set(previous) != {
            "sourceCommit",
            "apiImage",
            "webImage",
        }:
            raise ContractError(
                "previousRelease must be null or contain sourceCommit, apiImage, and webImage"
            )
        validate_source_commit(previous["sourceCommit"])
        image_digest(previous["apiImage"], "previousRelease.apiImage")
        image_digest(previous["webImage"], "previousRelease.webImage")

    _validate_environment_record(manifest["staging"], "staging")
    _validate_environment_record(manifest["production"], "production")
    return manifest


def validate_same_release(staging: Any, production: Any) -> None:
    staging = validate_manifest(staging)
    production = validate_manifest(production)
    if staging["sourceCommit"].lower() != production["sourceCommit"].lower():
        return
    for image_name in ("apiImage", "webImage"):
        if image_digest(staging[image_name]) != image_digest(production[image_name]):
            raise ContractError(
                f"staging and production {image_name} digests differ for the same sourceCommit"
            )


def _read_manifest(path: str) -> dict[str, Any]:
    try:
        with Path(path).open(encoding="utf-8") as manifest_file:
            return validate_manifest(json.load(manifest_file))
    except (OSError, json.JSONDecodeError) as error:
        raise ContractError(f"cannot read manifest {path}: {error}") from error


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-image", required=True)
    parser.add_argument("--web-image", required=True)
    parser.add_argument("--migration-image", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--staging-manifest")
    parser.add_argument("--production-manifest")
    args = parser.parse_args(argv)

    try:
        validate_deployment_images(
            args.api_image, args.web_image, args.migration_image, args.source_commit
        )
        if bool(args.staging_manifest) != bool(args.production_manifest):
            raise ContractError("provide both staging and production manifests, or neither")
        if args.staging_manifest:
            validate_same_release(
                _read_manifest(args.staging_manifest),
                _read_manifest(args.production_manifest),
            )
    except ContractError as error:
        print(f"release contract validation failed: {error}", file=sys.stderr)
        return 1

    print("release contract validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
