"""Token usage tracking, reporting and visualisation.

Includes ``TokenUsageTracker`` for accumulating per-request stats,
``TokenReport`` for summary generation with cost estimation, and
helpers for text-based progress bars and badges.
"""

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

@dataclass
class TokenReport:
    """Data class for token usage statistics."""
    
    total_requests: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    average_prompt_tokens: float
    average_completion_tokens: float
    average_total_tokens: float
    
    def estimated_cost(
        self,
        model: str = "gpt-4-mini",
        prompt_cost_per_million: float = 0.15,
        completion_cost_per_million: float = 0.60
    ) -> float:
        """Calculate estimated cost based on token usage.
        
        Args:
            model: Model name (for reference)
            prompt_cost_per_million: Cost per 1M prompt tokens
            completion_cost_per_million: Cost per 1M completion tokens
            
        Returns:
            Estimated cost in USD
        """
        prompt_cost = (self.total_prompt_tokens / 1_000_000) * prompt_cost_per_million
        completion_cost = (self.total_completion_tokens / 1_000_000) * completion_cost_per_million
        return prompt_cost + completion_cost
    
    def __str__(self) -> str:
        """String representation of the report."""
        return (
            f"Token Usage Report\n"
            f"─" * 50 + "\n"
            f"Total Requests: {self.total_requests}\n"
            f"  Prompt Tokens:     {self.total_prompt_tokens:,}\n"
            f"  Completion Tokens: {self.total_completion_tokens:,}\n"
            f"  Total Tokens:      {self.total_tokens:,}\n"
            f"\nAverages per Request:\n"
            f"  Prompt:     {self.average_prompt_tokens:.2f}\n"
            f"  Completion: {self.average_completion_tokens:.2f}\n"
            f"  Total:      {self.average_total_tokens:.2f}\n"
        )


class TokenUsageTracker:
    """Tracks cumulative token usage across multiple requests."""
    
    def __init__(self):
        """Initialize the tracker."""
        self.requests: List[Dict] = []
        self._total_prompt_tokens = 0
        self._total_completion_tokens = 0
        self._total_tokens = 0
    
    def add_request(self, token_usage: Optional[Dict], message: str = "") -> None:
        """Add a request to the tracker.
        
        Args:
            token_usage: Token usage dictionary from API response
            message: Optional message describing the request
        """
        if token_usage is None:
            logger.debug("No token usage data to track")
            return
        
        prompt_tokens = token_usage.get('prompt_tokens', 0)
        completion_tokens = token_usage.get('completion_tokens', 0)
        total_tokens = token_usage.get('total_tokens', 0)
        
        self.requests.append({
            'prompt_tokens': prompt_tokens,
            'completion_tokens': completion_tokens,
            'total_tokens': total_tokens,
            'message': message,
        })
        
        self._total_prompt_tokens += prompt_tokens
        self._total_completion_tokens += completion_tokens
        self._total_tokens += total_tokens
    
    def get_report(self) -> TokenReport:
        """Generate a report of token usage statistics.
        
        Returns:
            TokenReport object with statistics
        """
        request_count = len(self.requests)
        
        if request_count == 0:
            return TokenReport(
                total_requests=0,
                total_prompt_tokens=0,
                total_completion_tokens=0,
                total_tokens=0,
                average_prompt_tokens=0.0,
                average_completion_tokens=0.0,
                average_total_tokens=0.0,
            )
        
        return TokenReport(
            total_requests=request_count,
            total_prompt_tokens=self._total_prompt_tokens,
            total_completion_tokens=self._total_completion_tokens,
            total_tokens=self._total_tokens,
            average_prompt_tokens=self._total_prompt_tokens / request_count,
            average_completion_tokens=self._total_completion_tokens / request_count,
            average_total_tokens=self._total_tokens / request_count,
        )
    
    def print_summary(self) -> None:
        """Print a summary of token usage."""
        report = self.get_report()
        print(report)
    
    def print_summary_table(self) -> None:
        """Print a detailed table of all requests."""
        if not self.requests:
            print("No requests tracked yet.")
            return
        
        print("\nDetailed Request Log:")
        print("─" * 80)
        print(
            f"{'#':<3} {'Prompt':<12} {'Completion':<12} "
            f"{'Total':<10} {'Message':<40}"
        )
        print("─" * 80)
        
        for i, req in enumerate(self.requests, 1):
            msg = req['message'][:37] + "..." if len(req['message']) > 40 else req['message']
            print(
                f"{i:<3} {req['prompt_tokens']:<12} {req['completion_tokens']:<12} "
                f"{req['total_tokens']:<10} {msg:<40}"
            )
        
        print("─" * 80)
        report = self.get_report()
        print(f"{'TOTAL':<3} {report.total_prompt_tokens:<12} "
              f"{report.total_completion_tokens:<12} {report.total_tokens:<10}")
        print()
    
    def reset(self) -> None:
        """Reset all tracked data."""
        self.requests.clear()
        self._total_prompt_tokens = 0
        self._total_completion_tokens = 0
        self._total_tokens = 0


def create_token_badge(token_usage: Optional[Dict]) -> str:
    """Create a simple text badge showing token usage.
    
    Args:
        token_usage: Token usage dictionary
        
    Returns:
        Formatted badge string
    """
    if not token_usage:
        return "🔹 Tokens: N/A"
    
    total = token_usage.get('total_tokens', 0)
    return f"🔹 Tokens: [{total}]"


def create_token_progress_bar(
    current_tokens: int,
    max_tokens: int = 100_000,
    bar_width: int = 30
) -> str:
    """Create a progress bar for token usage.
    
    Args:
        current_tokens: Current token count
        max_tokens: Maximum token limit
        bar_width: Width of the progress bar
        
    Returns:
        Formatted progress bar string
    """
    percentage = min(100, (current_tokens / max_tokens) * 100)
    filled = int(bar_width * current_tokens / max_tokens)
    bar = "█" * filled + "░" * (bar_width - filled)
    
    return f"[{bar}] {percentage:.1f}% ({current_tokens:,}/{max_tokens:,})"


if __name__ == "__main__":
    # Example usage
    tracker = TokenUsageTracker()
    
    # Simulate some requests
    tracker.add_request(
        {'prompt_tokens': 10, 'completion_tokens': 50, 'total_tokens': 60},
        "First request"
    )
    tracker.add_request(
        {'prompt_tokens': 15, 'completion_tokens': 75, 'total_tokens': 90},
        "Second request"
    )
    tracker.add_request(
        {'prompt_tokens': 8, 'completion_tokens': 42, 'total_tokens': 50},
        "Third request"
    )
    
    # Print reports
    tracker.print_summary()
    tracker.print_summary_table()
    
    # Show cost estimate
    report = tracker.get_report()
    cost = report.estimated_cost()
    print(f"Estimated Cost (GPT-4 mini): ${cost:.6f}")
    
    # Show token badge
    print("\n" + create_token_badge({'total_tokens': 200}))
    
    # Show progress bar
    print(create_token_progress_bar(25000, 100000))