#!/usr/bin/env python3
"""Classify an exact pull-request base/head diff for the docs-only CI path."""

from __future__ import annotations

import json
import os
import subprocess
import sys


def approved_documentation_path(path: str) -> bool:
    if path in {"README.md", "AGENTS.md"}:
        return True
    if not path.startswith("docs/") or "\\" in path or path.startswith("/"):
        return False
    return all(part not in {"", ".", ".."} for part in path.split("/"))


def classify_paths(paths: list[str]) -> bool:
    """Return true only for a known, non-empty set of approved documentation paths."""
    return bool(paths) and all(approved_documentation_path(path) for path in paths)


def set_output(value: bool) -> None:
    output = f"docs_only={'true' if value else 'false'}\n"
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8", newline="\n") as handle:
            handle.write(output)
    else:
        print(output, end="")


def main() -> int:
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    if event_name != "pull_request":
        set_output(False)
        print(f"Event {event_name!r}: full CI required.")
        return 0

    base_sha = os.environ.get("PR_BASE_SHA", "")
    head_sha = os.environ.get("PR_HEAD_SHA", "")
    if not base_sha or not head_sha:
        set_output(False)
        print("Missing pull-request base/head SHA; using full CI.", file=sys.stderr)
        return 1

    try:
        result = subprocess.run(
            ["git", "diff", "--no-renames", "--name-only", "-z", base_sha, head_sha, "--"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        raw_paths = result.stdout.split(b"\0")
        if raw_paths and raw_paths[-1] == b"":
            raw_paths.pop()
        paths = [path.decode("utf-8", errors="strict") for path in raw_paths]
    except (OSError, subprocess.CalledProcessError, UnicodeDecodeError) as error:
        set_output(False)
        print(f"Cannot classify exact pull-request diff; using full CI: {error}", file=sys.stderr)
        return 1

    print("Changed paths (JSON-escaped):")
    for path in paths:
        print(json.dumps(path, ensure_ascii=True))

    docs_only = classify_paths(paths)
    if not paths:
        print("Empty comparison; using full CI.")
    set_output(docs_only)
    print(f"docs_only={'true' if docs_only else 'false'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
