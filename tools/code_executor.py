"""Python code execution tool for the NOVA agent.

Runs user-generated Python code in a sandboxed subprocess with:
- Python ``-I`` (isolated mode) to disable user site-packages
- Import blocklist to prevent dangerous operations
- Temp directory as CWD to prevent access to project files
- Configurable timeout via ``CODE_EXEC_TIMEOUT`` env var

The self-healing loop is handled naturally by the LangGraph agent loop:
if execution fails, the error is returned as a tool result and the agent
generates corrected code in the next iteration.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile

import structlog
from langchain_core.tools import tool

logger = structlog.stdlib.get_logger(__name__)

# Modules blocked from being imported in executed code
_BLOCKED_IMPORTS = {
    "shutil", "socket", "http", "urllib", "requests",
    "ctypes", "importlib", "subprocess", "multiprocessing",
    "signal", "os.system", "webbrowser", "ftplib", "smtplib",
    "telnetlib", "xmlrpc", "pathlib",
}

_IMPORT_GUARD = """
import builtins as _builtins
_original_import = _builtins.__import__
_BLOCKED = {blocked}
def _safe_import(name, *args, **kwargs):
    top = name.split('.')[0]
    if top in _BLOCKED:
        raise ImportError(f"Import of '{{name}}' is not allowed in sandboxed execution")
    return _original_import(name, *args, **kwargs)
_builtins.__import__ = _safe_import
del _builtins, _original_import, _safe_import, _BLOCKED
"""


def _get_timeout() -> int:
    """Return execution timeout in seconds from env var."""
    try:
        return int(os.getenv("CODE_EXEC_TIMEOUT", "30"))
    except ValueError:
        return 30


def _is_enabled() -> bool:
    """Check if code execution is enabled."""
    mode = os.getenv("CODE_EXEC_MODE", "subprocess").lower()
    return mode != "disabled"


@tool
def execute_python(code: str) -> str:
    """Execute Python code and return the output.

    Use this tool when:
    - The user asks you to run, execute, or test Python code
    - You need to perform calculations that require actual code execution
    - The user wants to see the output of a script
    - You need to verify that generated code works correctly

    The code runs in a sandboxed environment with restricted imports.
    If execution fails, analyze the error and generate corrected code.

    Args:
        code: The Python code to execute.

    Returns:
        The stdout/stderr output of the execution, or an error message.
    """
    if not _is_enabled():
        return "Code execution is disabled (CODE_EXEC_MODE=disabled)."

    if not code.strip():
        return "Error: No code provided to execute."

    timeout = _get_timeout()

    # Prepend import guard
    guarded_code = _IMPORT_GUARD.format(blocked=repr(_BLOCKED_IMPORTS)) + "\n" + code

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            result = subprocess.run(
                [sys.executable, "-I", "-c", guarded_code],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=tmpdir,
                env={
                    "PATH": os.environ.get("PATH", ""),
                    "PYTHONIOENCODING": "utf-8",
                    # Minimal env -- no project vars leak
                },
            )

            output_parts: list[str] = []

            if result.stdout.strip():
                output_parts.append(result.stdout.strip())

            if result.stderr.strip():
                output_parts.append(f"[stderr]\n{result.stderr.strip()}")

            if result.returncode != 0:
                output_parts.append(f"[exit code: {result.returncode}]")

            if not output_parts:
                return "(no output)"

            output = "\n\n".join(output_parts)
            # Truncate very long output
            if len(output) > 5000:
                output = output[:5000] + "\n\n... (output truncated at 5000 chars)"

            return output

    except subprocess.TimeoutExpired:
        return f"Error: Code execution timed out after {timeout} seconds."
    except Exception as exc:
        logger.error("code execution failed", error=str(exc))
        return f"Error executing code: {str(exc)}"
