# Tools

## What are tools?

Tools are functions that NOVA can use to do things it can't do by just thinking -- like math, reading files, searching the web, or executing code.

When you ask NOVA a question, it decides if it can answer from memory or if it needs to use a tool. If it needs a tool, it calls it automatically, reads the result, and writes you a nice answer.

NOVA currently has 11 built-in tools, plus any MCP tools from external servers.

## Built-in tools

### `calculator`

Does math. Supports basic operations, powers, roots, trig, and more.

**Examples:**
- _"What's 15% of 230?"_ -> uses `230 * 0.15`
- _"Square root of 144"_ -> uses `sqrt(144)`

**Supported:** `+`, `-`, `*`, `/`, `//`, `%`, `**`, `sqrt`, `sin`, `cos`, `tan`, `log`, `log10`, `ceil`, `floor`, `abs`, `pi`, `e`

File: `tools/calculator.py`

### `get_current_datetime`

Gets the current date and time. You can ask for any timezone.

**Examples:**
- _"What time is it?"_ -> current local time
- _"What time is it in Tokyo?"_ -> uses timezone `Asia/Tokyo`

File: `tools/datetime_tool.py`

### `convert_timezone`

Converts a time from one timezone to another.

**Example:** _"Convert 3pm New York time to London time"_

File: `tools/datetime_tool.py`

### `list_directory`

Lists files and folders in a directory, with sizes and icons.

**Example:** _"What files are in my Downloads folder?"_

File: `tools/files.py`

### `read_csv`

Reads a CSV file and shows a preview of the data (first and last rows, column types, shape).

**Example:** _"Show me the data in sales.csv"_

File: `tools/files.py`

### `read_excel`

Reads an Excel (.xlsx) file, same as CSV but for spreadsheets.

**Example:** _"Open the report.xlsx file"_

File: `tools/files.py`

### `read_text_file`

Reads any plain text file (code, markdown, config files, etc.).

**Example:** _"Read my notes.txt"_ or _"Show me the main.py file"_

File: `tools/files.py`

### `rag_search`

Searches the knowledge base (uploaded documents) for relevant information. Uses ChromaDB vector similarity search with nomic-embed-text embeddings.

**Example:** _"What does the contract say about termination?"_ (after uploading the contract PDF)

File: `tools/rag_tool.py`

### `web_search`

Searches the web for current information. Uses Tavily (if API key is set) or DuckDuckGo as a free fallback.

**Examples:**
- _"What's the latest version of Python?"_
- _"News about AI regulation"_

File: `tools/web_search.py`

### `execute_python`

Executes Python code in a sandboxed subprocess. Supports math, data processing, and algorithms. Blocked operations: file system access, network calls, system calls.

**Examples:**
- _"Calculate the fibonacci sequence up to 100"_
- _"Sort this list of numbers"_

File: `tools/code_executor.py`

Conditionally loaded: only available when `CODE_EXEC_MODE` is not set to `"disabled"`.

### `count_conversation_tokens`

Counts the tokens in the current conversation. Useful for tracking usage.

File: `tools/conversation_tokens.py`

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
5. Register it in `agent/graph.py` -> `get_tools()`

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
    my_new_tool,  # <- add here
]
```
