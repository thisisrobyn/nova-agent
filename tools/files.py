"""File and directory tools for NOVA.

Provides the agent with the ability to list directory contents, and
read CSV, Excel and plain-text files using Pandas and OpenPyXL.
"""

import logging
import os
from pathlib import Path

import pandas as pd
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

MAX_ROWS_PREVIEW = 20
MAX_FILE_SIZE_MB = 10


def _check_file(path: str) -> Path | str:
    """Validate that a file exists and is not too large.

    Returns the resolved ``Path`` on success, or an error string.
    """
    p = Path(path).resolve()
    if not p.exists():
        return f"Error: file '{path}' not found."
    if not p.is_file():
        return f"Error: '{path}' is not a file."
    size_mb = p.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        return f"Error: file is {size_mb:.1f} MB – exceeds {MAX_FILE_SIZE_MB} MB limit."
    return p


@tool
def list_directory(path: str = ".") -> str:
    """List files and directories at the given path.

    Args:
        path: Directory path to list. Defaults to the current working
            directory.

    Returns:
        A formatted listing of directory contents with type indicators
        and file sizes.
    """
    try:
        target = Path(path).resolve()
        if not target.exists():
            return f"Error: '{path}' does not exist."
        if not target.is_dir():
            return f"Error: '{path}' is not a directory."

        entries = sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
        if not entries:
            return f"Directory '{target}' is empty."

        lines = [f"Directory: {target}", f"Entries: {len(entries)}", ""]
        for entry in entries:
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                lines.append(f"  📁 {entry.name}/")
            else:
                size = entry.stat().st_size
                if size < 1024:
                    size_str = f"{size} B"
                elif size < 1024 * 1024:
                    size_str = f"{size / 1024:.1f} KB"
                else:
                    size_str = f"{size / (1024 * 1024):.1f} MB"
                lines.append(f"  📄 {entry.name}  ({size_str})")
        return "\n".join(lines)
    except Exception as e:
        logger.error("list_directory failed: %s", e)
        return f"Error listing directory: {e}"


@tool
def read_csv(file_path: str, max_rows: int = MAX_ROWS_PREVIEW) -> str:
    """Read a CSV file and return a summary with the first rows.

    Args:
        file_path: Path to the CSV file.
        max_rows: Maximum number of rows to include in the preview.

    Returns:
        A text summary including shape, columns and a data preview.
    """
    try:
        result = _check_file(file_path)
        if isinstance(result, str):
            return result

        df = pd.read_csv(result)
        lines = [
            f"File: {result.name}",
            f"Shape: {df.shape[0]} rows × {df.shape[1]} columns",
            f"Columns: {', '.join(df.columns.tolist())}",
            "",
            f"Preview (first {min(max_rows, len(df))} rows):",
            df.head(max_rows).to_string(index=False),
        ]
        return "\n".join(lines)
    except Exception as e:
        logger.error("read_csv failed: %s", e)
        return f"Error reading CSV: {e}"


@tool
def read_excel(file_path: str, sheet_name: str = "", max_rows: int = MAX_ROWS_PREVIEW) -> str:
    """Read an Excel file (.xlsx) and return a summary with the first rows.

    Args:
        file_path: Path to the Excel file.
        sheet_name: Name of the sheet to read. If empty, reads the first sheet.
        max_rows: Maximum number of rows to include in the preview.

    Returns:
        A text summary including shape, columns, sheet names and a data preview.
    """
    try:
        result = _check_file(file_path)
        if isinstance(result, str):
            return result

        xls = pd.ExcelFile(result, engine="openpyxl")
        target = sheet_name if sheet_name else xls.sheet_names[0]

        if target not in xls.sheet_names:
            return f"Error: sheet '{target}' not found. Available: {', '.join(xls.sheet_names)}"

        df = pd.read_excel(xls, sheet_name=target)
        lines = [
            f"File: {result.name}",
            f"Sheets: {', '.join(xls.sheet_names)}",
            f"Active sheet: {target}",
            f"Shape: {df.shape[0]} rows × {df.shape[1]} columns",
            f"Columns: {', '.join(df.columns.tolist())}",
            "",
            f"Preview (first {min(max_rows, len(df))} rows):",
            df.head(max_rows).to_string(index=False),
        ]
        return "\n".join(lines)
    except Exception as e:
        logger.error("read_excel failed: %s", e)
        return f"Error reading Excel: {e}"


@tool
def read_text_file(file_path: str, max_lines: int = 100) -> str:
    """Read a plain text file and return its contents.

    Args:
        file_path: Path to the text file.
        max_lines: Maximum number of lines to return.

    Returns:
        The file contents (truncated if needed).
    """
    try:
        result = _check_file(file_path)
        if isinstance(result, str):
            return result

        text = result.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        truncated = len(lines) > max_lines
        preview = "\n".join(lines[:max_lines])

        header = f"File: {result.name} ({len(lines)} lines)"
        if truncated:
            header += f" — showing first {max_lines}"
        return f"{header}\n\n{preview}"
    except Exception as e:
        logger.error("read_text_file failed: %s", e)
        return f"Error reading file: {e}"
