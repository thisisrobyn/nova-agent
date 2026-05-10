# Code Execution Sandbox

## Architecture

Python code runs in a sandboxed subprocess with strict security measures to prevent unauthorized access to the host system.

## Security Model

**Isolated Mode**

The subprocess is launched with the Python `-I` flag (isolated mode), which ignores `PYTHONSTARTUP`, user site-packages, and other environment-dependent paths.

**Import Blocklist**

The following modules are blocked. Any attempt to import them returns an error:

`os`, `subprocess`, `sys`, `shutil`, `socket`, `http`, `urllib`, `requests`, `pathlib`, `signal`, `ctypes`, `importlib`, `pickle`, `shelve`, `glob`, `tempfile`

**Temporary Working Directory**

Each execution runs in a fresh temporary directory that is cleaned up after the execution completes.

**Timeout**

Default: 30 seconds. Configurable via `CODE_EXEC_TIMEOUT` environment variable.

**No Network Access**

Executed code cannot make network requests.

## Tool

```
execute_python(code: str) -> str
```

Located in `tools/code_executor.py`.

## Self-Healing

If code execution fails, the error output is returned to the agent. The agent can then fix the code and retry automatically as part of its ReAct loop. No user intervention is required for simple errors.

## Configuration

| Variable | Values | Default |
|----------|--------|---------|
| `CODE_EXEC_MODE` | `subprocess` (enabled) or `disabled` (tool not loaded) | `subprocess` |
| `CODE_EXEC_TIMEOUT` | Seconds | `30` |

## What Users Can Do

Ask NOVA to write and run Python code for:

- Data analysis and transformation
- Mathematical calculations
- String manipulation
- Algorithm testing and prototyping
- General-purpose computation using safe stdlib modules

## What Is Blocked

- File system access
- Network requests
- System commands
- Package imports beyond safe standard library modules
