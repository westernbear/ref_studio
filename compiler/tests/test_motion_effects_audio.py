from dataclasses import dataclass, replace

import pytest

from compiler.matting_tracking import AlphaMatte, MattingTrackingResult, OverlapClass, track_matting
from compiler.motion_effects_audio import FORMULA_VERSION, MotionEffectsAudioError, analyze_motion_effects_audio, measure_audio, measure_camera, measure_depth, measure_effects
from compiler.ocr_bounds import MeasuredRegion, PixelBounds, RegionKind


@dataclass(frozen=True, slots=True)
class MatteFixture:
    values: tuple[AlphaMatte, ...]

    def matte(self, frame_index: int) -> AlphaMatte:
        return next(item for item in self.values if item.frame_index == frame_index)


def tracked() -> MattingTrackingResult:
    rows = tuple(tuple(1.0 if 1 <= x <= 2 and 1 <= y <= 2 else 0.0 for x in range(4)) for y in range(4))
    mattes = MatteFixture(tuple(AlphaMatte(index, 4, 4, rows) for index in range(3)))
    region = MeasuredRegion("subtitle:hello:1:1", "hello", RegionKind.SUBTITLE, PixelBounds(1, 1, 2, 2), 0.9, (0, 1, 2), ("fixture",))
    return track_matting((region,), (0, 1, 2), mattes, 4, 4)


def test_measures_owner_bound_units_and_deterministically() -> None:
    depths = {"subtitle:hello:1:1": (0.2, 0.3, 0.4), "foreground-subject:0": (0.7,)}
    args = (depths, (0.1, 0.9, 0.1), 25.0, "subtitle:hello:1:1", (0.2, 0.5), 6.0, (0.1, 0.2), (0.1,) * 144, (21600,), (-3.0,))
    first = analyze_motion_effects_audio(tracked(), *args)
    second = analyze_motion_effects_audio(tracked(), *args)
    assert first == second
    assert {claim.units for claim in first.camera.claims} == {"px/frame", "deg/frame", "scale/frame"}
    assert all(claim.confidence == pytest.approx(0.9) for claim in first.camera.claims)
    assert all(claim.formula_version == FORMULA_VERSION for claim in (first.camera.claims[0], first.depth.median_normalized_depth[0], first.effects.bloom[0], first.audio[0].claim))
    assert first.effects.defocus[0].owner_id == "subtitle:hello:1:1"
    assert first.effects.rim[0].units == "normalized-canvas"
    assert first.effects.lower_light[0].units == "16x9-median-luminance"
    assert first.effects.lower_light[0].value == (0.1,) * 144
    assert first.audio[0].sample_index == 21_600
    assert first.audio[0].time_ms == pytest.approx(450.0)
    assert first.audio[0].channels == 2
    assert first.audio[0].sample_rate_hz == 48_000
    assert first.audio[0].level_db == -3.0
    assert first.audio[0].claim.sample_mapping == (21_600,)
    assert first.depth.median_normalized_depth[0].value == pytest.approx(0.3)


def test_depth_missing_owner_and_ambiguous_overlap_fail_independently() -> None:
    source = tracked()
    ambiguous_track = replace(source.tracks[0], samples=(replace(source.tracks[0].samples[0], overlap=OverlapClass.UNCLASSIFIED),) + source.tracks[0].samples[1:])
    ambiguous = MattingTrackingResult((ambiguous_track,) + source.tracks[1:], source.residual, source.choices)
    with pytest.raises(MotionEffectsAudioError, match="UNCLASSIFIED_DEPTH_OVERLAP"):
        _ = measure_depth(tracked(), {})
    with pytest.raises(MotionEffectsAudioError, match="UNCLASSIFIED_DEPTH_OVERLAP"):
        _ = measure_depth(ambiguous, {"subtitle:hello:1:1": (0.3,), "foreground-subject:0": (0.7,)})


def test_camera_static_ablation_fails_independently() -> None:
    with pytest.raises(MotionEffectsAudioError, match="CAMERA_OBJECT_TRAJECTORY_COLLISION"):
        _ = measure_camera(tracked(), 25.0, static_camera=True)


def test_effect_and_audio_ablations_fail_independently() -> None:
    with pytest.raises(MotionEffectsAudioError, match="UNBOUND_EFFECT"):
        _ = measure_effects("subtitle:hello:1:1", (), 6.0, (0.1,), (0.1,) * 144)
    with pytest.raises(MotionEffectsAudioError, match="DEFOCUS_PROFILE_MISMATCH"):
        _ = measure_effects("subtitle:hello:1:1", (0.2,), None, (0.1,), (0.1,) * 144)
    with pytest.raises(MotionEffectsAudioError, match="UNBOUND_EFFECT"):
        _ = measure_effects("subtitle:hello:1:1", (0.2,), 6.0, (0.1,), (0.1,) * 144, merged_profile=True)
    with pytest.raises(MotionEffectsAudioError, match="UNBOUND_EFFECT"):
        _ = measure_effects("subtitle:hello:1:1", (0.2,), 6.0, (), (0.1,) * 144)
    with pytest.raises(MotionEffectsAudioError, match="LOWER_LIGHT_GRID_INVALID"):
        _ = measure_effects("subtitle:hello:1:1", (0.2,), 6.0, (0.1,), (0.1,) * 143)
    with pytest.raises(MotionEffectsAudioError, match="MISSING_AUDIO_ANCHOR"):
        _ = measure_audio((), ())
