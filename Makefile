.PHONY: install setup run ui api dev mcp clean help \
       k8s-gpu-setup k8s-up k8s-down k8s-status k8s-logs vllm-ready vllm-port-forward \
       eks-up eks-down eks-status eks-gpu-scale

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

# ── Kubernetes (vLLM) ────────────────────────────────

k8s-gpu-setup: ## Setup GPU access in K8s node (run after Docker Desktop restart)
	@bash scripts/k8s-gpu-setup.sh

k8s-up: ## Deploy vLLM to Kubernetes (reads HF_TOKEN and VLLM_API_KEY from .env)
	kubectl apply -k k8s/
	@HF_TOKEN=$$(grep -E '^HF_TOKEN=' .env 2>/dev/null | cut -d= -f2-); \
	if [ -n "$$HF_TOKEN" ]; then \
		kubectl create secret generic hf-token \
			--from-literal=HF_TOKEN="$$HF_TOKEN" \
			-n nova --dry-run=client -o yaml | kubectl apply -f -; \
		echo "🔑 HF_TOKEN secret created from .env"; \
	else \
		echo "⚠️  HF_TOKEN not found in .env — model download may fail for gated models"; \
	fi
	@VLLM_API_KEY=$$(grep -E '^VLLM_API_KEY=' .env 2>/dev/null | cut -d= -f2-); \
	if [ -n "$$VLLM_API_KEY" ]; then \
		kubectl create secret generic vllm-api-key \
			--from-literal=VLLM_API_KEY="$$VLLM_API_KEY" \
			-n nova --dry-run=client -o yaml | kubectl apply -f -; \
		echo "🔑 VLLM_API_KEY secret created from .env"; \
	else \
		echo "❌ VLLM_API_KEY not found in .env — vLLM pod will fail to start"; \
		exit 1; \
	fi
	@echo "⏳ Waiting for vLLM pod to start (model download may take several minutes)..."
	@echo "   Run 'make k8s-logs' in another terminal to follow progress."

k8s-down: ## Remove vLLM from Kubernetes
	kubectl delete -k k8s/ --ignore-not-found

k8s-status: ## Show status of vLLM pods
	@kubectl get pods,svc,pvc -n nova

k8s-logs: ## Follow vLLM pod logs
	@kubectl logs -n nova -l app=vllm -f --tail=100

vllm-ready: ## Wait until vLLM API is responding
	@echo "⏳ Waiting for vLLM pod to be ready..."
	@kubectl wait --for=condition=ready pod -l app=vllm -n nova --timeout=600s
	@echo "✅ vLLM is ready!"

vllm-port-forward: ## Forward vLLM port to localhost:8100 (8000 is used by NOVA API)
	@echo "🔗 vLLM API available at http://localhost:8100/v1"
	@kubectl port-forward svc/nova-llm 8100:8000 -n nova

# ── AWS EKS ──────────────────────────────────────────

EKS_OVERLAY := k8s/overlays/eks

eks-up: ## Deploy vLLM to EKS (reads secrets from .env)
	kubectl apply -k $(EKS_OVERLAY)/
	@HF_TOKEN=$$(grep -E '^HF_TOKEN=' .env 2>/dev/null | cut -d= -f2-); \
	if [ -n "$$HF_TOKEN" ]; then \
		kubectl create secret generic hf-token \
			--from-literal=HF_TOKEN="$$HF_TOKEN" \
			-n nova --dry-run=client -o yaml | kubectl apply -f -; \
		echo "🔑 HF_TOKEN secret created from .env"; \
	else \
		echo "⚠️  HF_TOKEN not found in .env — model download may fail for gated models"; \
	fi
	@VLLM_API_KEY=$$(grep -E '^VLLM_API_KEY=' .env 2>/dev/null | cut -d= -f2-); \
	if [ -n "$$VLLM_API_KEY" ]; then \
		kubectl create secret generic vllm-api-key \
			--from-literal=VLLM_API_KEY="$$VLLM_API_KEY" \
			-n nova --dry-run=client -o yaml | kubectl apply -f -; \
		echo "🔑 VLLM_API_KEY secret created from .env"; \
	else \
		echo "❌ VLLM_API_KEY not found in .env — vLLM pod will fail to start"; \
		exit 1; \
	fi
	@echo "⏳ Waiting for vLLM pod to start (model download may take several minutes)..."
	@echo "   Run 'make k8s-logs' in another terminal to follow progress."

eks-down: ## Remove vLLM from EKS
	kubectl delete -k $(EKS_OVERLAY)/ --ignore-not-found

eks-status: ## Show EKS cluster and node status
	@echo "=== Nodes ==="
	@kubectl get nodes -o wide
	@echo ""
	@echo "=== Nova namespace ==="
	@kubectl get pods,svc,pvc -n nova

eks-gpu-scale: ## Scale GPU node group (usage: make eks-gpu-scale NODES=1)
	eksctl scale nodegroup --cluster=nova --name=gpu-spot --nodes=$(NODES) --region=us-east-1
