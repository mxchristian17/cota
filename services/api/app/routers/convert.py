import asyncio
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from starlette.concurrency import run_in_threadpool

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user
from app.models.user import User
from app.services import dwg_service

router = APIRouter(prefix="/convert", tags=["convert"])
CurrentUser = Annotated[User, Depends(get_current_user)]
# Conversiones simultáneas: el resto espera su turno sin bloquear la API (el conversor corre en un hilo).
_CONVERSIONS = asyncio.Semaphore(2)


@router.get("/status")
def convert_status(_: CurrentUser) -> dict[str, bool]:
    """Indica qué direcciones de conversión DWG están disponibles."""
    return dwg_service.status()


async def _read_body(request: Request, settings: Settings) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared_size = int(content_length)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid content length") from exc
        if declared_size > settings.max_upload_bytes:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Upload exceeds the size limit")
    # Se lee por partes y se corta al pasar el límite (también sin Content-Length).
    size, chunks = 0, []
    async for chunk in request.stream():
        size += len(chunk)
        if size > settings.max_upload_bytes:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Upload exceeds the size limit")
        chunks.append(chunk)
    body = b"".join(chunks)
    if not body:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty request body")
    return body


async def _convert(fn: Callable[[bytes], bytes], body: bytes) -> bytes:
    async with _CONVERSIONS:
        return await run_in_threadpool(fn, body)


@router.post("/dwg-to-dxf")
async def dwg_to_dxf(
    request: Request,
    _: CurrentUser,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    """Recibe un DWG (bytes) y devuelve el DXF (texto) equivalente."""
    body = await _read_body(request, settings)
    try:
        dxf = await _convert(dwg_service.dwg_to_dxf, body)
    except dwg_service.DwgConverterUnavailable as e:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(e)) from e
    except dwg_service.DwgConversionError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    return Response(content=dxf, media_type="application/dxf")


@router.post("/dxf-to-dwg")
async def dxf_to_dwg(
    request: Request,
    _: CurrentUser,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    """Recibe un DXF (texto/bytes) y devuelve el DWG (bytes) equivalente."""
    body = await _read_body(request, settings)
    try:
        dwg = await _convert(dwg_service.dxf_to_dwg, body)
    except dwg_service.DwgConverterUnavailable as e:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(e)) from e
    except dwg_service.DwgConversionError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    return Response(content=dwg, media_type="image/vnd.dwg")
