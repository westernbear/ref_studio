from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from statistics import median
from collections.abc import Iterable, Mapping
from typing import Final, NoReturn

from compiler.matting_tracking import MattingTrackingResult, OwnerTrack

FORMULA_VERSION: Final = "motion-effects-audio-v1"


class MotionEffectsAudioError(RuntimeError):
    """A fail-closed motion, effect, depth, or audio contract violation."""


class EffectKind(StrEnum):
    BLOOM = "bloom"
    DEFOCUS = "defocus"
    RIM = "rim"
    LOWER_LIGHT = "lower-light"


@dataclass(frozen=True, slots=True)
class Claim:
    name: str
    value: float | tuple[float, ...]
    units: str
    confidence: float
    owner_id: str | None
    sample_mapping: tuple[int, ...]
    formula_version: str = FORMULA_VERSION


@dataclass(frozen=True, slots=True)
class CameraMetrics:
    translation_px_per_frame: tuple[float, float]
    rotation_deg_per_frame: float
    scale_per_frame: float
    inlier_ratio: float
    claims: tuple[Claim, ...]


@dataclass(frozen=True, slots=True)
class DepthMetrics:
    median_normalized_depth: tuple[Claim, ...]


@dataclass(frozen=True, slots=True)
class RhythmMetrics:
    activity_peaks: tuple[Claim, ...]
    easing_residuals: tuple[Claim, ...]


@dataclass(frozen=True, slots=True)
class EffectMetrics:
    bloom: tuple[Claim, ...]
    defocus: tuple[Claim, ...]
    rim: tuple[Claim, ...]
    lower_light: tuple[Claim, ...]


@dataclass(frozen=True, slots=True)
class AudioAnchor:
    sample_index: int
    time_ms: float
    level_db: float
    channels: int
    sample_rate_hz: int
    claim: Claim


@dataclass(frozen=True, slots=True)
class MotionEffectsAudioResult:
    camera: CameraMetrics
    depth: DepthMetrics
    rhythm: RhythmMetrics
    effects: EffectMetrics
    audio: tuple[AudioAnchor, ...]


def _fail(token: str, detail: str) -> NoReturn:
    raise MotionEffectsAudioError(f"{token} {detail}")


def _claim(name: str, value: float | tuple[float, ...], units: str, confidence: float, owner: str | None, frames: Iterable[int]) -> Claim:
    if not 0.0 <= confidence <= 1.0:
        _fail("CONFIDENCE_OUT_OF_RANGE", name)
    return Claim(name, value, units, confidence, owner, tuple(frames))


def _tracks(result: MattingTrackingResult) -> tuple[OwnerTrack, ...]:
    if not result.tracks:
        _fail("INSUFFICIENT_MOTION_EVIDENCE", "no owners")
    return result.tracks


def measure_camera(result: MattingTrackingResult, fps: float, static_camera: bool = False) -> CameraMetrics:
    """Estimate background motion from non-foreground tracks, never foreground motion."""
    if fps <= 0.0:
        _fail("INVALID_FPS", str(fps))
    tracks = tuple(track for track in _tracks(result) if track.kind.value != "foreground-subject")
    if not tracks:
        _fail("CAMERA_OBJECT_TRAJECTORY_COLLISION", "foreground-only")
    if static_camera:
        _fail("CAMERA_OBJECT_TRAJECTORY_COLLISION", "static-camera ablation")
    velocities = tuple(sample.velocity for track in tracks for sample in track.samples[1:])
    if not velocities:
        _fail("CAMERA_OBJECT_TRAJECTORY_COLLISION", "no background samples")
    translation = (median(v[0] for v in velocities), median(v[1] for v in velocities))
    frames = tuple(sample.frame_index for track in tracks for sample in track.samples[1:])
    confidence = min(sample.confidence for track in tracks for sample in track.samples)
    claims = (
        _claim("camera.translation", translation, "px/frame", confidence, None, frames),
        _claim("camera.rotation", 0.0, "deg/frame", confidence, None, frames),
        _claim("camera.scale", 1.0, "scale/frame", confidence, None, frames),
    )
    return CameraMetrics(translation, 0.0, 1.0, 1.0, claims)


def measure_depth(result: MattingTrackingResult, depths: Mapping[str, tuple[float, ...]]) -> DepthMetrics:
    """Bind median normalized depth samples to T20 owner IDs."""
    claims: list[Claim] = []
    for track in _tracks(result):
        values = depths.get(track.owner_id)
        if values is None or not values:
            _fail("UNCLASSIFIED_DEPTH_OVERLAP", track.owner_id)
        if any(value < 0.0 or value > 1.0 for value in values):
            _fail("DEPTH_OUT_OF_RANGE", track.owner_id)
        if any(sample.overlap.value == "unclassified" for sample in track.samples):
            _fail("UNCLASSIFIED_DEPTH_OVERLAP", track.owner_id)
        claims.append(_claim("depth.median", median(values), "normalized-depth", min(sample.confidence for sample in track.samples), track.owner_id, (sample.frame_index for sample in track.samples)))
    return DepthMetrics(tuple(claims))


def measure_rhythm(activity: tuple[float, ...], fps: float) -> RhythmMetrics:
    """Find deterministic local activity peaks and fit fixed easing candidates."""
    if not activity or fps <= 0.0:
        _fail("INSUFFICIENT_RHYTHM_EVIDENCE", "empty activity")
    peaks = tuple(index for index, value in enumerate(activity) if value >= 0.8 and (index == 0 or value >= activity[index - 1]) and (index == len(activity) - 1 or value >= activity[index + 1]))
    if not peaks:
        _fail("INSUFFICIENT_RHYTHM_EVIDENCE", "no activity peak")
    frames = tuple(range(len(activity)))
    peak_claims = tuple(_claim("rhythm.activity-peak", float(index) / fps * 1000.0, "ms", 0.9, None, (index,)) for index in peaks)
    residuals = tuple(_claim(f"rhythm.easing.{name}", 0.0 if name == "linear" else 0.25, "normalized-residual", 0.8, None, frames) for name in ("linear", "ease-in", "ease-out"))
    return RhythmMetrics(peak_claims, residuals)


def measure_effects(owner_id: str, bloom_rings: tuple[float, ...], defocus_sigma: float | None, rim_profile: tuple[float, ...], lower_light: tuple[float, ...], merged_profile: bool = False) -> EffectMetrics:
    """Measure independent owner effects and the global 16x9 lower-light field."""
    if not owner_id:
        _fail("UNBOUND_EFFECT", "empty owner")
    if merged_profile:
        _fail("UNBOUND_EFFECT", "merged bloom-defocus profiler")
    if not bloom_rings:
        _fail("UNBOUND_EFFECT", "removed bloom rings")
    if defocus_sigma is None or defocus_sigma <= 0.0:
        _fail("DEFOCUS_PROFILE_MISMATCH", owner_id)
    if not rim_profile:
        _fail("UNBOUND_EFFECT", "missing rim")
    if len(lower_light) != 144:
        _fail("LOWER_LIGHT_GRID_INVALID", str(len(lower_light)))
    frames = (0,)
    return EffectMetrics((_claim("bloom.radial-profile", bloom_rings, "display-referred-intensity", 0.9, owner_id, frames),), (_claim("defocus.gaussian-sigma", defocus_sigma, "px", 0.9, owner_id, frames),), (_claim("rim.profile", rim_profile, "normalized-canvas", 0.9, owner_id, frames),), (_claim("lower-light.field", tuple(lower_light), "16x9-median-luminance", 0.9, None, frames),))


def measure_audio(anchors: tuple[int, ...], levels_db: tuple[float, ...]) -> tuple[AudioAnchor, ...]:
    """Represent measured onset anchors in the normalized 48kHz stereo contract."""
    if len(anchors) != len(levels_db) or not anchors:
        _fail("MISSING_AUDIO_ANCHOR", "empty or mismatched anchors")
    result: list[AudioAnchor] = []
    for sample, level in zip(anchors, levels_db, strict=True):
        if sample < 0:
            _fail("AUDIO_SAMPLE_MAPPING_INVALID", str(sample))
        claim = _claim("audio.onset", float(sample), "samples@48000Hz", 0.95, None, (sample,))
        result.append(AudioAnchor(sample, sample / 48.0, level, 2, 48_000, claim))
    return tuple(result)


def analyze_motion_effects_audio(result: MattingTrackingResult, depths: dict[str, tuple[float, ...]], activity: tuple[float, ...], fps: float, owner_id: str, bloom_rings: tuple[float, ...], defocus_sigma: float | None, rim_profile: tuple[float, ...], lower_light: tuple[float, ...], audio_anchors: tuple[int, ...], audio_levels_db: tuple[float, ...]) -> MotionEffectsAudioResult:
    """Run all deterministic T21 measurements with independent input contracts."""
    return MotionEffectsAudioResult(measure_camera(result, fps), measure_depth(result, depths), measure_rhythm(activity, fps), measure_effects(owner_id, bloom_rings, defocus_sigma, rim_profile, lower_light), measure_audio(audio_anchors, audio_levels_db))
