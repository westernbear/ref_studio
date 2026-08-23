from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Final, NoReturn, Protocol

from compiler.temporal_volume import SourceFrame


class OcrBoundsError(RuntimeError):
    """A fail-closed OCR measurement contract violation."""


class RegionKind(StrEnum):
    TEXT_WORD = "text-word"
    TITLE = "title"
    SUBTITLE = "subtitle"
    UI_SURFACE = "ui-surface"


@dataclass(frozen=True, slots=True)
class PixelBounds:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True, slots=True)
class OcrCandidate:
    text: str
    bounds: PixelBounds
    confidence: float | None
    kind: RegionKind
    source_frame_index: int
    provenance: str


class NativeOcrDetector(Protocol):
    """Native-resolution EasyOCR-compatible detector boundary."""

    def detect(self, frame: SourceFrame) -> tuple[OcrCandidate, ...]: ...


@dataclass(frozen=True, slots=True)
class MeasuredRegion:
    track_id: str
    text: str
    kind: RegionKind
    bounds: PixelBounds
    confidence: float
    source_frame_indices: tuple[int, ...]
    provenance: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class OcrBoundsResult:
    regions: tuple[MeasuredRegion, ...]
    raw_candidates: tuple[OcrCandidate, ...]
    native_references: tuple[bytes, ...]


PLACEHOLDER_VLM_RESPONSE: Final = "PLACEHOLDER_VLM_RESPONSE"
_PLACEHOLDER_TEXT: Final = frozenset({"<placeholder>", "[placeholder]", "vlm response"})


def _fail(token: str, detail: str) -> NoReturn:
    raise OcrBoundsError(f"{token} {detail}")


def _validate(candidate: OcrCandidate) -> None:
    if candidate.confidence is None:
        _fail("MISSING_CONFIDENCE", str(candidate.source_frame_index))
    confidence = candidate.confidence
    if not 0.0 <= confidence <= 1.0:
        _fail("CONFIDENCE_OUT_OF_RANGE", str(confidence))
    if not candidate.text.strip():
        _fail("BLANK_TEXT", str(candidate.source_frame_index))
    if candidate.text.strip().casefold() in _PLACEHOLDER_TEXT:
        _fail(PLACEHOLDER_VLM_RESPONSE, candidate.text)
    bounds = candidate.bounds
    if bounds.width <= 0 or bounds.height <= 0:
        _fail("BLURRED_TEXT", candidate.text)
    if candidate.kind is RegionKind.UI_SURFACE and bounds.width < 2:
        _fail("MISSING_OWNER_BOUNDS", candidate.text)


def _track_id(candidate: OcrCandidate) -> str:
    normalized = "_".join(candidate.text.split()).casefold()
    return f"{candidate.kind.value}:{normalized}:{candidate.bounds.x}:{candidate.bounds.y}"


def measure_ocr_bounds(
    frames: tuple[SourceFrame, ...], detector: NativeOcrDetector
) -> OcrBoundsResult:
    """Measure native OCR candidates and associate identical regions deterministically."""
    raw: list[OcrCandidate] = []
    references: list[bytes] = []
    for frame in frames:
        references.append(frame.native_reference)
        candidates = detector.detect(frame)
        for candidate in candidates:
            if candidate.source_frame_index != frame.index:
                _fail("OCR_PROVENANCE_MISMATCH", str(frame.index))
            _validate(candidate)
            raw.append(candidate)

    grouped: dict[str, list[OcrCandidate]] = {}
    for candidate in raw:
        grouped.setdefault(_track_id(candidate), []).append(candidate)
    regions: list[MeasuredRegion] = []
    for track_id, candidates in sorted(grouped.items()):
        first = candidates[0]
        if first.kind is RegionKind.SUBTITLE and any(
            candidate.kind is RegionKind.TITLE and candidate.bounds.y > first.bounds.y
            for candidate in raw
        ):
            _fail("SUBTITLE_GEOMETRY_INVALID", track_id)
        regions.append(
            MeasuredRegion(
                track_id,
                first.text,
                first.kind,
                first.bounds,
                min(candidate.confidence for candidate in candidates if candidate.confidence is not None),
                tuple(candidate.source_frame_index for candidate in candidates),
                tuple(candidate.provenance for candidate in candidates),
            )
        )
    return OcrBoundsResult(tuple(regions), tuple(raw), tuple(references))
