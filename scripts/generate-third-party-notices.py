#!/usr/bin/env python3
"""Create a concise, deterministic third-party inventory from an SPDX SBOM."""

from __future__ import annotations

import json
import pathlib
import sys


def text(value: object, fallback: str = "Not declared") -> str:
    if isinstance(value, str) and value.strip() and value not in {"NOASSERTION", "NONE"}:
        return value.strip()
    return fallback


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: generate-third-party-notices.py INPUT.spdx.json OUTPUT.txt", file=sys.stderr)
        return 2

    source = pathlib.Path(sys.argv[1])
    target = pathlib.Path(sys.argv[2])
    document = json.loads(source.read_text(encoding="utf-8"))
    packages = document.get("packages", [])
    rows: set[tuple[str, str, str, str]] = set()

    for package in packages:
        if not isinstance(package, dict):
            continue
        name = text(package.get("name"), "Unnamed package")
        version = text(package.get("versionInfo"), "Unknown")
        license_name = text(
            package.get("licenseConcluded"),
            text(package.get("licenseDeclared")),
        )
        homepage = text(package.get("homepage"), text(package.get("downloadLocation")))
        rows.add((name, version, license_name, homepage))

    lines = [
        "LessonCue third-party notices",
        "===============================",
        "",
        "This inventory is generated from the SPDX software bill of materials for",
        "the exact release artifacts. LessonCue's PolyForm Noncommercial license",
        "does not replace or restrict the licenses of the third-party components",
        "listed below. Consult the linked upstream project and the accompanying",
        "LessonCue-SBOM.spdx.json for complete package metadata.",
        "",
    ]
    for name, version, license_name, homepage in sorted(rows, key=lambda row: tuple(part.lower() for part in row)):
        lines.extend(
            [
                f"{name} {version}",
                f"  License: {license_name}",
                f"  Source: {homepage}",
                "",
            ]
        )

    target.write_text("\n".join(lines), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
