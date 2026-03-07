# NOVA Tools

This document describes in detail each tool available to the NOVA agent, how they are implemented, and how they interact with the LangGraph graph.

## How Tools Work

### Registration and Binding

Tools are defined with the LangChain `@tool` decorator in the `tools/` directory. Each decorated function is automatically converted into a `BaseTool` object with:

- **Name**: derived from the function name.
- **Description**: extracted from the docstring (the LLM reads it to decide when to use the tool).
- **JSON Schema**: automatically generated from the parameter type hints.

In `agent/graph.py`, the `get_tools()` function collects all tools and returns them as a list. This list is used for:

1. **`bind_tools()`** in the `agent_node`: binds the tools to the LLM so it can decide when to call them.
2. **`ToolNode(tools)`**: creates the node that executes the tools when the LLM requests them.

### Execution Flow

```
LLM decides to use calculator("sqrt(144)")
         │
         ▼
AIMessage with tool_calls: [{name: "calculator", args: {expression: "sqrt(144)"}}]
         │
         ▼
Router (should_use_tools) → detects tool_calls → sends to tool_node
         │
         ▼
ToolNode executes calculator.invoke({expression: "sqrt(144)"})
         │
         ▼
ToolMessage(content="12.0", name="calculator")
         │
         ▼
Returns to agent_node → LLM reads the result → formulates final response
```

---

## calculator

**Module**: `tools/calculator.py`

**Purpose**: safely evaluate mathematical expressions.

**Implementation**: uses `ast.parse()` to convert the expression into a Python Abstract Syntax Tree (AST), then recursively evaluates only the allowed nodes. Does not use `eval()` or `exec()`.

**Supported operators**: `+`, `-`, `*`, `/`, `//`, `%`, `**`

**Available functions**: `sqrt`, `sin`, `cos`, `tan`, `log`, `log10`, `ceil`, `floor`, `abs`

**Constants**: `pi`, `e`

**Agent usage**:
```
User: "What is 15 * 7 + the square root of 81?"
LLM → calculator(expression="15 * 7 + sqrt(81)")
Result: "114.0"
```

---

## get_current_datetime

**Module**: `tools/datetime_tool.py`

**Purpose**: get the current date and time in any timezone.

**Implementation**: uses `datetime.now()` with `ZoneInfo` for IANA timezones.

**Parameters**:
- `timezone_name` (default: `"UTC"`): IANA timezone name (e.g., `"Europe/Madrid"`, `"US/Eastern"`, `"Asia/Tokyo"`).

**Agent usage**:
```
User: "What time is it in Madrid?"
LLM → get_current_datetime(timezone_name="Europe/Madrid")
Result: "2026-03-07 19:55:48 CET (UTC+0100)"
```

---

## convert_timezone

**Module**: `tools/datetime_tool.py`

**Purpose**: convert a time from one timezone to another.

**Parameters**:
- `time_str`: time in `"HH:MM"` or `"YYYY-MM-DD HH:MM:SS"` format.
- `from_tz` (default: `"UTC"`): source timezone.
- `to_tz` (default: `"Europe/Madrid"`): destination timezone.

---

## list_directory

**Module**: `tools/files.py`

**Purpose**: list files and folders in a directory.

**Implementation**: uses `pathlib.Path.iterdir()`. Displays icons (📁/📄), names, and sizes. Hides files starting with `.`.

**Parameters**:
- `path` (default: `"."`): directory path. Defaults to the current working directory.

**Agent usage**:
```
User: "What files are in the project?"
LLM → list_directory(path=".")
Result: list of folders and files in the current directory
```

---

## read_csv

**Module**: `tools/files.py`

**Purpose**: read a CSV file and return a summary with a row preview.

**Implementation**: uses `pandas.read_csv()`. Returns the name, dimensions, columns, and the first rows as a formatted table.

**Parameters**:
- `file_path`: path to the CSV file.
- `max_rows` (default: `20`): maximum number of rows in the preview.

**Validations**: file existence, regular file check, maximum size of 10 MB.

---

## read_excel

**Module**: `tools/files.py`

**Purpose**: read an Excel file (.xlsx) and return a summary.

**Implementation**: uses `pandas.read_excel()` with the `openpyxl` engine. Shows available sheets, active sheet, dimensions, and preview.

**Parameters**:
- `file_path`: path to the Excel file.
- `sheet_name` (default: `""`): sheet name. If empty, reads the first sheet.
- `max_rows` (default: `20`): maximum number of rows in the preview.

---

## read_text_file

**Module**: `tools/files.py`

**Purpose**: read plain text files (source code, configuration, logs, etc.).

**Implementation**: uses `pathlib.Path.read_text()` with UTF-8 encoding.

**Parameters**:
- `file_path`: path to the file.
- `max_lines` (default: `100`): maximum number of lines to return.

---

## Adding New Tools

To add a new tool:

1. Create the function in `tools/` with the `@tool` decorator:
   ```python
   from langchain_core.tools import tool

   @tool
   def my_tool(parameter: str) -> str:
       """Clear description of what the tool does.

       Args:
           parameter: description of the parameter.

       Returns:
           The result as a string.
       """
       try:
           # logic
           return result
       except Exception as e:
           return f"Error: {e}"
   ```

2. Register it in `agent/graph.py` inside `get_tools()`:
   ```python
   from tools.my_module import my_tool

   def get_tools():
       return [
           ...,
           my_tool,
       ]
   ```

3. If you want to expose it via MCP, also add it in `nova_mcp/server.py`.

**Conventions**:
- Google-style docstring (the LLM reads it to decide when to use the tool).
- Type hints on all parameters.
- Catch exceptions internally — never propagate to the agent.
- Always return `str` (the LLM works with text).
