"""State schema for the orchestrator graph.

Kept separate from :class:`agent.state.NOVAState` rather than bolted onto it.
The single-agent graph is what every existing session runs through, and adding
orchestration keys to its state would put the risk of this feature on a code
path that is already working. The orchestrator is a different graph, so it
gets a different — deliberately compatible — state.

Compatible matters: the fallback node invokes the single-agent graph with this
same state, so every ``NOVAState`` key is present here with the same reducer.
"""

from typing import Annotated, Any, Dict, List, Optional, Sequence

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

from nova_a2a.models import Task


class OrchestratorState(dict):
    """State carried through plan → execute → synthesise.

    The plan and its results live here rather than in module globals so a run
    is reproducible from its checkpoint, and so two concurrent sessions cannot
    read each other's tasks.
    """

    __annotations__ = {
        # ── Mirrors NOVAState, so the fallback subgraph can run on this state ──
        "messages": Annotated[Sequence[BaseMessage], add_messages],
        "memory_context": str,
        "knowledge_context": str,
        "tool_results": List[Dict[str, Any]],
        "iteration_count": int,
        "total_tokens": int,
        "token_usage": Optional[Dict[str, Any]],
        # ── Orchestration ──
        #: The user turn being orchestrated, lifted out for the planner and
        #: the aggregator, which both need it verbatim.
        "request": str,
        #: The decomposed plan. Empty means "not orchestrated" — the run falls
        #: back to the single-agent graph.
        "plan": List[Task],
        #: The same tasks after execution, in terminal states.
        "results": List[Task],
        #: Identifier of this orchestrated turn, stamped on every event it
        #: emits so a run can be grouped and inspected after the fact.
        "run_id": str,
        #: Compact transcript of the previous turns, so a follow-up request is
        #: plannable and the workers can resolve what "the same" refers to.
        "conversation": str,
        #: Repair rounds spent. Bounds the executor → repair → executor cycle.
        "repair_rounds": int,
    }
