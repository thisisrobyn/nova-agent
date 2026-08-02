# Connected Services (OAuth)

NOVA can act on the user's behalf in Google, Microsoft and GitHub. The user
signs in **once from the UI** (sidebar → `connections`) and NOVA stores the
resulting OAuth tokens; the provider MCP servers then reuse them.

There are two distinct roles here, and it is worth keeping them apart:

| Role | What they do | How often |
| --- | --- | --- |
| **User** | Opens the panel, clicks *Connect*, signs in. Nothing else. | Once per account |
| **Operator** (you, deploying NOVA) | Registers NOVA as an application with each provider. | Once per deployment |

The operator step cannot be skipped: Google, Microsoft and GitHub all require
an application registered under a `client_id` / `client_secret` before they
will grant access to anyone's mailbox or files. But it is a one-time cost, and
the setup wizard in the panel makes it as short as each provider allows —
GitHub can even be registered in a single click.

---

## How the flow works

```
UI  ──POST /api/v1/connections/{provider}/authorize──►  API
UI  ◄─────────────── authorize_url ──────────────────  API
UI  ──opens popup──►  provider consent screen
                          │  user approves
                          ▼
    provider ──redirect──►  GET /api/v1/connections/{provider}/callback
                                    │  code → access_token + refresh_token
                                    ▼
                            connections/store.py  (encrypted SQLite)
```

Key points:

- The **client secret never reaches the browser** — the code-for-token
  exchange happens in `connections/oauth.py`, server-side.
- Both the app credentials and the per-user tokens are Fernet-encrypted
  before hitting SQLite (`connections/crypto.py`).
- `get_access_token(provider)` refreshes an expired token automatically, so
  callers never deal with expiry.

Relevant files:

| File | Role |
| --- | --- |
| [connections/providers.py](../connections/providers.py) | Registry: endpoints, scopes, env-var names |
| [connections/credentials.py](../connections/credentials.py) | App client id/secret (database, falling back to env) |
| [connections/oauth.py](../connections/oauth.py) | Authorization URL, code exchange, refresh |
| [connections/store.py](../connections/store.py) | Encrypted persistence + auto-refresh |
| [connections/github_app.py](../connections/github_app.py) | One-click GitHub App registration |
| [connections/crypto.py](../connections/crypto.py) | Fernet encryption at rest |
| [api/routes_connections.py](../api/routes_connections.py) | REST endpoints |
| [ui/src/components/connections/](../ui/src/components/connections/) | Panel + setup wizard |

---

## 0. Before you start

Set the public base URL — every redirect URI is derived from it:

```dotenv
# .env
NOVA_PUBLIC_URL=http://localhost:5173
```

Use `http://localhost:5173` while developing (the Vite dev server proxies
`/api` to the API on port 8000, so the OAuth popup shares an origin with the
UI). In production use the real domain, e.g. `https://nova.example.com`.

Then set a token-encryption key. Without it a key is auto-generated into
`data/.connection_key`, which is fine locally but should be explicit in
production:

```powershell
uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

```dotenv
NOVA_ENCRYPTION_KEY=<the generated key>
```

> Changing this key invalidates every stored credential — reconnect the
> services afterwards.

**Client ids and secrets do not go in `.env`.** Enter them in the setup
wizard: sidebar → `connections` → *Setup required*. They are stored encrypted
in the database and take effect immediately, with no restart. The
`*_CLIENT_ID` / `*_CLIENT_SECRET` environment variables still work as a
fallback for scripted deployments; database values win when both exist.

---

## 1. GitHub — one click

GitHub is the only provider that lets an application register itself, through
the [app-manifest flow](https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest).

1. Open the connections panel → GitHub → **Setup required**.
2. Optionally change the app name (it must be unique across GitHub) and set an
   organization to own the app; leave it blank for your personal account.
3. Click **Create the GitHub App**. GitHub opens with the configuration
   pre-filled — permissions, callback URL, everything.
4. Confirm. GitHub redirects back and NOVA stores the credentials on its own.

The app requests these repository permissions: `contents`, `issues`,
`pull_requests`, `administration` (needed to create repositories) and
`metadata`. Adjust them in
[connections/github_app.py](../connections/github_app.py) before registering
if you want a narrower app.

> A GitHub **App** is used instead of an OAuth App precisely because it can be
> registered from a manifest, and because it grants per-repository access with
> short-lived tokens rather than the all-or-nothing `repo` scope.

---

## 2. Microsoft — one command

With the [Azure CLI](https://aka.ms/azure-cli) installed and `az login` done:

```powershell
./scripts/setup_microsoft_app.ps1 -PublicUrl http://localhost:5173
```

The script creates the app registration, adds the delegated Graph permissions
(`User.Read`, `Mail.Read`, `Mail.Send`, `Calendars.ReadWrite`,
`Files.ReadWrite`, `offline_access`), generates a client secret and prints
the three values to paste into the wizard.

<details>
<summary>Or register it by hand</summary>

1. [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID** →
   **App registrations** → **New registration**.
2. Name it `NOVA`; supported account types: *Accounts in any organizational
   directory and personal Microsoft accounts*.
3. Redirect URI: platform **Web**,
   `http://localhost:5173/api/v1/connections/microsoft/callback`.
4. **Certificates & secrets → New client secret** — copy the **Value**, which
   is shown only once.
5. **API permissions → Microsoft Graph → Delegated permissions** — add the six
   permissions listed above. Personal accounts consent themselves; a work
   tenant may need **Grant admin consent**.

</details>

**Gotcha:** setting the tenant to a specific id in the wizard blocks personal
`@outlook.com` accounts. Leave it as `common` unless that is what you want.

---

## 3. Google — guided, but manual

Google deliberately exposes no API for creating OAuth clients, so this one has
to be done in the console. The wizard links straight to each page.

1. Create (or pick) a project in the
   [Google Cloud Console](https://console.cloud.google.com/projectcreate).
2. **APIs & Services → Library** — enable: Gmail API, Google Calendar API,
   Google Drive API, Google Sheets API, Google Docs API.
3. **OAuth consent screen** — User type **External**, fill in the app name and
   emails. Add the scopes NOVA requests (they are listed in the wizard and in
   `connections/providers.py` → `GOOGLE.scopes`). Add your own account under
   **Test users**.
4. **Credentials → Create credentials → OAuth client ID** — type **Web
   application**, authorized redirect URI
   `http://localhost:5173/api/v1/connections/google/callback` (copy it from
   the wizard to be safe).
5. Paste the client id and secret into the wizard.

**Gotchas:**

- Gmail and Drive scopes are *restricted*. A published app would need Google
  verification; while the consent screen is in **Testing** mode it does not,
  but only listed test users can connect and refresh tokens expire after
  7 days.
- Google only returns a refresh token when `access_type=offline` and
  `prompt=consent` are sent — NOVA always sends both.

---

## 4. Verify

```powershell
uv run uvicorn api.main:create_app --factory --reload   # terminal 1
cd ui; npm run dev                                      # terminal 2
```

Open the chat, click **connections**. Each configured provider shows a
**Connect** button instead of the amber *Setup required* badge. Click it, sign
in, and the card flips to the connected account's email.

```powershell
curl http://localhost:8000/api/v1/connections
```

`credentials_source` tells you whether a provider is configured from the
`database` or the `environment`.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `redirect_uri_mismatch` | The URI registered with the provider differs from `{NOVA_PUBLIC_URL}/api/v1/connections/{provider}/callback` — they must match character for character, including scheme and port. |
| Amber *Setup required* badge | No credentials stored for that provider yet. Open the wizard. |
| GitHub says the app name is taken | App names are unique across all of GitHub. Change it in the wizard and retry. |
| "This authorization link has expired" | The `state` lives in process memory for 10 minutes; an API restart mid-flow invalidates it. Retry. |
| Card stays disconnected after signing in | The popup landed on a different origin than the UI. Set `NOVA_PUBLIC_URL=http://localhost:5173` so the callback goes through the Vite proxy. |
| Everything disconnects after a redeploy | `NOVA_ENCRYPTION_KEY` changed (or `data/.connection_key` was lost). Re-enter the credentials and reconnect. |
| Google connection dies after ~7 days | The consent screen is in **Testing** mode, which caps refresh-token lifetime. Publish the app, or reconnect. |

---

## Security notes

- Client secrets are Fernet-encrypted in the database and never sent to the
  browser; the API only ever returns whether a provider *is* configured.
- Access and refresh tokens are encrypted the same way, so the database file
  alone is not enough to impersonate anyone.
- `state` is a 32-byte random value, single-use and TTL-bound (10 min) — it
  protects both the sign-in callback and the GitHub manifest callback against
  CSRF.
- Clearing a provider's credentials also drops every stored connection to it,
  since those tokens could no longer be refreshed.
- Disconnecting deletes NOVA's local copy of the tokens. To revoke access
  entirely the user should also remove the app from
  [Google account permissions](https://myaccount.google.com/permissions),
  [Microsoft app consent](https://account.live.com/consent/Manage) or
  [GitHub authorized apps](https://github.com/settings/applications).
