from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.db.session import init_db
from app.routers import ai, auth, config, convert, documents


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def create_app(api_prefix: str = "") -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Cota API",
        version="2.0.0",
        docs_url=None if settings.is_hardened else f"{api_prefix}/docs",
        redoc_url=None,
        openapi_url=None if settings.is_hardened else f"{api_prefix}/openapi.json",
        lifespan=lifespan,
    )
    # El allowlist de hosts es una protección de producción. En dev el proxy de Vite reenvía con
    # Host `api:8000` (Docker), que no está en la lista y daría 400 "Invalid host header"; por eso
    # sólo se activa en producción (donde ALLOWED_HOSTS es obligatorio y validado).
    if settings.is_production:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.host_list)
    if settings.cors_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_list,
            # Sólo se habilita el regex permisivo mientras se desarrolla localmente.
            allow_origin_regex=(r"https?://(localhost|127\.0\.0\.1)(:\d+)?" if not settings.is_production else None),
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.middleware("http")
    async def secure_api_responses(request: Request, call_next):
        try:
            response = await call_next(request)
        except Exception:
            # En producción no se filtran trazas al cliente. En dev se re-lanza para que el
            # servidor loguee el traceback y el error sea diagnosticable.
            if not settings.is_production:
                raise
            return JSONResponse(status_code=500, content={"detail": "Internal server error"})
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.get(f"{api_prefix}/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    for router in (auth.router, documents.router, config.router, convert.router, ai.router):
        app.include_router(router, prefix=api_prefix)
    return app


app = create_app()
