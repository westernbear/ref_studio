from dataclasses import dataclass, replace

import pytest

from compiler.evidence_contract import (
    EvidenceContractError,
    EvidenceState,
    LabelProposal,
    assemble_evidence_bundle,
    validate_evidence_bundle,
)
from compiler.matting_tracking import AlphaMatte, NeedsChoice, track_matting
from compiler.motion_effects_audio import analyze_motion_effects_audio
from compiler.ocr_bounds import (
    OcrBoundsResult,
    OcrCandidate,
    PixelBounds,
    RegionKind,
    measure_ocr_bounds,
    OcrBoundsError,
)
from compiler.temporal_volume import SourceFrame
from compiler.matting_tracking import MattingTrackingResult
from compiler.motion_effects_audio import MotionEffectsAudioResult


@dataclass(frozen=True, slots=True)
class MatteFixture:
    values: tuple[AlphaMatte, ...]

    def matte(self, frame_index: int) -> AlphaMatte:
        return next(item for item in self.values if item.frame_index == frame_index)


@dataclass(frozen=True, slots=True)
class Detector:
    def detect(self, frame: SourceFrame) -> tuple[OcrCandidate, ...]:
        return (OcrCandidate("hello", PixelBounds(1, 1, 2, 2), 0.9, RegionKind.SUBTITLE, frame.index, "T19-fixture"),)


def _inputs() -> tuple[OcrBoundsResult, MattingTrackingResult, MotionEffectsAudioResult]:
    frames = tuple(SourceFrame(index, b"native", f"crop-{index}") for index in range(3))
    ocr = measure_ocr_bounds(frames, Detector())
    rows = tuple(tuple(1.0 if 1 <= x <= 2 and 1 <= y <= 2 else 0.0 for x in range(4)) for y in range(4))
    tracking = track_matting(ocr.regions, (0, 1, 2), MatteFixture(tuple(AlphaMatte(i, 4, 4, rows) for i in range(3))), 4, 4)
    motion = analyze_motion_effects_audio(tracking, {"subtitle:hello:1:1": (0.2, 0.3, 0.4), "foreground-subject:0": (0.7,)}, (0.1, 0.9, 0.1), 25.0, "subtitle:hello:1:1", (0.2, 0.5), 6.0, (0.1, 0.2), (0.1,) * 144, (21600,), (-3.0,))
    return ocr, tracking, motion


def test_assembles_observed_measurements_and_mapped_owners() -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2), (LabelProposal("subtitle:hello:1:1", "headline"),))
    validate_evidence_bundle(bundle)
    assert bundle.state is EvidenceState.MAPPED
    assert any(item.name == "ocr.bounds" and item.units == "pixels" for item in bundle.measurements)
    assert any(item.owner_id == "subtitle:hello:1:1" for item in bundle.measurements)
    assert bundle.labels[0].label == "headline"
    assert bundle.residual_canvas


def test_unresolved_choice_blocks_later_gates_and_only_one_is_allowed() -> None:
    ocr, tracking, motion = _inputs()
    tracking = replace(tracking, choices=(NeedsChoice(1, ((0, 0), (1, 1), (1, 0)), "fixture-choice"),))
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    assert bundle.state is EvidenceState.NEEDS_CHOICE
    assert bundle.later_gates_blocked
    with pytest.raises(EvidenceContractError, match="UNRESOLVED_CHOICE_SKIPPED"):
        validate_evidence_bundle(replace(bundle, later_gates_blocked=False))
    with pytest.raises(EvidenceContractError, match="UNRESOLVED_CHOICE_SKIPPED"):
        _ = assemble_evidence_bundle(ocr, replace(tracking, choices=tracking.choices * 2), motion, (0, 1, 2))


@pytest.mark.parametrize("token", ("VLM_DELETED_MEASUREMENT", "UNRESOLVED_CHOICE_SKIPPED"))
def test_adversarial_contract_rejection(token: str) -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    if token == "VLM_DELETED_MEASUREMENT":
        altered = replace(bundle, measurements=bundle.measurements[1:])
        with pytest.raises(EvidenceContractError, match=token):
            validate_evidence_bundle(altered)
    else:
        with pytest.raises(EvidenceContractError, match=token):
            validate_evidence_bundle(replace(bundle, choices=(), later_gates_blocked=False, state=EvidenceState.NEEDS_CHOICE))


def test_missing_temporal_frame_fails_closed() -> None:
    ocr, tracking, motion = _inputs()
    with pytest.raises(EvidenceContractError, match="MISSING_TEMPORAL_FRAME"):
        _ = assemble_evidence_bundle(ocr, tracking, motion, (0, 1))


def test_missing_owner_bounds_fails_closed() -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    measurements = tuple(replace(item, owner_id=None) if item.name == "ocr.bounds" else item for item in bundle.measurements)
    with pytest.raises(EvidenceContractError, match="MISSING_OWNER_BOUNDS"):
        validate_evidence_bundle(replace(bundle, measurements=measurements))


def test_missing_track_sample_fails_closed() -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    with pytest.raises(EvidenceContractError, match="MISSING_TRACK_SAMPLE"):
        validate_evidence_bundle(replace(bundle, measurements=tuple(item for item in bundle.measurements if item.name != "tracking.sample")))


def test_unbound_effect_fails_closed() -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    with pytest.raises(EvidenceContractError, match="UNBOUND_EFFECT"):
        validate_evidence_bundle(replace(bundle, measurements=tuple(item for item in bundle.measurements if item.name != "bloom.radial-profile")))


def test_unclassified_depth_overlap_fails_closed() -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    with pytest.raises(EvidenceContractError, match="UNCLASSIFIED_DEPTH_OVERLAP"):
        validate_evidence_bundle(replace(bundle, measurements=tuple(item for item in bundle.measurements if item.name != "depth.median")))


def test_insufficient_matting_evidence_fails_closed() -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    with pytest.raises(EvidenceContractError, match="INSUFFICIENT_MATTING_EVIDENCE"):
        validate_evidence_bundle(replace(bundle, measurements=tuple(item for item in bundle.measurements if item.name != "matte.coverage")))


def test_missing_confidence_fails_closed() -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    measurements = tuple(replace(item, confidence=2.0) if item.name == "ocr.bounds" else item for item in bundle.measurements)
    with pytest.raises(EvidenceContractError, match="MISSING_CONFIDENCE"):
        validate_evidence_bundle(replace(bundle, measurements=measurements))


def test_vlm_placeholder_fails_closed_at_t19_boundary() -> None:
    frames = tuple(SourceFrame(index, b"native", f"crop-{index}") for index in range(3))
    with pytest.raises(OcrBoundsError, match="PLACEHOLDER_VLM_RESPONSE"):
        _ = measure_ocr_bounds(frames, PlaceholderDetector())


@dataclass(frozen=True, slots=True)
class PlaceholderDetector:
    def detect(self, frame: SourceFrame) -> tuple[OcrCandidate, ...]:
        return (OcrCandidate("<placeholder>", PixelBounds(1, 1, 2, 2), 0.9, RegionKind.SUBTITLE, frame.index, "T19-fixture"),)


def test_camera_collision_fails_closed_at_t21_boundary() -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    with pytest.raises(EvidenceContractError, match="CAMERA_OBJECT_TRAJECTORY_COLLISION"):
        validate_evidence_bundle(replace(bundle, measurements=tuple(item for item in bundle.measurements if item.name != "camera.translation")))


def test_audio_without_anchor_fails_closed_at_t21_boundary() -> None:
    ocr, tracking, motion = _inputs()
    bundle = assemble_evidence_bundle(ocr, tracking, motion, (0, 1, 2))
    with pytest.raises(EvidenceContractError, match="AUDIO_CUE_WITHOUT_MEASURED_ANCHOR"):
        validate_evidence_bundle(replace(bundle, measurements=tuple(item for item in bundle.measurements if item.name != "audio.onset")))
