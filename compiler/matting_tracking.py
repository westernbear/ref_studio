from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import NoReturn, Protocol

from compiler.ocr_bounds import MeasuredRegion, PixelBounds, RegionKind


class MattingTrackingError(RuntimeError):
    """A fail-closed matting or ownership contract violation."""


class OwnerKind(StrEnum):
    TEXT_WORD = "text-word"
    SUBTITLE = "subtitle"
    UI_SURFACE = "ui-surface"
    FOREGROUND = "foreground-subject"
    GLOBAL_RESIDUAL = "global-residual"


class OverlapClass(StrEnum):
    DISJOINT = "disjoint"
    OCCLUDED = "occluded"
    UNCLASSIFIED = "unclassified"


@dataclass(frozen=True, slots=True)
class AlphaMatte:
    frame_index: int
    width: int
    height: int
    values: tuple[tuple[float, ...], ...]


class ForegroundMatteProvider(Protocol):
    def matte(self, frame_index: int) -> AlphaMatte: ...


@dataclass(frozen=True, slots=True)
class OwnerMask:
    owner_id: str
    kind: OwnerKind
    frame_index: int
    bounds: PixelBounds
    coverage: float
    alpha_min: float
    alpha_max: float
    source_track_id: str | None


@dataclass(frozen=True, slots=True)
class TrackSample:
    frame_index: int
    centroid: tuple[float, float]
    iou: float
    appearance_continuity: float
    velocity: tuple[float, float]
    confidence: float
    overlap: OverlapClass


@dataclass(frozen=True, slots=True)
class OwnerTrack:
    owner_id: str
    kind: OwnerKind
    start_frame: int
    end_frame: int
    samples: tuple[TrackSample, ...]
    masks: tuple[OwnerMask, ...]


@dataclass(frozen=True, slots=True)
class ResidualFrame:
    frame_index: int
    polygons: tuple[tuple[tuple[int, int], ...], ...]
    coverage: float


@dataclass(frozen=True, slots=True)
class NeedsChoice:
    frame_index: int
    polygon: tuple[tuple[int, int], ...]
    reason: str


@dataclass(frozen=True, slots=True)
class MattingTrackingResult:
    tracks: tuple[OwnerTrack, ...]
    residual: tuple[ResidualFrame, ...]
    choices: tuple[NeedsChoice, ...]


def _fail(token: str, detail: str) -> NoReturn:
    raise MattingTrackingError(f"{token} {detail}")


def _validate_matte(matte: AlphaMatte) -> None:
    if matte.width <= 0 or matte.height <= 0 or len(matte.values) != matte.height:
        _fail("INSUFFICIENT_MATTING_EVIDENCE", str(matte.frame_index))
    if any(len(row) != matte.width for row in matte.values):
        _fail("INSUFFICIENT_MATTING_EVIDENCE", str(matte.frame_index))
    if any(alpha < 0.0 or alpha > 1.0 for row in matte.values for alpha in row):
        _fail("INSUFFICIENT_MATTING_EVIDENCE", str(matte.frame_index))
    if not any(alpha > 0.0 for row in matte.values for alpha in row):
        _fail("INSUFFICIENT_MATTING_EVIDENCE", str(matte.frame_index))


def _intersection(a: PixelBounds, b: PixelBounds) -> PixelBounds | None:
    left, top = max(a.x, b.x), max(a.y, b.y)
    right, bottom = min(a.x + a.width, b.x + b.width), min(a.y + a.height, b.y + b.height)
    if right <= left or bottom <= top:
        return None
    return PixelBounds(left, top, right - left, bottom - top)


def _iou(a: PixelBounds, b: PixelBounds) -> float:
    overlap = _intersection(a, b)
    if overlap is None:
        return 0.0
    area = overlap.width * overlap.height
    return area / (a.width * a.height + b.width * b.height - area)


def _centroid(bounds: PixelBounds) -> tuple[float, float]:
    return (bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)


def _polygon(bounds: PixelBounds) -> tuple[tuple[int, int], ...]:
    return ((bounds.x, bounds.y), (bounds.x + bounds.width, bounds.y), (bounds.x + bounds.width, bounds.y + bounds.height), (bounds.x, bounds.y + bounds.height))


def _mask(matte: AlphaMatte, bounds: PixelBounds, owner_id: str, kind: OwnerKind, source: str | None) -> OwnerMask:
    samples = [matte.values[y][x] for y in range(max(0, bounds.y), min(matte.height, bounds.y + bounds.height)) for x in range(max(0, bounds.x), min(matte.width, bounds.x + bounds.width))]
    if not samples:
        return OwnerMask(owner_id, kind, matte.frame_index, bounds, 0.0, 0.0, 0.0, source)
    return OwnerMask(owner_id, kind, matte.frame_index, bounds, sum(alpha > 0.0 for alpha in samples) / len(samples), min(samples), max(samples), source)


def _classify_overlap(matte: AlphaMatte, bounds: PixelBounds, present: bool) -> OverlapClass:
    if not present:
        return OverlapClass.OCCLUDED
    samples = [matte.values[y][x] for y in range(max(0, bounds.y), min(matte.height, bounds.y + bounds.height)) for x in range(max(0, bounds.x), min(matte.width, bounds.x + bounds.width))]
    if any(0.0 < alpha < 1.0 for alpha in samples):
        _fail("UNCLASSIFIED_DEPTH_OVERLAP", str(matte.frame_index))
    return OverlapClass.DISJOINT


def track_matting(
    regions: tuple[MeasuredRegion, ...],
    frame_indices: tuple[int, ...],
    matte_provider: ForegroundMatteProvider,
    canvas_width: int,
    canvas_height: int,
    non_text_instances: tuple[PixelBounds, ...] = (),
) -> MattingTrackingResult:
    """Build measured OCR/foreground tracks and a separate residual canvas."""
    if not frame_indices or canvas_width <= 0 or canvas_height <= 0:
        _fail("INSUFFICIENT_MATTING_EVIDENCE", "empty temporal input")
    if len(non_text_instances) > 1:
        choices = tuple(NeedsChoice(index, _polygon(non_text_instances[0]), "MULTI_INSTANCE_MATTE_LIMIT") for index in frame_indices)
        return MattingTrackingResult((), (), (choices[0],))
    matte_values: list[AlphaMatte] = []
    for index in frame_indices:
        try:
            matte_values.append(matte_provider.matte(index))
        except StopIteration:
            _fail("OWNER_MISMATCH", "missing matte frame")
    mattes = tuple(matte_values)
    for matte in mattes:
        _validate_matte(matte)
        if matte.frame_index not in frame_indices:
            _fail("OWNER_MISMATCH", str(matte.frame_index))
        if matte.width != canvas_width or matte.height != canvas_height:
            _fail("INSUFFICIENT_MATTING_EVIDENCE", str(matte.frame_index))
    tracks: list[OwnerTrack] = []
    for region in sorted(regions, key=lambda item: item.track_id):
        kind = OwnerKind.TEXT_WORD if region.kind is RegionKind.TITLE else OwnerKind(region.kind.value)
        samples: list[TrackSample] = []
        masks: list[OwnerMask] = []
        previous = region.bounds
        for index, matte in zip(frame_indices, mattes, strict=True):
            present = index in region.source_frame_indices
            bounds = region.bounds if present else previous
            iou = _iou(previous, bounds) if present else 0.0
            centroid = _centroid(bounds)
            prior_centroid = _centroid(previous)
            velocity = (centroid[0] - prior_centroid[0], centroid[1] - prior_centroid[1])
            overlap = _classify_overlap(matte, bounds, present)
            masks.append(_mask(matte, bounds, region.track_id, kind, region.track_id))
            samples.append(TrackSample(index, centroid, iou, 1.0 if present else 0.0, velocity, region.confidence if present else region.confidence * 0.5, overlap))
            if present:
                previous = bounds
        tracks.append(OwnerTrack(region.track_id, kind, frame_indices[0], frame_indices[-1], tuple(samples), tuple(masks)))
    foreground_id = "foreground-subject:0"
    foreground_bounds: list[PixelBounds] = []
    for matte in mattes:
        points = [(x, y) for y, row in enumerate(matte.values) for x, alpha in enumerate(row) if alpha > 0.0]
        left, right = min(point[0] for point in points), max(point[0] for point in points)
        top, bottom = min(point[1] for point in points), max(point[1] for point in points)
        foreground_bounds.append(PixelBounds(left, top, right - left + 1, bottom - top + 1))
    foreground_masks = tuple(_mask(matte, bounds, foreground_id, OwnerKind.FOREGROUND, None) for matte, bounds in zip(mattes, foreground_bounds, strict=True))
    foreground_samples = tuple(TrackSample(index, _centroid(bounds), 1.0, 1.0, (0.0, 0.0), 1.0, OverlapClass.DISJOINT) for index, bounds in zip(frame_indices, foreground_bounds, strict=True))
    tracks.append(OwnerTrack(foreground_id, OwnerKind.FOREGROUND, frame_indices[0], frame_indices[-1], foreground_samples, foreground_masks))
    full = PixelBounds(0, 0, canvas_width, canvas_height)
    residual = tuple(ResidualFrame(index, (_polygon(full),), 1.0) for index in frame_indices)
    return MattingTrackingResult(tuple(tracks), residual, ())
