.PHONY: install setup run ui api dev mcp mcp-google mcp-microsoft mcp-github clean help test

# Cross-platform: use `uv run` instead of hard-coded venv paths
SHELL_RC  := $(HOME)/.bashrc

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies and build the nova command
	uv sync
	cd ui && npm install
	@echo ""
	@echo "✅ Dependencies installed."

setup: install ## Add 'nova' alias to .bashrc (Linux/macOS only)
	@if grep -q "alias nova=" $(SHELL_RC) 2>/dev/null; then \
		sed -i "s|alias nova=.*|alias nova='uv run nova'|" $(SHELL_RC); \
		echo "✅ Alias 'nova' updated in $(SHELL_RC)"; \
	else \
		echo "" >> $(SHELL_RC); \
		echo "# NOVA Agent" >> $(SHELL_RC); \
		echo "alias nova='uv run nova'" >> $(SHELL_RC); \
		echo "✅ Alias 'nova' added to $(SHELL_RC)"; \
	fi
	@echo "👉 Run: source $(SHELL_RC)   (or open a new terminal)"

run: ## Run the NOVA agent CLI
	@uv run nova

api: ## Run the FastAPI backend (port 8000)
	@uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 --reload-exclude .venv

ui: ## Run the React dev server (port 5173)
	@cd ui && npm run dev

dev: ## Run both API and UI in parallel
	@echo "🚀 Starting NOVA development servers..."
	@$(MAKE) api & $(MAKE) ui & wait

mcp: ## Run the MCP server (stdio)
	@uv run python -m nova_mcp.server

mcp-http: ## Run the MCP server (HTTP/SSE)
	@MCP_TRANSPORT=http uv run python -m nova_mcp.server

mcp-google: ## Run the Google MCP server (stdio)
	@uv run python -m nova_mcp.servers.google

mcp-microsoft: ## Run the Microsoft MCP server (stdio)
	@uv run python -m nova_mcp.servers.microsoft

mcp-github: ## Run the GitHub MCP server (stdio)
	@uv run python -m nova_mcp.servers.github

test: ## Run tests
	@uv run pytest tests/ -v

clean: ## Remove build artifacts and cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache build dist *.egg-info
	rm -rf ui/dist ui/node_modules/.vite
