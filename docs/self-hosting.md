# Self-hosting

Cota has two parts:

| Part | Folder | Needed for |
| --- | --- | --- |
| **Web app** | `services/web` | Everything you draw. It is a static single-page app that runs in the browser |
| **API server** (optional) | `services/api` | User accounts, drawings stored in a database, DWG conversion, natural-language modeling |

Without the server, Cota saves drawings as `.cota` files (download, or a folder on your disk). Pick the setup
that fits you.

## Option 1 — Static site, no server

Build the web app with the server features turned off:

```bash
cd services/web
npm ci
VITE_CLOUD=off npm run build
```

Upload `services/web/dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages, an Nginx or Apache
folder, an S3 bucket…). Serve `index.html` for unknown paths. Serve it over **HTTPS** (or from `localhost`):
browsers only offer to install the app and enable offline use on secure origins. The build includes the web app
manifest and a service worker (`sw.js`) that caches that version's files.

If the site lives in a subfolder (for example `https://user.github.io/cota/`), set the base path when
building:

```bash
VITE_CLOUD=off COTA_BASE=/cota/ npm run build
```

**GitHub Pages:** the repository includes `.github/workflows/pages.yml`. In your fork go to *Settings ▸ Pages*,
choose *GitHub Actions* as the source and push to `main`: the site is published at
`https://<user>.github.io/<repo>/`.

## Option 2 — Full stack with Docker

Requires Docker with Compose. The stack runs the web app (Nginx), the API and PostgreSQL.

1. Generate the secrets:

   ```bash
   openssl rand -hex 32        # use it as JWT_SECRET
   openssl rand -hex 16        # use it as POSTGRES_PASSWORD
   python3 -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"   # SECRETS_ENCRYPTION_KEY
   ```

2. Export them in your shell (or put them in a file that Docker Compose reads, outside version control):

   ```bash
   export JWT_SECRET=…  POSTGRES_PASSWORD=…  SECRETS_ENCRYPTION_KEY=…
   ```

3. Start it:

   ```bash
   docker compose up -d --build
   ```

Open <http://localhost:8080>. Click **Login** to create an account. The API applies the database migrations
every time it starts.

To serve it on a domain, put it behind a reverse proxy with HTTPS (Caddy, Traefik, Nginx…) and set
`APP_BASE_URL=https://cad.example.com` and `ALLOWED_HOSTS=cad.example.com`. In production the session cookie
is marked *Secure*, so the browser only sends it over HTTPS (or to `localhost`).

The bundled Nginx limits login and sign-up attempts per IP address, refuses to be embedded in other sites'
frames and sends the usual security headers. For a server only your team uses, set `ALLOW_REGISTRATION=false`
once your accounts exist.

## Option 3 — Development

With hot reload, SQLite and development defaults:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Web at <http://localhost:5173>, API at <http://localhost:8000> (interactive docs at `/docs`). Both listen only
on this machine: the development secrets are public, so do not expose these ports to a network.

Without Docker:

```bash
# API (Python 3.12, using uv: https://docs.astral.sh/uv/)
cd services/api
uv venv --python 3.12 .venv
uv pip install --python .venv -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload

# Web, in another terminal (Node.js 20+)
cd services/web
npm install
npm run dev
```

The web dev server proxies `/api` to `http://localhost:8000`.

## DWG support

Opening and saving DWG files does not need the server: the browser reads and writes them with acad-ts (MIT), loaded
only when the first `.dwg` is used. The server is only a fallback for files the browser cannot read or write.

DWG is converted on the server with the `dwg2dxf` and `dxf2dwg` programs of
[GNU LibreDWG](https://www.gnu.org/software/libredwg/). They are not bundled with Cota: install them in the API
machine or image (for example `apt-get install libredwg-tools` where available, or build LibreDWG from source).
Cota runs them as separate programs. Without them, `OPEN` and `EXPORT` simply report that DWG is not available;
DXF always works in the browser.

The converters parse files uploaded by your users. Cota runs them without the server's secrets in their
environment, with CPU, memory and output-size limits and at most two at a time, but on a server open to the
public consider running the API (or the whole converter) in a separate, unprivileged container.

## Configuration reference

### API server

All settings are read from environment variables (names are case-insensitive).

| Variable | Default | Description |
| --- | --- | --- |
| `COTA_ENV` | `dev` | `dev`, `qa` or `prod`. Outside `dev` (or with a public `APP_BASE_URL`), the secrets below must be your own, the API docs are hidden and cookies are *Secure*. `prod` also requires PostgreSQL and `ALLOWED_HOSTS` |
| `DATABASE_URL` | `sqlite:///./data/cota.db` | SQLAlchemy URL. `postgres://` and `postgresql://` URLs are accepted and use the bundled psycopg 3 driver |
| `JWT_SECRET` | development value | Secret that signs the sessions. At least 32 characters outside `dev` |
| `SECRETS_ENCRYPTION_KEY` | development value | [Fernet](https://cryptography.io/en/latest/fernet/) key that encrypts the users' LLM keys. Must be your own outside `dev` |
| `JWT_EXPIRE_MINUTES` | `30` | Session length (5–1440) |
| `JWT_ALGORITHM` | `HS256` | `HS256`, `HS384` or `HS512` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `cota` / `cota-web` | Token issuer and audience |
| `SESSION_COOKIE_NAME` | `cota_session` | Name of the session cookie |
| `APP_BASE_URL` | `http://localhost:5173` | Public URL of the web app. A URL that is not `localhost` also enforces your own secrets |
| `API_CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed to call the API from another origin |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated host names accepted in production (`*` is rejected) |
| `ALLOW_REGISTRATION` | `true` | `false` closes sign-up: only existing accounts can log in (a private server for your team) |
| `MAX_DOCUMENT_BYTES` | `5242880` | Largest drawing that can be stored (bytes) |
| `MAX_UPLOAD_BYTES` | `10485760` | Largest file accepted for conversion (bytes) |
| `AI_ALLOWED_BASE_URLS` | empty | Comma-separated HTTPS base URLs that users may set for OpenAI-compatible LLM providers. Empty: only the official OpenAI and Google endpoints |
| `DWG2DXF_CMD` / `DXF2DWG_CMD` | `dwg2dxf` / `dxf2dwg` | LibreDWG programs used for DWG |

Run the migrations with `alembic upgrade head` before starting a `prod` server (the Docker stack does it for
you). In `dev`, the API creates the tables itself.

### Web app

These are read when building or running the dev server.

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_CLOUD` | on | `off` hides login and cloud storage and builds a server-less app |
| `COTA_BASE` | `/` | Base path when the app is served from a subfolder |
| `API_PROXY_TARGET` | `http://localhost:8000` | Where the dev server proxies `/api` |
| `VITE_API_BASE_URL` | `/api` | Absolute API URL, only if the API is on another origin (requires CORS) |

## Backups

Everything a user saves to the server is in the database: back up the PostgreSQL volume (`db_data`), for
example with `docker compose exec db pg_dump -U cota cota > cota.sql`. Drawings saved as files are already on
the users' disks.

## Visit statistics (optional)

Builds send no statistics unless you configure them at build time:

| Variable | Value | Behavior |
| --- | --- | --- |
| `VITE_ANALYTICS_GOATCOUNTER` | `https://<code>.goatcounter.com/count` | One request per visit, no cookies, no third-party script |
| `VITE_ANALYTICS_GA4` | `G-XXXXXXXXXX` | Google Analytics 4, loaded only after the visitor accepts a notice |

On GitHub Pages, set them as repository variables `ANALYTICS_GOATCOUNTER` or `ANALYTICS_GA4` (Settings ▸ Secrets and
variables ▸ Actions ▸ Variables); the Pages workflow passes them to the build. Only visits are counted: drawings,
commands and anything typed are never sent, and visitors with "Do Not Track" are not counted.
