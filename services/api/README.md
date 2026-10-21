# services/api — optional server

The optional Cota server: user accounts, drawings stored in a database, user settings, DWG ↔ DXF conversion
(through GNU LibreDWG) and natural-language modeling with the user's own LLM key. Python 3.12, FastAPI,
SQLModel, Alembic.

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload     # http://localhost:8000, docs at /docs
.venv/bin/pytest                            # tests
.venv/bin/ruff check .                      # lint
```

In development the server uses SQLite and creates its tables on start. For production run
`alembic upgrade head` against PostgreSQL first; the server refuses to start in production with the default
secrets.

```text
app/main.py        Application factory, middleware
app/core/          Settings and security
app/routers/       auth · documents · config · convert · ai
app/services/      Business logic
app/models/        Database tables
app/schemas/       Request and response models
alembic/           Migrations
tests/             pytest
```

Settings and endpoints: [self-hosting](../../docs/self-hosting.md#api-server) and
[architecture](../../docs/architecture.md#the-server).
