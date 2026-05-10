"""Tests for ChatOllama configuration (T009).

Verifies that the LLM client is initialised with the expected keep_alive,
timeout, and num_ctx parameters read from environment variables.
"""

import os
from unittest.mock import patch

import httpx


def test_llm_default_keep_alive():
    """ChatOllama should be configured with keep_alive=-1 by default."""
    from agent.llm import KEEP_ALIVE
    assert KEEP_ALIVE == -1, f"Expected keep_alive=-1, got {KEEP_ALIVE}"


def test_llm_default_timeout():
    """ChatOllama should use a 120-second timeout by default."""
    from agent.llm import LLM_TIMEOUT
    assert LLM_TIMEOUT == 120.0, f"Expected timeout=120.0, got {LLM_TIMEOUT}"


def test_llm_num_ctx_default_none():
    """When NOVA_NUM_CTX is not set, NUM_CTX should be None."""
    from agent.llm import NUM_CTX
    # Only passes if env var was not set externally
    if not os.getenv("NOVA_NUM_CTX"):
        assert NUM_CTX is None, f"Expected NUM_CTX=None, got {NUM_CTX}"


def test_build_ollama_kwargs_has_keep_alive():
    """_build_ollama_kwargs must include keep_alive."""
    from agent.llm import _build_ollama_kwargs
    kwargs = _build_ollama_kwargs()
    assert "keep_alive" in kwargs
    assert kwargs["keep_alive"] == -1


def test_build_ollama_kwargs_has_timeout():
    """_build_ollama_kwargs must include httpx timeout in client_kwargs."""
    from agent.llm import _build_ollama_kwargs
    kwargs = _build_ollama_kwargs()
    assert "client_kwargs" in kwargs
    assert "timeout" in kwargs["client_kwargs"]
    assert isinstance(kwargs["client_kwargs"]["timeout"], httpx.Timeout)
    assert "async_client_kwargs" in kwargs
    assert "timeout" in kwargs["async_client_kwargs"]


def test_build_ollama_kwargs_omits_num_ctx_when_unset():
    """_build_ollama_kwargs must NOT include num_ctx when env var is unset."""
    from agent.llm import _build_ollama_kwargs, NUM_CTX
    kwargs = _build_ollama_kwargs()
    if NUM_CTX is None:
        assert "num_ctx" not in kwargs


def test_build_ollama_kwargs_includes_num_ctx_when_set():
    """_build_ollama_kwargs includes num_ctx when the module-level value is set."""
    import agent.llm as llm_module
    original = llm_module.NUM_CTX
    try:
        llm_module.NUM_CTX = 8192
        kwargs = llm_module._build_ollama_kwargs()
        assert kwargs.get("num_ctx") == 8192
    finally:
        llm_module.NUM_CTX = original
