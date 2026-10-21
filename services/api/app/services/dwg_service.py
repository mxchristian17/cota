"""Conversión DWG<->DXF vía un binario externo (LibreDWG `dwg2dxf`/`dxf2dwg`,
o compatible). Objetivo *stretch*: si el binario no está disponible, la
conversión se deshabilita con un error claro en lugar de romper la app.

El mapeo de entidades/layers vive en el cliente (`core/io/dxf.ts`): aquí
solo se traduce el contenedor DWG <-> DXF.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.config import get_settings

CONVERT_TIMEOUT_S = 60
# Topes del proceso conversor: parsea archivos subidos por usuarios (código C de terceros).
CONVERT_MAX_MEMORY = 1 << 30  # 1 GiB de espacio de direcciones
CONVERT_MAX_OUTPUT = 200 << 20  # 200 MiB por archivo escrito
# El conversor no hereda el entorno de la API (JWT_SECRET, SECRETS_ENCRYPTION_KEY, DATABASE_URL…).
_CHILD_ENV = {"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"}

log = logging.getLogger(__name__)


class DwgConverterUnavailable(RuntimeError):
    """El binario conversor no está instalado/configurado."""


class DwgConversionError(RuntimeError):
    """El conversor existe pero falló al procesar el archivo."""


def _resolve(cmd: str) -> str | None:
    """Resuelve un comando a una ruta ejecutable (PATH o ruta absoluta)."""
    if not cmd:
        return None
    if os.path.isabs(cmd):
        return cmd if os.path.exists(cmd) and os.access(cmd, os.X_OK) else None
    return shutil.which(cmd)


def _dwg2dxf() -> str | None:
    return _resolve(get_settings().dwg2dxf_cmd)


def _dxf2dwg() -> str | None:
    return _resolve(get_settings().dxf2dwg_cmd)


def status() -> dict[str, bool]:
    """Disponibilidad de cada dirección de conversión (para habilitar la UI)."""
    return {"dwgToDxf": _dwg2dxf() is not None, "dxfToDwg": _dxf2dwg() is not None}


def _limits() -> None:  # pragma: no cover - corre en el proceso hijo
    import resource

    resource.setrlimit(resource.RLIMIT_CPU, (CONVERT_TIMEOUT_S, CONVERT_TIMEOUT_S))
    resource.setrlimit(resource.RLIMIT_AS, (CONVERT_MAX_MEMORY, CONVERT_MAX_MEMORY))
    resource.setrlimit(resource.RLIMIT_FSIZE, (CONVERT_MAX_OUTPUT, CONVERT_MAX_OUTPUT))


def _run(exe: str | None, label: str, data: bytes, in_suffix: str, out_suffix: str) -> bytes:
    if exe is None:
        raise DwgConverterUnavailable(f"{label} converter is not available on the server")
    with tempfile.TemporaryDirectory() as d:
        inp = Path(d) / f"in{in_suffix}"
        outp = Path(d) / f"out{out_suffix}"
        inp.write_bytes(data)
        try:
            proc = subprocess.run(
                [exe, "-o", str(outp), str(inp)],
                capture_output=True,
                timeout=CONVERT_TIMEOUT_S,
                check=False,
                cwd=d,
                stdin=subprocess.DEVNULL,
                env=_CHILD_ENV,
                preexec_fn=_limits if os.name == "posix" else None,
            )
        except subprocess.TimeoutExpired as e:  # pragma: no cover - defensivo
            raise DwgConversionError(f"{label} timed out") from e
        if proc.returncode != 0 or not outp.exists():
            # El detalle (rutas temporales, versión del conversor) queda en el log del servidor.
            log.warning("%s failed (exit %s): %s", label, proc.returncode, proc.stderr.decode("utf-8", "replace")[:500])
            raise DwgConversionError(f"{label} could not convert the file")
        return outp.read_bytes()


def dwg_to_dxf(dwg: bytes) -> bytes:
    return _run(_dwg2dxf(), "dwg2dxf", dwg, ".dwg", ".dxf")


def dxf_to_dwg(dxf: bytes) -> bytes:
    return _run(_dxf2dwg(), "dxf2dwg", dxf, ".dxf", ".dwg")
