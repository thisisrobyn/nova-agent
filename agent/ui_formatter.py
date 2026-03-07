"""CLI output formatter with ANSI colour support.

Provides ``CLIFormatter`` — a collection of static methods for printing
coloured headers, messages, token stats and session summaries to the
terminal.  Automatically detects colour support across platforms.
"""

import io
import os
import sys
from datetime import datetime
from typing import Any, Dict, Optional

# Detect if we're in PowerShell and disable colors
_IS_POWERSHELL = "PSModulePath" in os.environ
_DISABLE_COLORS = _IS_POWERSHELL or os.environ.get("NO_COLOR") is not None

# Force unbuffered output for better PowerShell compatibility
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(line_buffering=True, write_through=True)
    except:
        pass

class Colors:
    """ANSI color codes for terminal output."""
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    
    # Text colors
    BLACK = "\033[30m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    
    # Bright colors
    BRIGHT_BLACK = "\033[90m"
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_WHITE = "\033[97m"
    
    # Background colors
    BG_BLACK = "\033[40m"
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_YELLOW = "\033[43m"
    BG_BLUE = "\033[44m"
    BG_MAGENTA = "\033[45m"
    BG_CYAN = "\033[46m"
    BG_WHITE = "\033[47m"


class CLIFormatter:
    """Formats CLI output with colors and structure."""
    
    # For PowerShell, always disable colors to avoid buffering issues
    # For other terminals, enable only if explicitly requested
    SUPPORTS_COLOR = (not _DISABLE_COLORS) and (
        os.environ.get("FORCE_COLOR") is not None or
        os.environ.get("COLORTERM") is not None
    )
    
    @staticmethod
    def _colorize(text: str, color: str) -> str:
        """Apply color to text if supported."""
        if not CLIFormatter.SUPPORTS_COLOR:
            return text
        return f"{color}{text}{Colors.RESET}"
    
    @staticmethod
    def _safe_print(text: str) -> None:
        """Safely print text with proper flushing."""
        try:
            print(text, flush=True)
        except:
            try:
                print(text)
                sys.stdout.flush()
            except:
                pass
    
    @staticmethod
    def print_header() -> None:
        """Print the NOVA CLI header."""
        lines = [
            "",
            CLIFormatter._colorize("  NOVA - Neural Orchestration & Agent", Colors.BRIGHT_CYAN),
            CLIFormatter._colorize("  type 'exit' to quit", Colors.BRIGHT_BLACK),
            "",
        ]
        CLIFormatter._safe_print("\n".join(lines))
    
    @staticmethod
    def print_separator(char: str = "-", width: int = 60) -> None:
        """Print a separator line."""
        sep = char * width
        CLIFormatter._safe_print(CLIFormatter._colorize(sep, Colors.BRIGHT_BLACK))
    
    @staticmethod
    def print_user_message(message: str) -> None:
        """Format and print a user message."""
        prefix = CLIFormatter._colorize("You", Colors.BRIGHT_BLUE)
        msg = CLIFormatter._colorize(message, Colors.WHITE)
        CLIFormatter._safe_print(f"{prefix}\n{msg}")
    
    @staticmethod
    def print_nova_message(message: str) -> None:
        """Format and print a NOVA response."""
        prefix = CLIFormatter._colorize("NOVA", Colors.BRIGHT_GREEN)
        msg = CLIFormatter._colorize(message, Colors.WHITE)
        CLIFormatter._safe_print(f"\n{prefix}\n{msg}")
    
    @staticmethod
    def print_token_info(token_usage: Optional[Dict[str, int]]) -> None:
        """Display token usage information."""
        if not token_usage:
            return
        
        prompt_tokens = token_usage.get('prompt_tokens', 0)
        completion_tokens = token_usage.get('completion_tokens', 0)
        total_tokens = token_usage.get('total_tokens', 0)
        
        token_bar = "█" * (total_tokens // 5) if total_tokens > 0 else ""
        
        token_str = (
            f"{CLIFormatter._colorize('📊 Tokens:', Colors.BRIGHT_YELLOW)} "
            f"{CLIFormatter._colorize(f'{prompt_tokens}', Colors.CYAN)} prompt + "
            f"{CLIFormatter._colorize(f'{completion_tokens}', Colors.MAGENTA)} completion = "
            f"{CLIFormatter._colorize(f'{total_tokens}', Colors.BRIGHT_YELLOW)}"
        )
        CLIFormatter._safe_print(token_str)
        
        if total_tokens > 50:
            bar_str = f"  {CLIFormatter._colorize(token_bar, Colors.YELLOW)}"
            CLIFormatter._safe_print(bar_str)
    
    @staticmethod
    def print_cumulative_tokens(total_tokens: int) -> None:
        """Display cumulative token count."""
        if total_tokens == 0:
            return
        
        token_str = CLIFormatter._colorize(
            f"[^] Session Tokens: {total_tokens}",
            Colors.BRIGHT_MAGENTA
        )
        CLIFormatter._safe_print(token_str)
    
    @staticmethod
    def print_error(message: str) -> None:
        """Print an error message."""
        error_prefix = CLIFormatter._colorize("[!]", Colors.BRIGHT_RED)
        msg = CLIFormatter._colorize(message, Colors.RED)
        CLIFormatter._safe_print(f"{error_prefix} {msg}")
    
    @staticmethod
    def print_info(message: str) -> None:
        """Print an info message."""
        info_prefix = CLIFormatter._colorize("[*]", Colors.BRIGHT_BLUE)
        msg = CLIFormatter._colorize(message, Colors.CYAN)
        CLIFormatter._safe_print(f"{info_prefix} {msg}")
    
    @staticmethod
    def print_success(message: str) -> None:
        """Print a success message."""
        success_prefix = CLIFormatter._colorize("[+]", Colors.BRIGHT_GREEN)
        msg = CLIFormatter._colorize(message, Colors.GREEN)
        CLIFormatter._safe_print(f"{success_prefix} {msg}")
    
    @staticmethod
    def get_user_input() -> str:
        """Get user input with styled prompt."""
        prompt = CLIFormatter._colorize("> ", Colors.BRIGHT_BLUE)
        return input(prompt).strip()
    
    @staticmethod
    def print_thinking(message: str = "Processing...") -> None:
        """Print a thinking/loading indicator."""
        thinking = CLIFormatter._colorize(f"~ {message}", Colors.BRIGHT_BLACK)
        CLIFormatter._safe_print(thinking)
    
    @staticmethod
    def print_timestamp() -> None:
        """Print current timestamp."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        ts_str = CLIFormatter._colorize(f"[{timestamp}]", Colors.BRIGHT_BLACK)
        CLIFormatter._safe_print(ts_str)
    
    @staticmethod
    def print_interaction_summary(
        user_message: str,
        response: str,
        token_usage: Optional[Dict[str, int]] = None,
        total_session_tokens: int = 0
    ) -> None:
        """Print a complete interaction with all details as single output."""
        lines = []
        lines.append(CLIFormatter._colorize("-" * 60, Colors.BRIGHT_BLACK))
        lines.append("")
        lines.append(CLIFormatter._colorize("You", Colors.BRIGHT_BLUE))
        lines.append(user_message)
        lines.append("")
        lines.append(CLIFormatter._colorize("NOVA", Colors.BRIGHT_GREEN))
        lines.append(response)
        
        if token_usage or total_session_tokens > 0:
            lines.append("")
            if token_usage:
                prompt_tokens = token_usage.get('prompt_tokens', 0)
                completion_tokens = token_usage.get('completion_tokens', 0)
                total_tokens = token_usage.get('total_tokens', 0)
                token_str = (
                    f"{CLIFormatter._colorize('📊 Tokens:', Colors.BRIGHT_YELLOW)} "
                    f"{CLIFormatter._colorize(f'{prompt_tokens}', Colors.CYAN)} prompt + "
                    f"{CLIFormatter._colorize(f'{completion_tokens}', Colors.MAGENTA)} completion = "
                    f"{CLIFormatter._colorize(f'{total_tokens}', Colors.BRIGHT_YELLOW)}"
                )
                lines.append(token_str)
            
            if total_session_tokens > 0:
                token_str = CLIFormatter._colorize(
                    f"[^] Session Tokens: {total_session_tokens}",
                    Colors.BRIGHT_MAGENTA
                )
                lines.append(token_str)
        
        lines.append("")
        lines.append(CLIFormatter._colorize("-" * 60, Colors.BRIGHT_BLACK))
        
        output = "\n".join(lines)
        CLIFormatter._safe_print(output)
    
    @staticmethod
    def print_usage_stats(stats: Dict[str, Any]) -> None:
        """Print usage statistics table."""
        lines = []
        lines.append("")
        lines.append(CLIFormatter._colorize("=== Session Statistics ===", Colors.BRIGHT_CYAN))
        lines.append("")
        
        for key, value in stats.items():
            key_str = CLIFormatter._colorize(f"{key:.<30}", Colors.BRIGHT_BLACK)
            if isinstance(value, int) and key.lower().endswith("tokens"):
                value_str = CLIFormatter._colorize(f"{value:,}", Colors.BRIGHT_YELLOW)
            else:
                value_str = CLIFormatter._colorize(str(value), Colors.CYAN)
            lines.append(f"{key_str} {value_str}")
        
        lines.append("")
        lines.append(CLIFormatter._colorize("-" * 60, Colors.BRIGHT_BLACK))
        
        output = "\n".join(lines)
        CLIFormatter._safe_print(output)


if sys.platform == "win32":
    try:
        os.system("mode con: cols=120 lines=40")
    except:
        pass
