.PHONY: install setup run ui api dev mcp clean help

VENV      := .venv
PYTHON    := $(VENV)/bin/python
NOVA_BIN  := $(VENV)/bin/nova
SHELL_RC  := $(HOME)/.bashrc

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies and build the nova command
	uv sync
	uv pip install -e .
	cd ui && npm install
	@echo ""
	@echo "✅ Dependencies installed. Run 'make setup' to add the 'nova' command to your shell."

setup: install ## Add 'nova' alias to .bashrc
	@if grep -q "alias nova=" $(SHELL_RC) 2>/dev/null; then \
		sed -i "s|alias nova=.*|alias nova='$(CURDIR)/$(NOVA_BIN)'|" $(SHELL_RC); \
		echo "✅ Alias 'nova' updated in $(SHELL_RC)"; \
	else \
		echo "" >> $(SHELL_RC); \
		echo "# NOVA Agent" >> $(SHELL_RC); \
		echo "alias nova='$(CURDIR)/$(NOVA_BIN)'" >> $(SHELL_RC); \
		echo "✅ Alias 'nova' added to $(SHELL_RC)"; \
	fi
	@echo "👉 Run: source $(SHELL_RC)   (or open a new terminal)"

run: ## Run the NOVA agent CLI
	@$(NOVA_BIN)

api: ## Run the FastAPI backend (port 8000)
	@$(PYTHON) -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

ui: ## Run the React dev server (port 5173)
	@cd ui && npm run dev

dev: ## Run both API and UI in parallel
	@echo "🚀 Starting NOVA development servers..."
	@$(MAKE) api & $(MAKE) ui & wait

mcp: ## Run the MCP server (stdio)
	@$(PYTHON) -m nova_mcp.server

mcp-http: ## Run the MCP server (HTTP/SSE)
	@MCP_TRANSPORT=http $(PYTHON) -m nova_mcp.server

test: ## Run tests
	@$(PYTHON) -m pytest tests/ -v

clean: ## Remove build artifacts and cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache build dist *.egg-info
	rm -rf ui/dist ui/node_modules/.vite
