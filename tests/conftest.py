"""Project-wide test fixtures.

The API modules default their storage paths to the real ``data/`` directory.
Tests must never touch it — a test run once wiped real chat sessions — so
every path is redirected to a per-test temporary directory before anything
else runs.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def isolate_data_dir(tmp_path, monkeypatch):
    """Keep every test away from the developer's real ``data/`` directory."""
    # Chat session JSON files (api.routes writes them on every turn).
    try:
        from api import routes

        monkeypatch.setattr(routes, "_SESSIONS_DIR", tmp_path / "sessions")
    except Exception:
        pass

    # Databases resolved through environment variables at call time.
    monkeypatch.setenv("MEMORY_DB_PATH", str(tmp_path / "memory.db"))
    monkeypatch.setenv("SCHEDULER_DB_PATH", str(tmp_path / "scheduler.db"))
    monkeypatch.setenv("CHROMA_PERSIST_DIR", str(tmp_path / "chroma"))
    # Connections default is handled per-suite (they also need a fresh
    # encryption key); this is the safety net for everything else.
    monkeypatch.setenv("CONNECTIONS_DB_PATH", str(tmp_path / "connections.db"))
