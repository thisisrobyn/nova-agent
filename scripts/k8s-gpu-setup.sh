#!/usr/bin/env bash
# GPU bootstrap for Docker Desktop Kubernetes on WSL2.
#
# Installs the NVIDIA Container Toolkit inside the K8s control-plane node,
# copies the GPU driver libs from a helper container, generates the CDI spec,
# and restarts containerd so pods can access the GPU.
#
# Run after every Docker Desktop restart:
#   bash scripts/k8s-gpu-setup.sh
#
# Requires: docker, kubectl

set -euo pipefail

NODE_NAME="desktop-control-plane"
HELPER_IMAGE="nvidia/cuda:12.4.0-base-ubuntu22.04"
HELPER_NAME="nvidia-gpu-helper"

echo "🔧 [1/5] Installing NVIDIA Container Toolkit in K8s node..."
docker exec "$NODE_NAME" bash -c '
  apt-get update -qq &&
  apt-get install -y -qq curl gpg >/dev/null 2>&1 &&
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null &&
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed "s#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g" \
    | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null &&
  apt-get update -qq &&
  apt-get install -y -qq nvidia-container-toolkit >/dev/null 2>&1
'

echo "📦 [2/5] Copying NVIDIA driver libs into K8s node..."
docker run -d --name "$HELPER_NAME" --gpus all "$HELPER_IMAGE" sleep 120 >/dev/null
docker exec "$HELPER_NAME" tar cf - /usr/lib/wsl/ /usr/bin/nvidia-smi 2>/dev/null \
  | docker exec -i "$NODE_NAME" tar xf - -C /
docker rm -f "$HELPER_NAME" >/dev/null

echo "📚 [3/5] Updating library cache..."
docker exec "$NODE_NAME" bash -c '
  DRIVER_DIR=$(find /usr/lib/wsl/drivers -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)
  echo "/usr/lib/wsl/lib" > /etc/ld.so.conf.d/nvidia-wsl.conf
  [ -n "$DRIVER_DIR" ] && echo "$DRIVER_DIR" >> /etc/ld.so.conf.d/nvidia-wsl.conf
  ldconfig 2>/dev/null || true
'

echo "⚙️  [4/5] Configuring containerd with NVIDIA runtime and generating CDI spec..."
docker exec "$NODE_NAME" bash -c '
  nvidia-ctk runtime configure --runtime=containerd --set-as-default >/dev/null 2>&1 &&
  mkdir -p /etc/cdi &&
  nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml 2>&1 | grep -E "^(time=|Generated)" || true
'

echo "🔄 [5/5] Restarting containerd..."
docker exec "$NODE_NAME" systemctl restart containerd
sleep 5

echo ""
echo "✅ GPU setup complete. Verifying..."
kubectl run gpu-verify --rm -it --restart=Never \
  --image="$HELPER_IMAGE" -- nvidia-smi 2>&1 | head -20

echo ""
echo "🎉 GPU is available in Kubernetes!"
