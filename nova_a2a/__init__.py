"""A2A (Agent2Agent) support for NOVA.

Where :mod:`nova_mcp` connects the agent to *tools*, this package connects it
to other *agents*. The two are complementary and layered: NOVA's orchestrator
speaks A2A to its workers, and each worker speaks MCP to Google, Microsoft or
GitHub.

Layout mirrors :mod:`nova_mcp` on purpose:

- :mod:`nova_a2a.models`     — the protocol types NOVA uses
- :mod:`nova_a2a.card`       — NOVA's public Agent Card
- :mod:`nova_a2a.registry`   — agent discovery (internal and remote)
- :mod:`nova_a2a.agents`     — one module per internal agent
- :mod:`nova_a2a.worker`     — in-process execution (the ``builtin.py`` analog)
- :mod:`nova_a2a.planner`    — request → task graph
- :mod:`nova_a2a.executor`   — runs the task graph, in dependency waves
- :mod:`nova_a2a.aggregator` — artifacts → the user's answer

The supervisor graph that ties them together lives in
:mod:`agent.orchestrator`, next to the single-agent graph it falls back to.

Reference: https://a2a-protocol.org/latest/
"""

from nova_a2a.models import (
    PROTOCOL_VERSION,
    WELL_KNOWN_PATH,
    AgentCard,
    AgentSkill,
    Artifact,
    Task,
    TaskState,
)

__all__ = [
    "PROTOCOL_VERSION",
    "WELL_KNOWN_PATH",
    "AgentCard",
    "AgentSkill",
    "Artifact",
    "Task",
    "TaskState",
]
