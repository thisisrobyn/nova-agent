# Kubernetes & AWS EKS — Guía completa

> Esta guía explica qué es Kubernetes, por qué lo usamos en NOVA, cómo funciona
> el despliegue y cómo se ha migrado a AWS EKS. Está pensada para alguien que
> nunca ha trabajado con Kubernetes.

---

## Tabla de contenidos

1. [¿Qué es Kubernetes?](#qué-es-kubernetes)
2. [¿Por qué usamos Kubernetes en NOVA?](#por-qué-usamos-kubernetes-en-nova)
3. [Conceptos clave](#conceptos-clave)
4. [Arquitectura del despliegue](#arquitectura-del-despliegue)
5. [Estructura de archivos K8s](#estructura-de-archivos-k8s)
6. [Despliegue local (Docker Desktop)](#despliegue-local-docker-desktop)
7. [Despliegue en AWS EKS](#despliegue-en-aws-eks)
8. [El modelo LLM (vLLM + Qwen)](#el-modelo-llm-vllm--qwen)
9. [Costes de AWS](#costes-de-aws)
10. [Conexión con la UI](#conexión-con-la-ui)
11. [Comandos útiles](#comandos-útiles)
12. [Solución de problemas](#solución-de-problemas)

---

## ¿Qué es Kubernetes?

**Kubernetes** (K8s) es un sistema de orquestación de contenedores. En términos
simples: si Docker te permite meter tu aplicación dentro de una "caja"
(contenedor), Kubernetes se encarga de gestionar esas cajas — decidir en qué
máquina corren, reiniciarlas si fallan, escalarlas si hay mucha demanda, etc.

Piensa en Kubernetes como un **director de orquesta**: tú le dices _"quiero 2
copias de mi aplicación corriendo y accesibles por el puerto 8000"_ y K8s se
encarga de hacer que eso pase, sin importar cuántas máquinas tengas.

### Analogía simple

| Concepto | Analogía |
|----------|----------|
| **Contenedor** (Docker) | Una caja con tu app y todo lo que necesita |
| **Pod** | Un "envoltorio" que contiene uno o más contenedores |
| **Deployment** | Las instrucciones: "quiero X copias de este pod corriendo" |
| **Service** | La "dirección de correo" para que otros pods te encuentren |
| **Namespace** | Una carpeta para organizar tus recursos |
| **Node** | Una máquina (física o virtual) donde corren los pods |
| **Cluster** | El conjunto de todas las máquinas |

---

## ¿Por qué usamos Kubernetes en NOVA?

NOVA necesita ejecutar un **modelo de lenguaje (LLM)** localmente. Esto
requiere una GPU potente y una infraestructura que:

- **Reinicie el modelo** si se cae (el LLM puede fallar por falta de memoria).
- **Gestione el almacenamiento** del modelo descargado (~15 GB) de forma
  persistente para no descargarlo cada vez.
- **Aísle el LLM** del resto de la aplicación (API, UI) para que un fallo en
  uno no afecte al otro.
- **Permita escalar**: mover de local a la nube sin cambiar el código.

Kubernetes nos da todo esto de forma declarativa: escribimos archivos YAML que
describen lo que queremos, y K8s se encarga.

---

## Conceptos clave

### Pod

La unidad mínima de Kubernetes. Un pod ejecuta uno o más contenedores. En
nuestro caso, el pod de vLLM ejecuta un solo contenedor con la imagen
`vllm/vllm-openai`.

### Deployment

Define **cuántas réplicas** de un pod queremos y cómo actualizarlo. Si un pod
muere, el Deployment crea uno nuevo automáticamente.

```yaml
# "Quiero 1 réplica del pod vLLM corriendo siempre"
spec:
  replicas: 1
```

### Service

Asigna un **nombre DNS estable** a un grupo de pods. Aunque el pod se reinicie
y cambie de IP, el Service mantiene el mismo nombre accesible.

```
nova-llm:8000  ← siempre apunta al pod de vLLM, sin importar su IP real
```

### PersistentVolumeClaim (PVC)

Pide almacenamiento persistente. El modelo descargado de Hugging Face se guarda
aquí para no tener que descargarlo de nuevo tras cada reinicio.

### Namespace

Agrupa recursos bajo un nombre. Todos nuestros recursos están en el namespace
`nova`, separados del resto del cluster.

### Secret

Almacena datos sensibles (tokens, contraseñas) de forma segura. Nunca ponemos
credenciales directamente en los manifests.

### Kustomize

Herramienta integrada en `kubectl` que permite tener una **base** compartida de
manifests y **overlays** que la modifican para distintos entornos (local vs EKS).

---

## Arquitectura del despliegue

### Entorno local (desarrollo)

```
┌─────────── Tu PC ───────────────────────────────────┐
│                                                      │
│  ┌── Kubernetes (Docker Desktop) ───────────────┐   │
│  │  Namespace: nova                              │   │
│  │                                               │   │
│  │  ┌─────────────────────────────────┐          │   │
│  │  │ Pod: vLLM                       │          │   │
│  │  │  Qwen2.5-7B-Instruct-AWQ       │          │   │
│  │  │  GPU: NVIDIA (vía /dev/dxg)     │          │   │
│  │  │  Puerto interno: 8000           │          │   │
│  │  └──────────┬──────────────────────┘          │   │
│  │             │                                  │   │
│  │  Service: nova-llm:8000 (ClusterIP)           │   │
│  └─────────────┼──────────────────────────────────┘   │
│                │ port-forward                         │
│                ▼                                      │
│  ┌─── localhost ──────────────────────┐              │
│  │  FastAPI API (:8000)               │              │
│  │  React UI (:5173) ──proxy──► /api  │              │
│  └────────────────────────────────────┘              │
└──────────────────────────────────────────────────────┘
```

### Entorno AWS EKS (producción)

```
 Internet
    │
    ▼
 AWS ALB (futuro)
    │
    ├── /*       → UI (React + nginx)
    └── /api/*   → FastAPI (NOVA Agent)
                      │
                      ▼
                 ┌── EKS Cluster "nova" (us-east-1) ─────────────┐
                 │                                                 │
                 │  Node Group "system" (t3.medium, on-demand)    │
                 │  ├── CoreDNS, kube-proxy, vpc-cni              │
                 │  ├── ebs-csi-driver                            │
                 │  └── (futuro: FastAPI, UI)                     │
                 │                                                 │
                 │  Node Group "gpu-spot" (g4dn.xlarge, spot)     │
                 │  ├── NVIDIA Device Plugin                      │
                 │  └── Pod: vLLM (Qwen2.5-7B-AWQ)               │
                 │       └── Service: nova-llm:8000 (ClusterIP)   │
                 │                                                 │
                 └─────────────────────────────────────────────────┘
```

---

## Estructura de archivos K8s

```
k8s/
├── base/                              # Manifests compartidos (local + EKS)
│   ├── kustomization.yaml             # Lista de recursos base
│   ├── namespace.yaml                 # Namespace "nova"
│   ├── vllm-deployment.yaml           # Deployment del pod vLLM
│   ├── vllm-pvc.yaml                  # PVC para caché del modelo (30Gi)
│   ├── vllm-secret.yaml               # Plantilla de secrets (no tiene datos reales)
│   └── vllm-service.yaml              # Service "nova-llm" (ClusterIP:8000)
│
├── overlays/
│   ├── local/                         # Overlay para Docker Desktop / WSL2
│   │   └── kustomization.yaml         # Sin GPU requests (acceso directo vía /dev/dxg)
│   │
│   └── eks/                           # Overlay para AWS EKS
│       ├── kustomization.yaml         # Aplica patches GPU + storage
│       ├── gp3-storageclass.yaml      # StorageClass EBS gp3 para PVCs
│       ├── vllm-gpu-patch.yaml        # Añade nvidia.com/gpu + tolerations + nodeSelector
│       └── vllm-pvc-patch.yaml        # Añade storageClassName: gp3 al PVC
│
├── eks-cluster.yaml                   # Configuración de eksctl para crear el cluster
└── kustomization.yaml                 # Raíz (apunta a overlays/local por defecto)
```

### ¿Qué cambia entre local y EKS?

| Aspecto | Local | EKS |
|---------|-------|-----|
| GPU | Acceso automático vía `/dev/dxg` | Requiere `nvidia.com/gpu: 1` explícito |
| Storage | PVC con StorageClass por defecto del host | PVC con StorageClass `gp3` (EBS) |
| Scheduling | Nodo único, sin restricciones | `nodeSelector: role: gpu` + tolerations |
| Coste | Solo electricidad | ~$0.16-0.20/h (spot) + $0.10/h (control plane) |

---

## Despliegue local (Docker Desktop)

### Prerrequisitos

- Docker Desktop con Kubernetes habilitado
- GPU NVIDIA con drivers instalados
- `kubectl` instalado

### Pasos

```bash
# 1. Configurar GPU en K8s (necesario tras reinicio de Docker Desktop)
make k8s-gpu-setup

# 2. Desplegar (lee HF_TOKEN y VLLM_API_KEY de .env)
make k8s-up

# 3. Esperar a que el modelo esté listo (~10 min la primera vez)
make vllm-ready

# 4. Verificar estado
make k8s-status

# 5. Hacer port-forward para acceso local
make vllm-port-forward
# → vLLM accesible en http://localhost:8100/v1

# 6. Parar
make k8s-down
```

---

## Despliegue en AWS EKS

### Prerrequisitos

- Cuenta AWS con créditos/facturación activa
- AWS CLI configurado (`aws configure`)
- `eksctl` instalado
- `kubectl` y `helm` instalados
- Cuota de GPU aprobada (Service Quotas → "All G and VT Spot Instance Requests" ≥ 4 vCPUs)

### Herramientas necesarias (Windows)

```powershell
# Instalar herramientas
winget install --id Amazon.AWSCLI
winget install --id eksctl.eksctl
winget install --id Helm.Helm

# Configurar AWS
aws configure
# → Access Key ID, Secret Access Key, Region: us-east-1, Output: json

# Verificar
aws sts get-caller-identity
```

### Crear el cluster

```bash
# Crea el cluster EKS completo (~15-20 minutos)
eksctl create cluster -f k8s/eks-cluster.yaml
```

Esto crea:
- **VPC** con subnets públicas y privadas
- **EKS Control Plane** (Kubernetes API server gestionado por AWS)
- **Node group `system`**: 1× `t3.medium` (on-demand) para pods de sistema
- **Node group `gpu-spot`**: 0-1× `g4dn.xlarge` (spot) para vLLM
- **Addons**: vpc-cni, coredns, kube-proxy, ebs-csi-driver, metrics-server
- **NVIDIA Device Plugin**: DaemonSet automático para nodos GPU

### Desplegar vLLM

```bash
# Escalar nodo GPU (cuando lo necesites)
make eks-gpu-scale NODES=1

# Desplegar manifests EKS
make eks-up

# Verificar
make eks-status

# Cuando termines, escalar GPU a 0 para ahorrar
make eks-gpu-scale NODES=0

# Eliminar todo
make eks-down
```

### Eliminar el cluster completo

```bash
# ⚠️ Esto destruye todo (cluster, VPC, nodos, volúmenes)
eksctl delete cluster --name nova --region us-east-1
```

---

## El modelo LLM (vLLM + Qwen)

### ¿Qué es vLLM?

[vLLM](https://vllm.ai) es un motor de inferencia para LLMs optimizado para
alto rendimiento. Sirve modelos de Hugging Face mediante una **API compatible
con OpenAI** (endpoint `/v1/chat/completions`).

### ¿Qué modelo usamos?

**Qwen2.5-7B-Instruct-AWQ** — Un modelo de 7B parámetros de Alibaba, cuantizado
con AWQ (4-bit) para reducir el uso de memoria GPU.

| Propiedad | Valor |
|-----------|-------|
| Modelo | `Qwen/Qwen2.5-7B-Instruct-AWQ` |
| Parámetros | 7 mil millones |
| Cuantización | AWQ (4-bit) |
| VRAM necesaria | ~4-5 GB |
| GPU mínima | NVIDIA T4 (16 GB) |
| Contexto configurado | 2048 tokens |
| Idiomas | Multilingüe (incluye español) |

### ¿Cómo se conecta con NOVA?

vLLM expone una API REST compatible con OpenAI. La API de NOVA (FastAPI) se
conecta a vLLM como si fuera la API de OpenAI, pero apuntando a la URL interna
del cluster:

```
http://nova-llm:8000/v1
```

En el código de NOVA, esto se configura en el LLM client con `base_url`.

### Configuración de vLLM

Definida en `k8s/base/vllm-deployment.yaml`:

```yaml
args:
  - --model=Qwen/Qwen2.5-7B-Instruct-AWQ
  - --dtype=auto
  - --quantization=awq_marlin          # Motor de cuantización optimizado
  - --max-model-len=2048               # Contexto máximo
  - --gpu-memory-utilization=0.85      # Usa hasta 85% de la VRAM
  - --enforce-eager                    # Desactiva CUDA graphs (más estable)
  - --trust-remote-code                # Necesario para algunos modelos
  - --api-key=$(VLLM_API_KEY)          # Protege la API con clave
```

---

## Costes de AWS

### Desglose mensual estimado (con nodo GPU activo)

| Componente | Coste/hora | Coste/mes (24/7) | Notas |
|------------|-----------|-------------------|-------|
| EKS Control Plane | $0.10 | ~$73 | Siempre activo |
| `t3.medium` (system) | $0.042 | ~$30 | 1 nodo on-demand |
| `g4dn.xlarge` (GPU spot) | $0.16-0.20 | ~$115-144 | Solo cuando está activo |
| EBS gp3 (30 Gi) | — | ~$2.40 | Solo existe si el PVC está creado |
| **Total (GPU 24/7)** | | **~$220-250/mes** | |
| **Total (GPU apagado)** | | **~$103/mes** | Solo control plane + system |

### Estrategias de ahorro

1. **Escalar GPU a 0 cuando no la uses**: `make eks-gpu-scale NODES=0`
   → Pasa de ~$0.30/h a ~$0.14/h (solo control plane + system)
2. **Spot instances**: ya configuradas, ~70% ahorro vs on-demand
3. **Apagar el nodo system también**: con Karpenter o escalando a 0 manualmente
4. **Eliminar el cluster** cuando no lo necesites por días:
   `eksctl delete cluster --name nova --region us-east-1`

### Con $200 de créditos

| Escenario | Duración estimada |
|-----------|-------------------|
| GPU encendida 24/7 | ~25-30 días |
| GPU 4h/día, resto apagado | ~3-4 meses |
| Solo control plane + system | ~2 meses |

---

## Conexión con la UI

### Flujo de datos completo

```
Usuario (navegador)
    │
    ▼
React UI (puerto 5173 en dev / nginx en prod)
    │
    │  POST /api/v1/chat/stream
    ▼
FastAPI API (puerto 8000)
    │
    │  LangGraph agent decide usar LLM
    ▼
vLLM Service (nova-llm:8000 dentro del cluster)
    │
    │  POST /v1/chat/completions
    ▼
Qwen2.5-7B en GPU
    │
    │  Streaming de tokens
    ▼
... respuesta vuelve por el mismo camino (SSE) hasta el navegador
```

### En desarrollo local

La UI React usa el proxy de Vite para redirigir `/api/*` al backend:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:8000',  // FastAPI
  },
}
```

El backend se conecta a vLLM mediante port-forward:

```bash
make vllm-port-forward  # → localhost:8100
```

### En producción (EKS)

Dentro del cluster, el backend accede a vLLM directamente por su nombre DNS:

```
http://nova-llm.nova.svc.cluster.local:8000/v1
# o simplemente
http://nova-llm:8000/v1  (dentro del mismo namespace)
```

---

## Comandos útiles

### Desarrollo local

```bash
make k8s-up               # Desplegar vLLM en K8s local
make k8s-down             # Eliminar vLLM de K8s local
make k8s-status           # Ver pods, services, PVCs
make k8s-logs             # Ver logs de vLLM en tiempo real
make vllm-ready           # Esperar a que vLLM esté listo
make vllm-port-forward    # Acceder a vLLM en localhost:8100
```

### AWS EKS

```bash
make eks-up               # Desplegar manifests EKS
make eks-down             # Eliminar manifests EKS
make eks-status           # Ver nodos + pods + services
make eks-gpu-scale NODES=1  # Encender nodo GPU
make eks-gpu-scale NODES=0  # Apagar nodo GPU (ahorrar dinero)
```

### kubectl directo

```bash
kubectl get pods -n nova                    # Listar pods
kubectl describe pod <nombre> -n nova       # Detalle de un pod
kubectl logs -n nova -l app=vllm -f         # Logs en streaming
kubectl get nodes -o wide                   # Ver nodos del cluster
kubectl top pods -n nova                    # Uso de CPU/memoria
kubectl exec -it <pod> -n nova -- bash      # Shell dentro del pod
```

### eksctl

```bash
eksctl get cluster --region us-east-1            # Listar clusters
eksctl get nodegroup --cluster nova               # Ver node groups
eksctl scale nodegroup --cluster nova --name gpu-spot --nodes=1  # Escalar
eksctl delete cluster --name nova --region us-east-1             # Eliminar todo
```

---

## Solución de problemas

### El pod queda en `Pending`

```bash
kubectl describe pod <nombre> -n nova
```

Causas comunes:
- **No hay nodo GPU**: Escala con `make eks-gpu-scale NODES=1`
- **Cuota de GPU insuficiente**: Ve a AWS Service Quotas → EC2 → "All G and VT
  Spot Instance Requests" y solicita al menos 4 vCPUs
- **No hay capacidad spot**: AWS no tiene instancias spot disponibles en esa
  zona. Espera o cambia a on-demand

### vLLM tarda mucho en arrancar

La primera vez descarga el modelo (~15 GB). Revisa los logs:

```bash
make k8s-logs
```

Si ves `Downloading model...` es normal. Tras la primera descarga, el modelo
queda en el PVC y los siguientes arranques son mucho más rápidos.

### OOM (Out of Memory) en la GPU

El modelo no cabe en la GPU. Opciones:
- Reducir `--max-model-len` (menos contexto, menos VRAM)
- Reducir `--gpu-memory-utilization` (deja más margen)
- Usar un modelo más pequeño

### El Service no es accesible

Verifica que el pod está `Running` y `Ready`:

```bash
kubectl get pods -n nova
```

Si está `Running` pero no `Ready`, el health check está fallando. vLLM aún está
cargando el modelo. Espera con `make vllm-ready`.

---

## CI/CD con GitHub Actions

El proyecto incluye un pipeline de CI/CD que despliega automáticamente la UI y
la API al cluster EKS cuando se suben cambios a `master`.

### ¿Cómo funciona?

```
Push a master
    │
    ▼
GitHub Actions detecta qué cambió
    │
    ├── ui/** cambió?     → Build UI Docker → Push a ECR → Deploy
    ├── api/** cambió?    → Build API Docker → Push a ECR → Deploy
    └── k8s/** cambió?    → Aplica manifests actualizados
```

### Flujo del workflow (`deploy-eks.yml`)

1. **Detección de cambios**: Usa `dorny/paths-filter` para saber si cambió la
   UI, la API, o los manifests K8s.
2. **Build & Push** (en paralelo):
   - UI: `docker build ui/` → push a ECR (`nova-ui:<commit-sha>`)
   - API: `docker build .` → push a ECR (`nova-api:<commit-sha>`)
3. **Deploy**: Aplica los manifests con `kubectl apply -k k8s/overlays/eks/` y
   actualiza las imágenes de los deployments.

### Configuración necesaria

Para que el CI/CD funcione, debes configurar estos **GitHub Secrets** en tu
repositorio (Settings → Secrets and variables → Actions):

| Secret | Valor | Descripción |
|--------|-------|-------------|
| `AWS_ACCESS_KEY_ID` | `AKIA36...` | Access Key del usuario IAM |
| `AWS_SECRET_ACCESS_KEY` | `TOPi7y...` | Secret Key del usuario IAM |
| `AWS_ACCOUNT_ID` | `821184871640` | ID de tu cuenta AWS (para ECR URL) |

### Qué dispara el deploy

El workflow se ejecuta cuando se hace push a `master` y hay cambios en:

- `ui/**` → Rebuild y deploy de la UI
- `api/**`, `agent/**`, `tools/**`, `memory/**`, `nova_mcp/**` → Rebuild y deploy de la API
- `k8s/**` → Aplica manifests actualizados
- `Dockerfile`, `pyproject.toml` → Rebuild de la API

### Imágenes Docker

Las imágenes se guardan en **Amazon ECR** (Elastic Container Registry):

- `<account-id>.dkr.ecr.us-east-1.amazonaws.com/nova-ui:<sha>`
- `<account-id>.dkr.ecr.us-east-1.amazonaws.com/nova-api:<sha>`

Cada imagen se tagea con el SHA del commit para trazabilidad.

### Deploy manual vs automático

| Acción | Comando |
|--------|---------|
| Deploy automático | Push a `master` |
| Deploy manual | `make eks-up` (vLLM) o `kubectl apply -k k8s/overlays/eks/` |
| Escalar GPU | `make eks-gpu-scale NODES=1` (no lo hace el CI/CD) |

> **Nota**: El CI/CD **no** escala el nodo GPU automáticamente. Debes encenderlo
> manualmente con `make eks-gpu-scale NODES=1` cuando necesites vLLM.

---

## Autenticación y API Keys

El sistema usa **AWS Cognito** para autenticación de usuarios web y **API keys**
para acceso programático (CLI, scripts, integraciones).

### Flujo completo

```
┌──────────────┐     JWT (Cognito)     ┌─────────────────┐
│  NOVA Web UI │ ────────────────────► │                 │
└──────────────┘                       │  NOVA API       │     ┌─────────────┐
                                       │  (FastAPI)      │────►│ vLLM Pod    │
┌──────────────┐     API Key           │                 │     │ (GPU)       │
│  CLI/Scripts │ ────────────────────► │                 │     └─────────────┘
└──────────────┘                       └─────────────────┘
```

### Generar y usar API keys

1. Inicia sesión en la UI web
2. Abre **Settings** → pestaña **Developer**
3. Genera una clave → `nova-sk-...`
4. Úsala como `Authorization: Bearer nova-sk-...` en cualquier petición a la API

Para más detalles, consulta [API-KEYS.md](API-KEYS.md).
