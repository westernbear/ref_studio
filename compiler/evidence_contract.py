from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Final, TypedDict

from compiler.matting_tracking import MattingTrackingResult
from compiler.motion_effects_audio import Claim, MotionEffectsAudioResult
from compiler.ocr_bounds import OcrBoundsResult

CONTRACT_VERSION: Final = "1.0.0"
FAIL_CLOSED_STATES: Final = (
    "VLM_DELETED_MEASUREMENT", "MISSING_TEMPORAL_FRAME", "MISSING_OWNER_BOUNDS",
    "MISSING_TRACK_SAMPLE", "UNBOUND_EFFECT", "UNCLASSIFIED_DEPTH_OVERLAP",
    "INSUFFICIENT_MATTING_EVIDENCE", "MISSING_CONFIDENCE", "PLACEHOLDER_VLM_RESPONSE",
    "CAMERA_OBJECT_TRAJECTORY_COLLISION", "AUDIO_CUE_WITHOUT_MEASURED_ANCHOR",
)


class EvidenceContractError(RuntimeError):
    """A fail-closed evidence bundle contract violation."""


class EvidenceState(StrEnum):
    OBSERVED = "OBSERVED"
    MAPPED = "MAPPED"
    NEEDS_CHOICE = "NEEDS CHOICE"


@dataclass(frozen=True, slots=True)
class LabelProposal:
    """VLM metadata; it has no authority over measurements."""

    target_id: str
    label: str


@dataclass(frozen=True, slots=True)
class EvidenceMeasurement:
    name: str
    value: str
    units: str
    confidence: float
    source: str
    owner_id: str | None
    provenance: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class EvidenceMapping:
    owner_id: str
    effects: tuple[str, ...]
    source: str
    confidence: float


@dataclass(frozen=True, slots=True)
class EvidenceChoice:
    frame_index: int
    polygon: tuple[tuple[int, int], ...]
    reason: str


class ResidualRecord(TypedDict):
    frame: str
    coverage: str


@dataclass(frozen=True, slots=True)
class EvidenceBundle:
    contract_version: str
    state: EvidenceState
    measurements: tuple[EvidenceMeasurement, ...]
    mappings: tuple[EvidenceMapping, ...]
    residual_canvas: tuple[ResidualRecord, ...]
    choices: tuple[EvidenceChoice, ...]
    labels: tuple[LabelProposal, ...]
    later_gates_blocked: bool


def _fail(token: str, detail: str) -> None:
    raise EvidenceContractError(f"{token} {detail}")


def _claim_measurement(claim: Claim, source: str, confidence: float) -> EvidenceMeasurement:
    if not claim.units:
        _fail("MISSING_OWNER_BOUNDS", claim.name)
    if not 0.0 <= confidence <= 1.0:
        _fail("MISSING_CONFIDENCE", claim.name)
    owner = claim.owner_id
    if claim.name.startswith(("bloom.", "defocus.", "rim.")) and owner is None:
        _fail("UNBOUND_EFFECT", claim.name)
    return EvidenceMeasurement(claim.name, repr(claim.value), claim.units, confidence, source, owner, (source,))


def assemble_evidence_bundle(
    ocr: OcrBoundsResult,
    tracking: MattingTrackingResult,
    motion: MotionEffectsAudioResult,
    expected_frame_indices: tuple[int, ...],
    labels: tuple[LabelProposal, ...] = (),
) -> EvidenceBundle:
    """Merge T19-T21 outputs without allowing semantic labels to alter evidence."""
    if tuple(range(len(ocr.native_references))) != expected_frame_indices:
        _fail("MISSING_TEMPORAL_FRAME", repr(expected_frame_indices))
    if len(tracking.choices) > 1:
        _fail("UNRESOLVED_CHOICE_SKIPPED", "more than one choice")
    measurements: list[EvidenceMeasurement] = []
    for region in ocr.regions:
        measurements.append(EvidenceMeasurement("ocr.bounds", repr(region.bounds), "pixels", region.confidence, "T19", region.track_id, region.provenance))
        if not region.source_frame_indices:
            _fail("MISSING_TEMPORAL_FRAME", region.track_id)
    for track in tracking.tracks:
        if not track.samples:
            _fail("MISSING_TRACK_SAMPLE", track.owner_id)
        for sample in track.samples:
            measurements.append(EvidenceMeasurement("tracking.sample", repr(sample.centroid), "pixels", sample.confidence, "T20", track.owner_id, ("T20",)))
        for mask in track.masks:
            measurements.append(EvidenceMeasurement("matte.coverage", repr(mask.coverage), "normalized-canvas", min(mask.alpha_min, mask.alpha_max), "T20", track.owner_id, ("T20",)))
    for residual in tracking.residual:
        measurements.append(EvidenceMeasurement("residual.coverage", repr(residual.coverage), "normalized-canvas", 1.0, "T20", None, ("T20",)))
    claims = motion.camera.claims + motion.depth.median_normalized_depth + motion.rhythm.activity_peaks + motion.rhythm.easing_residuals
    claims += motion.effects.bloom + motion.effects.defocus + motion.effects.rim + motion.effects.lower_light
    measurements.extend(_claim_measurement(claim, "T21", claim.confidence) for claim in claims)
    for anchor in motion.audio:
        measurements.append(_claim_measurement(anchor.claim, "T21", anchor.claim.confidence))
    owners = {track.owner_id for track in tracking.tracks}
    mappings = tuple(
        EvidenceMapping(
            owner,
            tuple(sorted({item.name for item in measurements if item.owner_id == owner and item.name != "tracking.sample"})),
            "T20/T21",
            min(item.confidence for item in measurements if item.owner_id == owner),
        )
        for owner in sorted(owners)
    )
    choices = tuple(EvidenceChoice(choice.frame_index, choice.polygon, choice.reason) for choice in tracking.choices)
    bundle = EvidenceBundle(CONTRACT_VERSION, EvidenceState.NEEDS_CHOICE if choices else EvidenceState.MAPPED, tuple(measurements), mappings, tuple({"frame": str(item.frame_index), "coverage": str(item.coverage)} for item in tracking.residual), choices, labels, bool(choices))
    validate_evidence_bundle(bundle)
    return bundle


def validate_evidence_bundle(bundle: EvidenceBundle) -> None:
    """Validate an assembled bundle before any later gate can consume it."""
    if bundle.contract_version != CONTRACT_VERSION:
        _fail("MISSING_CONFIDENCE", bundle.contract_version)
    if len(bundle.choices) > 1:
        _fail("UNRESOLVED_CHOICE_SKIPPED", "more than one choice")
    if not any(item.name == "ocr.bounds" for item in bundle.measurements):
        _fail("VLM_DELETED_MEASUREMENT", "ocr.bounds")
    required = {"ocr.bounds", "tracking.sample", "matte.coverage", "residual.coverage", "camera.translation", "depth.median", "rhythm.activity-peak", "bloom.radial-profile", "defocus.gaussian-sigma", "rim.profile", "lower-light.field", "audio.onset"}
    present = {item.name for item in bundle.measurements}
    missing = required - present
    if bundle.choices:
        missing -= {"tracking.sample", "matte.coverage"}
    if missing:
        token = "AUDIO_CUE_WITHOUT_MEASURED_ANCHOR" if "audio.onset" in missing else "MISSING_OWNER_BOUNDS" if "ocr.bounds" in missing else "MISSING_TRACK_SAMPLE" if "tracking.sample" in missing else "INSUFFICIENT_MATTING_EVIDENCE" if "matte.coverage" in missing else "MISSING_TEMPORAL_FRAME" if "residual.coverage" in missing else "CAMERA_OBJECT_TRAJECTORY_COLLISION" if "camera.translation" in missing else "UNCLASSIFIED_DEPTH_OVERLAP" if "depth.median" in missing else "UNBOUND_EFFECT"
        _fail(token, ",".join(sorted(missing)))
    for measurement in bundle.measurements:
        if not measurement.source or not measurement.units:
            _fail("MISSING_OWNER_BOUNDS", measurement.name)
        if measurement.name == "ocr.bounds" and measurement.owner_id is None:
            _fail("MISSING_OWNER_BOUNDS", measurement.name)
        if not 0.0 <= measurement.confidence <= 1.0:
            _fail("MISSING_CONFIDENCE", measurement.name)
    measured_ids = {item.owner_id for item in bundle.measurements if item.owner_id is not None}
    for label in bundle.labels:
        if label.target_id not in measured_ids:
            _fail("VLM_DELETED_MEASUREMENT", label.target_id)
        if not label.label.strip() or label.label.casefold() in {"delete", "replace", "hide"}:
            _fail("VLM_DELETED_MEASUREMENT", label.target_id)
    for mapping in bundle.mappings:
        supported = {item.name for item in bundle.measurements if item.owner_id == mapping.owner_id and item.name != "tracking.sample"}
        if not set(mapping.effects) <= supported:
            _fail("UNBOUND_EFFECT", mapping.owner_id)
    if bundle.choices and not bundle.later_gates_blocked:
        _fail("UNRESOLVED_CHOICE_SKIPPED", "later gates unblocked")
    if bundle.state is EvidenceState.NEEDS_CHOICE and not bundle.choices:
        _fail("UNRESOLVED_CHOICE_SKIPPED", "observed bundle mapped")
