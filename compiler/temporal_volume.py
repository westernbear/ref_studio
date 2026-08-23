from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from fractions import Fraction
from pathlib import Path
import time
from typing import Final, Protocol

ADMITTED_FPS: Final = frozenset({Fraction(24), Fraction(25), Fraction(30), Fraction(50), Fraction(60)})
MAX_FRAMES: Final = 240
MAX_STAGE_SECONDS: Final = 1_800.0
MAX_RSS_GIB: Final = 12.0
MAX_LONG_SIDE: Final = 3840
MAX_SHORT_SIDE: Final = 2160
MIN_SHORT_SIDE: Final = 360
ANALYSIS_SIZE: Final = (540, 960)


class AnalysisProfile(StrEnum):
    PRIMARY = "540x960"


class TemporalVolumeError(RuntimeError):
    """A fail-closed temporal-volume contract violation."""


@dataclass(frozen=True, slots=True)
class NormalizedArtifact:
    source_identifier: str
    artifact_identifier: str
    path: Path
    fps: Fraction
    width: int
    height: int
    frame_count: int


@dataclass(frozen=True, slots=True)
class TemporalVolumeRequest:
    artifact: NormalizedArtifact
    start_ms: int
    end_ms: int


@dataclass(frozen=True, slots=True)
class SourceFrame:
    index: int
    native_reference: bytes
    native_crop_reference: str


@dataclass(frozen=True, slots=True)
class FrameSample:
    index: int
    time_ms: int
    native_reference: bytes
    native_crop_reference: str
    analysis_size: tuple[int, int]


@dataclass(frozen=True, slots=True)
class VolumeProvenance:
    source_identifier: str
    normalized_artifact_identifier: str
    interval_ms: tuple[int, int]
    profile: str
    frame_count: int


@dataclass(frozen=True, slots=True)
class TemporalVolume:
    frames: tuple[FrameSample, ...]
    analysis_profile: AnalysisProfile
    provenance: VolumeProvenance


class CancellationToken(Protocol):
    def is_cancelled(self) -> bool: ...


@dataclass(slots=True)
class MutableCancellationToken:
    cancelled: bool = False

    def cancel(self) -> None:
        self.cancelled = True

    def is_cancelled(self) -> bool:
        return self.cancelled


@dataclass(frozen=True, slots=True)
class ResourceBudget:
    deadline_monotonic: float | None = None
    rss_gib: float = 0.0


def _fail(token: str, detail: str) -> None:
    raise TemporalVolumeError(f"{token} {detail}")


def _validate_request(request: TemporalVolumeRequest) -> int:
    artifact = request.artifact
    if "quarantine" in artifact.path.parts or "original" in artifact.path.name:
        _fail("NORMALIZED_ARTIFACT_REQUIRED", str(artifact.path))
    if not artifact.path.name.endswith(".mp4"):
        _fail("NORMALIZED_ARTIFACT_CORRUPT", str(artifact.path))
    if artifact.fps not in ADMITTED_FPS:
        _fail("FPS_NOT_ADMITTED", str(artifact.fps))
    if request.end_ms - request.start_ms != 4_000 or request.start_ms < 0:
        _fail("TEMPORAL_INTERVAL_INVALID", f"{request.start_ms}:{request.end_ms}")
    if artifact.width < artifact.height:
        long_side, short_side = artifact.height, artifact.width
    else:
        long_side, short_side = artifact.width, artifact.height
    if not MIN_SHORT_SIDE <= short_side <= MAX_SHORT_SIDE or long_side > MAX_LONG_SIDE:
        _fail("SOURCE_DIMENSIONS_INVALID", f"{artifact.width}x{artifact.height}")
    expected = int(artifact.fps * 4)
    if expected > MAX_FRAMES or artifact.frame_count > MAX_FRAMES:
        _fail("TEMPORAL_FRAME_LIMIT", str(max(expected, artifact.frame_count)))
    if artifact.frame_count != expected:
        _fail("NORMALIZED_ARTIFACT_CORRUPT", f"frames={artifact.frame_count}")
    return expected


def extract_temporal_volume(
    request: TemporalVolumeRequest,
    frames: list[SourceFrame],
    cancellation: CancellationToken | None = None,
    budget: ResourceBudget | None = None,
) -> TemporalVolume:
    """Extract all admitted frames from a normalized artifact's exact interval."""
    expected = _validate_request(request)
    if budget is not None:
        if budget.deadline_monotonic is not None and time.monotonic() > budget.deadline_monotonic:
            _fail("COMPILER_STAGE_DEADLINE", str(MAX_STAGE_SECONDS))
        if budget.rss_gib > MAX_RSS_GIB:
            _fail("COMPILER_RSS_LIMIT", str(budget.rss_gib))
    if cancellation is not None and cancellation.is_cancelled():
        _fail("COMPILER_CANCELLED", "before decode")
    if len(frames) != expected:
        _fail("MISSING_TEMPORAL_FRAME", f"expected={expected} actual={len(frames)}")
    samples: list[FrameSample] = []
    start_frame = int(request.start_ms * request.artifact.fps / 1_000)
    for position, frame in enumerate(frames):
        if cancellation is not None and cancellation.is_cancelled():
            _fail("COMPILER_CANCELLED", f"frame={position}")
        if budget is not None and budget.deadline_monotonic is not None and time.monotonic() > budget.deadline_monotonic:
            _fail("COMPILER_STAGE_DEADLINE", str(MAX_STAGE_SECONDS))
        expected_index = start_frame + position
        if frame.index != expected_index:
            token = "DUPLICATE_TEMPORAL_FRAME" if frame.index in {sample.index for sample in samples} else "OUT_OF_ORDER_TEMPORAL_FRAME"
            _fail(token, f"expected={expected_index} actual={frame.index}")
        time_ms = (frame.index * 1_000 * request.artifact.fps.denominator) // request.artifact.fps.numerator
        samples.append(FrameSample(frame.index, time_ms, frame.native_reference, frame.native_crop_reference, ANALYSIS_SIZE))
    return TemporalVolume(tuple(samples), AnalysisProfile.PRIMARY, VolumeProvenance(request.artifact.source_identifier, request.artifact.artifact_identifier, (request.start_ms, request.end_ms), AnalysisProfile.PRIMARY.value, len(samples)))
