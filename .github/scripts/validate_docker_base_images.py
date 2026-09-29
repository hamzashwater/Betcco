#!/usr/bin/env python3
"""Require digest-pinned external bases in production application Dockerfiles."""

from __future__ import annotations

import re
import sys
from pathlib import Path


_DIGEST = re.compile(r"@sha256:[0-9a-fA-F]{64}$")
_PRODUCTION_DOCKERFILES = (
    Path("backend/src/Betcco.Api/Dockerfile"),
    Path("frontend/Dockerfile"),
)


class DockerfileValidationError(ValueError):
    """A production Dockerfile contains an unpinned external base image."""


def _logical_lines(source: str):
    pending = ""
    for line in source.splitlines():
        stripped = line.rstrip()
        if stripped.endswith("\\"):
            pending += stripped[:-1] + " "
            continue
        yield pending + line
        pending = ""
    if pending:
        yield pending


def validate_dockerfile_text(source: str, dockerfile_name: str = "Dockerfile") -> None:
    """Validate external FROM references, allowing prior internal stage aliases."""
    aliases: set[str] = set()

    for line_number, line in enumerate(_logical_lines(source), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        parts = stripped.split(maxsplit=1)
        instruction = parts[0]
        if instruction.upper() != "FROM":
            continue

        tokens = parts[1].split() if len(parts) == 2 else []
        while tokens and tokens[0].startswith("--"):
            tokens.pop(0)
        if not tokens:
            raise DockerfileValidationError(
                f"{dockerfile_name}:{line_number}: FROM is missing an image reference"
            )

        image = tokens[0]
        if image.lower() not in aliases and not _DIGEST.search(image):
            raise DockerfileValidationError(
                f"{dockerfile_name}:{line_number}: external base {image!r} must include "
                "@sha256:<64 hex>"
            )

        if len(tokens) >= 3 and tokens[1].upper() == "AS":
            aliases.add(tokens[2].lower())


def main() -> int:
    repository_root = Path(__file__).resolve().parents[2]
    try:
        for relative_path in _PRODUCTION_DOCKERFILES:
            path = repository_root / relative_path
            validate_dockerfile_text(path.read_text(encoding="utf-8"), str(relative_path))
    except (OSError, DockerfileValidationError) as error:
        print(f"Docker base image validation failed: {error}", file=sys.stderr)
        return 1

    print("production Docker base images are digest-pinned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
