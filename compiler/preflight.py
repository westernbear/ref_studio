from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import sys
import argparse
from pathlib import Path

ROOT = Path(os.environ.get("RVS_ROOT", Path(__file__).resolve().parents[1]))
MAX_RSS_GIB = 12
REQUIRED_FONTS = ("WantedSansVariable.ttf", "Inter.ttf")
REQUIRED_MODELS = (
    "rvm_mobilenetv3.pth",
    "midas_v21_small_256.pt",
    "easyocr-craft",
    "easyocr-korean",
    "easyocr-english",
)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def fail(token: str, detail: str) -> None:
    raise RuntimeError(f"{token} {detail}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prerequisite-path", type=Path)
    parser.add_argument("--expected-sha256")
    args = parser.parse_args()
    if args.prerequisite_path is not None:
        path = args.prerequisite_path
        if not path.is_file() or (args.expected_sha256 and digest(path) != args.expected_sha256):
            fail("RUNTIME_PREREQUISITE_MISSING", str(path))
    if platform.machine() not in {"x86_64", "amd64"}:
        fail("COMPILER_CPU_UNSUPPORTED", platform.machine())
    if any(key in os.environ for key in ("CUDA_VISIBLE_DEVICES", "NVIDIA_VISIBLE_DEVICES")):
        fail("COMPILER_GPU_FORBIDDEN", "GPU environment is configured")
    pyproject = (ROOT / "compiler" / "pyproject.toml").read_text()
    if "+cpu" not in pyproject or "cuda" in pyproject.lower():
        fail("COMPILER_NON_CPU_DEPENDENCY", "compiler dependency pins are not CPU-only")

    closure = json.loads((ROOT / "runtime" / "supply-closure-manifest.json").read_text())
    checked: list[str] = []
    for item in closure["artifacts"]:
        local = item.get("localPath")
        expected = item.get("sha256")
        if not local or not expected:
            continue
        path = ROOT / local
        if not path.is_file() or digest(path) != expected:
            fail("RUNTIME_PREREQUISITE_MISSING", item["name"])
        checked.append(item["name"])
    for name in REQUIRED_FONTS:
        path = ROOT / "verification" / "contract" / "fonts" / name
        if not path.is_file():
            fail("RUNTIME_PREREQUISITE_MISSING", name)
    for name in REQUIRED_MODELS:
        if name not in checked:
            fail("RUNTIME_PREREQUISITE_MISSING", name)

    try:
        import torch

        if torch.cuda.is_available() or torch.version.cuda is not None:
            fail("COMPILER_NON_CPU_DEPENDENCY", "torch exposes CUDA")
        torch.set_num_threads(4)
        torch.zeros((2, 2)).sum().item()
    except ImportError as exc:
        fail("RUNTIME_PREREQUISITE_MISSING", f"torch: {exc}")
    if shutil.which("ffprobe") is None:
        fail("RUNTIME_PREREQUISITE_MISSING", "ffprobe")
    disk = shutil.disk_usage(ROOT)
    if disk.free < 20 * 1024**3:
        fail("COMPILER_DISK_ADMISSION_FAILED", f"freeBytes={disk.free}")
    print(json.dumps({"status": "compiler-preflight-ok", "cpu": True, "network": "none", "checked": checked, "python": sys.version.split()[0], "rssLimitGiB": MAX_RSS_GIB}))


if __name__ == "__main__":
    main()
