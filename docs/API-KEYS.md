# NOVA API Keys — Developer Guide

> Genera claves programáticas para conectar cualquier cliente al LLM de NOVA
> desplegado en Kubernetes.

---

## ¿Qué es una API Key de NOVA?

Una API key te permite acceder al modelo de IA (Qwen2.5-7B) desplegado en el
clúster Kubernetes de NOVA sin necesidad de pasar por la interfaz web. Es ideal
para:

- **NOVA CLI** — usar tu propio LLM en lugar de OpenAI
- **Scripts en Python** — automatizaciones con LangChain, requests, etc.
- **Aplicaciones externas** — cualquier cliente HTTP compatible con la API
  OpenAI-compatible de vLLM

Las claves tienen el formato `nova-sk-{48-hex}` y se almacenan de forma segura
en DynamoDB. Solo se muestran una vez al crearlas.

---

## Generar una API Key

### Desde la UI

1. Inicia sesión en NOVA
2. Haz clic en tu avatar o nombre en el sidebar
3. Ve a la pestaña **Developer**
4. Haz clic en **Generate New Key**
5. **Copia la clave inmediatamente** — no se volverá a mostrar

### Desde la API REST

```bash
# Necesitas un token JWT de Cognito (se obtiene al iniciar sesión)
curl -X POST https://tu-dominio/api/v1/developer/keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"key_name": "Mi Script"}'
```

Respuesta:
```json
{
  "api_key": "nova-sk-a1b2c3d4...",
  "key_name": "Mi Script",
  "created_at": 1712345678
}
```

---

## Usar la API Key

### Con curl (API OpenAI-compatible)

El endpoint de NOVA expone una API compatible con OpenAI a través de vLLM:

```bash
# Si accedes directamente al servicio K8s (port-forward o LoadBalancer)
curl http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer nova-sk-tu_clave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct-AWQ",
    "messages": [
      {"role": "user", "content": "Hola, ¿qué puedes hacer?"}
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'
```

### Con la API REST de NOVA

```bash
curl -X POST https://tu-dominio/api/v1/chat \
  -H "Authorization: Bearer nova-sk-tu_clave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "mi-sesion-001",
    "message": "Explícame qué es Kubernetes"
  }'
```

### Con Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    api_key="nova-sk-tu_clave_aqui",
    base_url="http://localhost:8000/v1",  # URL del servicio vLLM
)

response = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct-AWQ",
    messages=[
        {"role": "user", "content": "¿Qué es un pod en Kubernetes?"}
    ],
    temperature=0.7,
)

print(response.choices[0].message.content)
```

### Con Python (requests)

```python
import requests

NOVA_API = "https://tu-dominio/api/v1"
API_KEY = "nova-sk-tu_clave_aqui"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

resp = requests.post(f"{NOVA_API}/chat", json={
    "session_id": "python-test",
    "message": "Resume este texto: ...",
}, headers=headers)

print(resp.json()["response"])
```

### Con LangChain

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    api_key="nova-sk-tu_clave_aqui",
    base_url="http://localhost:8000/v1",
    model="Qwen/Qwen2.5-7B-Instruct-AWQ",
    temperature=0.7,
)

response = llm.invoke("¿Qué ventajas tiene usar LangGraph?")
print(response.content)
```

### Con NOVA CLI

Si usas el CLI de NOVA, puedes configurar tu API key en el `.env`:

```env
# En vez de usar OpenAI, apunta al LLM propio de NOVA
OPENAI_API_KEY=nova-sk-tu_clave_aqui
OPENAI_API_BASE=http://localhost:8000/v1
LLM_MODEL=Qwen/Qwen2.5-7B-Instruct-AWQ
```

O si el servicio está expuesto por un LoadBalancer o Ingress:

```env
OPENAI_API_KEY=nova-sk-tu_clave_aqui
OPENAI_API_BASE=https://llm.nova.example.com/v1
LLM_MODEL=Qwen/Qwen2.5-7B-Instruct-AWQ
```

---

## Gestionar API Keys

### Listar claves

```bash
curl https://tu-dominio/api/v1/developer/keys \
  -H "Authorization: Bearer <jwt_token>"
```

Respuesta (las claves se muestran enmascaradas):
```json
{
  "keys": [
    {
      "api_key_masked": "nova-sk-a1b2...f9g0",
      "api_key_id": "3a7f2b1c9d8e4f5a",
      "key_name": "Mi Script",
      "created_at": 1712345678,
      "is_active": true
    }
  ]
}
```

### Revocar una clave

```bash
curl -X DELETE https://tu-dominio/api/v1/developer/keys/3a7f2b1c9d8e4f5a \
  -H "Authorization: Bearer <jwt_token>"
```

---

## Arquitectura de autenticación

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   NOVA Web UI   │     │   NOVA CLI      │     │  Script Python  │
│                 │     │                 │     │                 │
│  JWT (Cognito)  │     │  API Key        │     │  API Key        │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────┬───────────┴───────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │    NOVA API (FastAPI) │
         │                      │
         │  Authorization:      │
         │  - Bearer <jwt>      │
         │  - Bearer nova-sk-*  │
         └───────────┬──────────┘
                     │
         ┌───────────┴──────────┐
         │                      │
         ▼                      ▼
  ┌─────────────┐      ┌──────────────┐
  │ Cognito     │      │  DynamoDB    │
  │ JWKS verify │      │  API keys    │
  └─────────────┘      └──────────────┘
```

### Flujo JWT (Web UI)

1. El usuario inicia sesión con email/contraseña en Cognito
2. Cognito devuelve un `id_token` JWT firmado con RS256
3. El frontend envía `Authorization: Bearer <jwt>` en cada petición
4. El backend descarga las claves públicas (JWKS) de Cognito y verifica la firma

### Flujo API Key (CLI / Scripts)

1. El usuario genera una API key desde la UI o la API
2. La clave se almacena hasheada en DynamoDB
3. El cliente envía `Authorization: Bearer nova-sk-xxxx`
4. El backend busca la clave en DynamoDB y verifica que esté activa

---

## Conexión con Kubernetes

El LLM de NOVA (vLLM con Qwen2.5-7B-Instruct-AWQ) corre como un pod en
el clúster EKS. La API key **no** autentica directamente contra vLLM, sino
contra la API de NOVA que actúa como proxy:

```
Cliente → API Key → NOVA API (FastAPI) → vLLM Service (ClusterIP) → GPU Pod
```

Para acceso directo al modelo (sin pasar por NOVA API), se usa la clave vLLM
interna configurada como secreto de Kubernetes:

```bash
# Port-forward al servicio vLLM
kubectl port-forward svc/nova-llm 8000:8000 -n nova

# Usar con la clave vLLM interna (no la API key de NOVA)
curl http://localhost:8000/v1/models \
  -H "Authorization: Bearer <VLLM_API_KEY>"
```

---

## Seguridad

- Las API keys se generan con `secrets.token_hex(24)` (192 bits de entropía)
- Solo se muestran **una vez** al crearlas — luego se enmascaran
- Se identifican para revocación mediante `sha256(key)[:16]`
- Las claves revocadas se eliminan permanentemente de DynamoDB
- Al borrar una cuenta, todas sus API keys se eliminan automáticamente

---

## Variables de entorno relacionadas

| Variable | Descripción | Default |
|----------|-------------|---------|
| `COGNITO_POOL_ID` | ID del User Pool de Cognito | `us-east-1_7JyhPlOoW` |
| `COGNITO_CLIENT_ID` | ID del App Client | `53vn2vlsppua8ucjlq3ogvv5qp` |
| `AWS_REGION` | Región AWS para DynamoDB | `us-east-1` |
| `DYNAMODB_API_KEYS_TABLE` | Tabla DynamoDB de API keys | `nova-api-keys` |
