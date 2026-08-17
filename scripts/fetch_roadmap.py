"""Generate a static roadmap snapshot for the UI.

The landing page is deployed as a static bundle with no backend behind it, so
the GitHub Projects V2 board is baked into ``ui/public/roadmap.json`` at build
time. This keeps the token server-side (CI secret) instead of shipping it in
the JavaScript bundle.

Usage:
    uv run python scripts/fetch_roadmap.py [--output PATH] [--allow-failure]

Environment:
    GITHUB_TOKEN           Token with the ``read:project`` scope (required).
    GITHUB_PROJECT_OWNER   Project owner login (default: thisisrobyn).
    GITHUB_PROJECT_NUMBER  Project number (default: 3).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from api.github_roadmap import RoadmapError, fetch_roadmap, get_roadmap_config

DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "ui" / "public" / "roadmap.json"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Where to write the snapshot (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--allow-failure",
        action="store_true",
        help="Exit 0 even if the snapshot cannot be generated (for CI without a token)",
    )
    return parser.parse_args()


async def _run(output: Path) -> int:
    token, owner, number = get_roadmap_config()
    if not token:
        print("GITHUB_TOKEN is not set (needs the read:project scope)", file=sys.stderr)
        return 1

    try:
        roadmap = await fetch_roadmap(token, owner, number)
    except RoadmapError as exc:
        print(f"Failed to fetch roadmap: {exc}", file=sys.stderr)
        return 1

    payload = roadmap.model_dump()
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    total = sum(len(it.items) for it in roadmap.iterations)
    print(
        f"Wrote {output} — {len(roadmap.iterations)} iteration(s), "
        f"{total} item(s) in iterations, {len(roadmap.backlog)} in backlog"
    )
    for iteration in roadmap.iterations:
        print(
            f"  {iteration.title}: {iteration.start_date} -> {iteration.end_date} "
            f"({len(iteration.items)} item(s))"
        )
    return 0


def main() -> int:
    """Entry point for the snapshot generator."""
    args = _parse_args()
    load_dotenv()
    code = asyncio.run(_run(args.output))
    if code != 0 and args.allow_failure:
        print("Continuing without a roadmap snapshot (--allow-failure)", file=sys.stderr)
        return 0
    return code


if __name__ == "__main__":
    raise SystemExit(main())
