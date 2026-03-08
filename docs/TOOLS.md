# Tools

## What are tools?

Tools are functions that NOVA can use to do things it can't do by just thinking — like math, reading files, or searching the web.

When you ask NOVA a question, it decides if it can answer from memory or if it needs to use a tool. If it needs a tool, it calls it automatically, reads the result, and writes you a nice answer.

## Built-in tools

### `calculator`

Does math. Supports basic operations, powers, roots, trig, and more.

**Examples:**
- _"What's 15% of 230?"_ → uses `230 * 0.15`
- _"Square root of 144"_ → uses `sqrt(144)`

**Supported:** `+`, `-`, `*`, `/`, `//`, `%`, `**`, `sqrt`, `sin`, `cos`, `tan`, `log`, `log10`, `ceil`, `floor`, `abs`, `pi`, `e`

📁 `tools/calculator.py`

### `get_current_datetime`

Gets the current date and time. You can ask for any timezone.

**Examples:**
- _"What time is it?"_ → current local time
- _"What time is it in Tokyo?"_ → uses timezone `Asia/Tokyo`

📁 `tools/datetime_tool.py`

### `convert_timezone`

Converts a time from one timezone to another.

**Example:** _"Convert 3pm New York time to London time"_

📁 `tools/datetime_tool.py`

### `list_directory`

Lists files and folders in a directory, with sizes and icons.

**Example:** _"What files are in my Downloads folder?"_

📁 `tools/files.py`

### `read_csv`

Reads a CSV file and shows a preview of the data (first and last rows, column types, shape).

**Example:** _"Show me the data in sales.csv"_

📁 `tools/files.py`

### `read_excel`

Reads an Excel (.xlsx) file, same as CSV but for spreadsheets.

**Example:** _"Open the report.xlsx file"_

📁 `tools/files.py`

### `read_text_file`

Reads any plain text file (code, markdown, config files, etc.).

**Example:** _"Read my notes.txt"_ or _"Show me the main.py file"_

📁 `tools/files.py`

## MCP tools (from external servers)

These tools come from external MCP servers configured in `mcp_servers.json`.

### `SearchDocsByLangChain`

Searches the LangChain documentation. Comes from the LangChain Docs MCP server at `https://docs.langchain.com/mcp`.

**Example:** _"How do I create a LangGraph agent?"_

## How to add a new tool

1. Create a function in the `tools/` folder
2. Decorate it with `@tool` from LangChain
3. Write a clear docstring (the AI reads this to know when to use it)
4. Handle errors inside the function (return an error message, don't raise)
5. Register it in `agent/graph.py` → `get_tools()`

**Example:**

```python
from langchain_core.tools import tool

@tool
def my_new_tool(query: str) -> str:
    """Search for something cool. Use this when the user asks about cool things."""
    try:
        result = do_something(query)
        return f"Found: {result}"
    except Exception as e:
        return f"Error: {e}"
```

Then add it to `get_tools()` in `agent/graph.py`:

```python
local: List[BaseTool] = [
    # ... existing tools ...
    my_new_tool,  # ← add here
]
```
