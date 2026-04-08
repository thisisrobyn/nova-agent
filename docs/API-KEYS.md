# NOVA API Keys — Developer Guide

> Genera claves programáticas para conectar cualquier cliente a la API de NOVA.

---

## ¿Qué es una API Key de NOVA?

Una API key te permite acceder a la API de NOVA de forma programática sin
necesidad de pasar por la interfaz web. Es ideal para:

- **NOVA CLI** — usar NOVA desde la terminal
- **Scripts en Python** — automatizaciones con LangChain, requests, etc.
- **Aplicaciones externas** — cualquier cliente HTTP

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

### Con curl

```bash
curl -X POST https://tu-dominio/api/v1/chat \
  -H "Authorization: Bearer nova-sk-tu_clave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "mi-sesion-001",
    "message": "Explícame qué es LangGraph"
  }'
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
    model="gpt-4.1-mini",
    temperature=0.7,
)

response = llm.invoke("¿Qué ventajas tiene usar LangGraph?")
print(response.content)
```

### Con NOVA CLI

Si usas el CLI de NOVA, puedes configurar tu API key en el `.env`:

```env
OPENAI_API_KEY=nova-sk-tu_clave_aqui
OPENAI_API_BASE=http://localhost:8000/v1
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
