"""NOVA Streamlit Chat UI.

A minimal chat interface that connects to the NOVA LangGraph agent.

Run with::

    streamlit run ui/app.py
"""

import asyncio
import logging

import streamlit as st
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agent.graph import run_agent_once

logger = logging.getLogger(__name__)

# ── Page config ──────────────────────────────────────────────────────

st.set_page_config(
    page_title="NOVA Agent",
    page_icon="🤖",
    layout="centered",
)

# ── Session state initialisation ─────────────────────────────────────

if "agent_state" not in st.session_state:
    st.session_state.agent_state = None

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

# ── Header ───────────────────────────────────────────────────────────

st.title("🤖 NOVA Agent")
st.caption("Neural Orchestration & Virtual Agent — Phase 1")

# ── Render chat history ──────────────────────────────────────────────

for entry in st.session_state.chat_history:
    role = entry["role"]
    with st.chat_message(role):
        st.markdown(entry["content"])
        if entry.get("tools_used"):
            st.caption(f"🔧 Tools: {', '.join(entry['tools_used'])}")
        if entry.get("tokens"):
            st.caption(f"📊 Tokens: {entry['tokens']}")

# ── Chat input ───────────────────────────────────────────────────────

if prompt := st.chat_input("Ask NOVA anything…"):
    # Show user message immediately
    st.session_state.chat_history.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Run agent
    with st.chat_message("assistant"):
        with st.spinner("Thinking…"):
            try:
                loop = asyncio.new_event_loop()
                result = loop.run_until_complete(
                    run_agent_once(prompt, st.session_state.agent_state)
                )
                loop.close()

                st.session_state.agent_state = result

                # Extract final AI response and tool info
                messages = result.get("messages", [])
                response_text = ""
                tools_used = []

                for msg in messages:
                    if isinstance(msg, ToolMessage):
                        tools_used.append(msg.name)
                    if isinstance(msg, AIMessage) and msg.content:
                        response_text = msg.content

                token_usage = result.get("token_usage")
                total_tokens = result.get("total_tokens", 0)

                st.markdown(response_text)

                # Show metadata
                if tools_used:
                    st.caption(f"🔧 Tools: {', '.join(tools_used)}")
                if token_usage:
                    tok_str = (
                        f"prompt={token_usage.get('prompt_tokens', '?')} · "
                        f"completion={token_usage.get('completion_tokens', '?')} · "
                        f"session total={total_tokens}"
                    )
                    st.caption(f"📊 Tokens: {tok_str}")

                # Save to display history
                st.session_state.chat_history.append({
                    "role": "assistant",
                    "content": response_text,
                    "tools_used": tools_used,
                    "tokens": f"{total_tokens} total" if total_tokens else None,
                })

            except Exception as e:
                error_msg = f"Error: {e}"
                st.error(error_msg)
                logger.exception("Streamlit agent error")
                st.session_state.chat_history.append({
                    "role": "assistant",
                    "content": error_msg,
                })

# ── Sidebar ──────────────────────────────────────────────────────────

with st.sidebar:
    st.header("📈 Session Stats")

    state = st.session_state.agent_state
    if state:
        total_tokens = state.get("total_tokens", 0)
        iterations = state.get("iteration_count", 0)
        num_messages = len([
            m for m in state.get("messages", [])
            if isinstance(m, HumanMessage)
        ])

        col1, col2 = st.columns(2)
        col1.metric("Messages", num_messages)
        col2.metric("Iterations", iterations)
        st.metric("Total Tokens", f"{total_tokens:,}")
    else:
        st.info("Start a conversation to see stats.")

    st.divider()
    if st.button("🗑️ Clear conversation"):
        st.session_state.agent_state = None
        st.session_state.chat_history = []
        st.rerun()
