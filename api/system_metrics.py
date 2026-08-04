"""Host resource metrics (CPU / RAM / GPU / disks) for the live monitor panel.

The UI polls :func:`collect_metrics` every couple of seconds, so every reading
here has to be non-blocking and cheap. ``psutil`` is queried without a sampling
interval (it diffs against the previous call), throughput is derived from the
gap between polls, and the GPU probe shells out to ``nvidia-smi`` at most once
per :data:`_GPU_CACHE_TTL` seconds — spawning a process on every poll would
cost more than the numbers are worth.

Nothing in here raises: a machine without ``psutil``, without an NVIDIA GPU, or
with a permission-restricted ``/proc`` still gets a well-formed payload with the
missing pieces set to ``None``.
"""

from __future__ import annotations

import asyncio
import os
import platform
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.stdlib.get_logger(__name__)

try:  # psutil is a hard dependency, but the panel must degrade, not 500.
    import psutil
except ImportError:  # pragma: no cover - exercised only on broken installs
    psutil = None  # type: ignore[assignment]


#: How long a GPU reading is reused before ``nvidia-smi`` is invoked again.
#: The process spawn costs ~100 ms, far more than the psutil counters.
_GPU_CACHE_TTL = 1.5

#: Seconds before a hung ``nvidia-smi`` is abandoned for this poll.
_GPU_TIMEOUT = 3.0

#: Fields requested from ``nvidia-smi``, in the order they come back.
_NVIDIA_QUERY = (
    "index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw"
)

#: Mount options that mark a volume as not worth charting.
_SKIP_DISK_OPTS = ("cdrom", "removable")

_gpu_cache: tuple[float, List[Dict[str, Any]], Optional[str]] = (0.0, [], None)
_gpu_lock = asyncio.Lock()

#: Set once ``nvidia-smi`` is found to be missing, so the lookup is not retried
#: on every poll for the whole life of the process.
_nvidia_smi_missing = False

#: Last I/O counters, for turning monotonic totals into per-second rates.
_last_io: Optional[Dict[str, Any]] = None


def _to_float(raw: str) -> Optional[float]:
    """Parse an ``nvidia-smi`` cell, mapping its ``[N/A]`` markers to ``None``."""
    value = raw.strip()
    if not value or value.startswith("["):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _parse_nvidia_smi(output: str) -> List[Dict[str, Any]]:
    """Turn ``nvidia-smi --format=csv,noheader,nounits`` output into GPU dicts.

    Args:
        output: Raw stdout of the query, one CSV line per GPU.

    Returns:
        One dict per parsed GPU. Malformed lines are skipped rather than
        failing the whole reading.
    """
    gpus: List[Dict[str, Any]] = []
    for line in output.splitlines():
        cells = [c.strip() for c in line.split(",")]
        if len(cells) < 5:
            continue
        try:
            index = int(cells[0])
        except ValueError:
            continue

        used_mib = _to_float(cells[3])
        total_mib = _to_float(cells[4])
        memory_percent = (
            round(used_mib / total_mib * 100, 1)
            if used_mib is not None and total_mib
            else None
        )

        gpus.append(
            {
                "index": index,
                "name": cells[1],
                "utilization_percent": _to_float(cells[2]),
                "memory_used_bytes": int(used_mib * 1024 * 1024) if used_mib is not None else None,
                "memory_total_bytes": int(total_mib * 1024 * 1024) if total_mib is not None else None,
                "memory_percent": memory_percent,
                "temperature_celsius": _to_float(cells[5]) if len(cells) > 5 else None,
                "power_watts": _to_float(cells[6]) if len(cells) > 6 else None,
            }
        )
    return gpus


def _run_nvidia_smi(binary: str) -> Optional[str]:
    """Run the GPU query synchronously, returning stdout or ``None``.

    Deliberately blocking + offloaded to a worker thread by the caller:
    ``asyncio.create_subprocess_exec`` raises ``NotImplementedError`` under the
    Selector event loop uvicorn runs on Windows, which turned this endpoint
    into a 500.
    """
    try:
        completed = subprocess.run(
            [binary, f"--query-gpu={_NVIDIA_QUERY}", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=_GPU_TIMEOUT,
            # Keep a console window from flashing on Windows.
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired:
        logger.warning("nvidia-smi timed out", timeout=_GPU_TIMEOUT)
        return None
    except OSError as exc:
        logger.warning("nvidia-smi could not be executed", error=str(exc))
        return None

    if completed.returncode != 0:
        logger.warning("nvidia-smi failed", returncode=completed.returncode)
        return None
    return completed.stdout


async def _read_gpus() -> tuple[List[Dict[str, Any]], Optional[str]]:
    """Read NVIDIA GPU counters, cached for :data:`_GPU_CACHE_TTL` seconds.

    Returns:
        ``(gpus, backend)`` where ``backend`` is ``"nvidia-smi"`` when the probe
        succeeded and ``None`` when no supported GPU tooling is present.
    """
    global _gpu_cache, _nvidia_smi_missing

    if _nvidia_smi_missing:
        return [], None

    now = time.time()
    cached_at, cached_gpus, cached_backend = _gpu_cache
    if now - cached_at < _GPU_CACHE_TTL:
        return cached_gpus, cached_backend

    async with _gpu_lock:
        # A second caller may have refreshed the cache while we waited.
        cached_at, cached_gpus, cached_backend = _gpu_cache
        if time.time() - cached_at < _GPU_CACHE_TTL:
            return cached_gpus, cached_backend

        binary = shutil.which("nvidia-smi")
        if binary is None:
            _nvidia_smi_missing = True
            return [], None

        stdout = await asyncio.to_thread(_run_nvidia_smi, binary)
        if stdout is None:
            # Transient failure — keep showing the last good reading.
            return cached_gpus, cached_backend

        gpus = _parse_nvidia_smi(stdout)
        backend = "nvidia-smi" if gpus else None
        _gpu_cache = (time.time(), gpus, backend)
        return gpus, backend


def _cpu_temperature() -> Optional[float]:
    """Package temperature where the platform exposes one (Linux, mostly)."""
    reader = getattr(psutil, "sensors_temperatures", None)
    if reader is None:
        return None
    try:
        sensors = reader()
    except (OSError, AttributeError, NotImplementedError):
        return None

    # Prefer the package sensor, else the hottest core reported.
    for key in ("coretemp", "k10temp", "cpu_thermal", "acpitz"):
        for entry in sensors.get(key, []):
            if entry.current:
                return round(float(entry.current), 1)
    return None


def _read_cpu() -> Dict[str, Any]:
    """Snapshot CPU load, core counts, clock speed and temperature."""
    # interval=None diffs against the previous call instead of sleeping, which
    # is what keeps the endpoint non-blocking. The very first call after import
    # returns 0.0 — _warm_up() below absorbs that one.
    per_core = [round(v, 1) for v in psutil.cpu_percent(interval=None, percpu=True)]
    overall = round(sum(per_core) / len(per_core), 1) if per_core else 0.0

    frequency_mhz: Optional[float] = None
    try:
        freq = psutil.cpu_freq()
        if freq is not None:
            frequency_mhz = round(freq.current, 0)
    except (NotImplementedError, OSError, AttributeError):
        # Common inside containers and on some ARM hosts.
        frequency_mhz = None

    return {
        "percent": overall,
        "per_core": per_core,
        "cores_logical": psutil.cpu_count(logical=True),
        "cores_physical": psutil.cpu_count(logical=False),
        "frequency_mhz": frequency_mhz,
        "temperature_celsius": _cpu_temperature(),
    }


def _read_memory() -> Dict[str, Any]:
    """Snapshot physical RAM usage."""
    mem = psutil.virtual_memory()
    return {
        "total_bytes": mem.total,
        "used_bytes": mem.total - mem.available,
        "available_bytes": mem.available,
        "percent": round(mem.percent, 1),
    }


def _read_swap() -> Optional[Dict[str, Any]]:
    """Snapshot swap usage, or ``None`` where the host exposes none."""
    try:
        swap = psutil.swap_memory()
    except (RuntimeError, OSError):
        return None
    if swap.total == 0:
        return None
    return {
        "total_bytes": swap.total,
        "used_bytes": swap.used,
        "percent": round(swap.percent, 1),
    }


def models_path() -> Optional[str]:
    """Where the local model weights live, for flagging the disk that holds them.

    ``NOVA_MODELS_PATH`` wins, then Ollama's own ``OLLAMA_MODELS``, then its
    default store. Returns ``None`` when none of them exists on this machine —
    the disk is then charted like any other.
    """
    candidates = [
        os.getenv("NOVA_MODELS_PATH"),
        os.getenv("OLLAMA_MODELS"),
        str(Path.home() / ".ollama" / "models"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(Path(candidate).resolve())
    return None


def _models_mountpoint(path: Optional[str]) -> Optional[str]:
    """The mount point / drive letter the models directory sits on."""
    if not path:
        return None
    try:
        return os.path.splitdrive(path)[0].upper() + os.sep if os.name == "nt" else None
    except (ValueError, TypeError):  # pragma: no cover - defensive
        return None


def _read_disks(models_dir: Optional[str]) -> List[Dict[str, Any]]:
    """Snapshot every fixed volume, flagging the one holding the models.

    Network shares, optical drives and anything that refuses ``disk_usage``
    (an empty card reader, a disconnected mount) are skipped — the panel is
    about resources that can actually run out.
    """
    models_drive = _models_mountpoint(models_dir)
    disks: List[Dict[str, Any]] = []
    seen: set[str] = set()

    try:
        partitions = psutil.disk_partitions(all=False)
    except (OSError, RuntimeError):
        return disks

    for partition in partitions:
        opts = (partition.opts or "").lower()
        if any(skip in opts for skip in _SKIP_DISK_OPTS):
            continue
        if partition.mountpoint in seen:
            continue

        try:
            usage = psutil.disk_usage(partition.mountpoint)
        except (OSError, PermissionError):
            continue

        seen.add(partition.mountpoint)
        holds_models = bool(
            models_drive and partition.mountpoint.upper().startswith(models_drive)
        ) or bool(
            models_dir
            and os.name != "nt"
            and models_dir.startswith(partition.mountpoint)
            and partition.mountpoint != "/"
        )

        disks.append(
            {
                "device": partition.device,
                "mountpoint": partition.mountpoint,
                "fstype": partition.fstype,
                "total_bytes": usage.total,
                "used_bytes": usage.used,
                "free_bytes": usage.free,
                "percent": round(usage.percent, 1),
                "holds_models": holds_models,
            }
        )

    # No drive matched but the models are somewhere — fall back to the volume
    # with the longest mount point that prefixes the path (POSIX layouts).
    if models_dir and not any(d["holds_models"] for d in disks):
        best = max(
            (d for d in disks if models_dir.startswith(d["mountpoint"])),
            key=lambda d: len(d["mountpoint"]),
            default=None,
        )
        if best:
            best["holds_models"] = True

    return disks


def _read_throughput() -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Disk and network throughput, derived from the gap between polls.

    Returns:
        ``(disk_io, network)``. Both are ``None`` on the first call of the
        process — a rate needs two readings.
    """
    global _last_io

    now = time.time()
    try:
        disk = psutil.disk_io_counters()
        net = psutil.net_io_counters()
    except (OSError, RuntimeError):
        return None, None

    current = {
        "at": now,
        "read": getattr(disk, "read_bytes", 0) if disk else 0,
        "write": getattr(disk, "write_bytes", 0) if disk else 0,
        "sent": getattr(net, "bytes_sent", 0) if net else 0,
        "received": getattr(net, "bytes_recv", 0) if net else 0,
    }
    previous, _last_io = _last_io, current

    if previous is None:
        return None, None

    elapsed = now - previous["at"]
    if elapsed <= 0:
        return None, None

    def rate(key: str) -> float:
        delta = current[key] - previous[key]
        # Counters reset when a device is re-enumerated; a negative rate is noise.
        return round(max(delta, 0) / elapsed, 1)

    return (
        {"read_bytes_per_sec": rate("read"), "write_bytes_per_sec": rate("write")},
        {"sent_bytes_per_sec": rate("sent"), "received_bytes_per_sec": rate("received")},
    )


def _read_process() -> Optional[Dict[str, Any]]:
    """Snapshot NOVA's own footprint, so its share of the host is visible."""
    try:
        proc = psutil.Process(os.getpid())
        with proc.oneshot():
            return {
                "pid": proc.pid,
                "memory_bytes": proc.memory_info().rss,
                # Normalised per core: raw cpu_percent() can exceed 100 on a
                # multi-core box, which would break the shared 0–100 axis.
                "cpu_percent": round(
                    proc.cpu_percent(interval=None) / (psutil.cpu_count(logical=True) or 1), 1
                ),
                "threads": proc.num_threads(),
            }
    except (psutil.Error, OSError):
        return None


def _warm_up() -> None:
    """Prime the psutil CPU counters so the first reading is not a flat 0%."""
    if psutil is None:
        return
    try:
        psutil.cpu_percent(interval=None, percpu=True)
        psutil.Process(os.getpid()).cpu_percent(interval=None)
    except (psutil.Error, OSError):  # pragma: no cover - defensive
        pass


_warm_up()


def _unavailable(timestamp: float, reason: str) -> Dict[str, Any]:
    """A well-formed payload for a host that cannot be measured."""
    return {
        "timestamp": timestamp,
        "available": False,
        "error": reason,
        "platform": platform.system(),
        "hostname": platform.node(),
        "uptime_seconds": None,
        "cpu": None,
        "memory": None,
        "swap": None,
        "gpus": [],
        "gpu_backend": None,
        "disks": [],
        "disk_io": None,
        "network": None,
        "models_path": None,
        "process": None,
    }


async def collect_metrics() -> Dict[str, Any]:
    """Collect a full host resource snapshot.

    Returns:
        A dict matching ``api.schemas.SystemMetricsResponse``. Never raises:
        an unmeasurable host answers ``available=False`` with a reason, so the
        panel can explain itself instead of showing a broken chart.
    """
    timestamp = time.time()

    if psutil is None:
        return _unavailable(timestamp, "psutil is not installed on the API host")

    error: Optional[str] = None
    cpu: Optional[Dict[str, Any]] = None
    memory: Optional[Dict[str, Any]] = None
    swap: Optional[Dict[str, Any]] = None
    disks: List[Dict[str, Any]] = []
    disk_io: Optional[Dict[str, Any]] = None
    network: Optional[Dict[str, Any]] = None
    uptime: Optional[float] = None
    models_dir: Optional[str] = None

    try:
        cpu = _read_cpu()
        memory = _read_memory()
        swap = _read_swap()
        models_dir = models_path()
        disks = _read_disks(models_dir)
        disk_io, network = _read_throughput()
        uptime = round(timestamp - psutil.boot_time(), 0)
    except Exception as exc:  # noqa: BLE001 - a monitor must never take the API down
        logger.warning("failed to read host counters", error=str(exc))
        error = str(exc)

    try:
        gpus, gpu_backend = await _read_gpus()
    except Exception as exc:  # noqa: BLE001 - same rationale as above
        logger.warning("failed to read GPU counters", error=str(exc))
        gpus, gpu_backend = [], None

    return {
        "timestamp": timestamp,
        "available": cpu is not None and memory is not None,
        "error": error,
        "platform": platform.system(),
        "hostname": platform.node(),
        "uptime_seconds": uptime,
        "cpu": cpu,
        "memory": memory,
        "swap": swap,
        "gpus": gpus,
        "gpu_backend": gpu_backend,
        "disks": disks,
        "disk_io": disk_io,
        "network": network,
        "models_path": models_dir,
        "process": _read_process(),
    }
