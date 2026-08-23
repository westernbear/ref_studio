from fractions import Fraction
from pathlib import Path

import pytest

from compiler.temporal_volume import (
    AnalysisProfile,
    NormalizedArtifact,
    SourceFrame,
    TemporalVolumeError,
    TemporalVolumeRequest,
    MutableCancellationToken,
    ResourceBudget,
    extract_temporal_volume,
)


def artifact(fps: int = 24, frames: int | None = None) -> NormalizedArtifact:
    count = frames if frames is not None else fps * 4
    return NormalizedArtifact("source-1", "normalized-1", Path("working.mp4"), Fraction(fps), 1080, 1920, count)


def provider(count: int, start: int = 0) -> list[SourceFrame]:
    return [SourceFrame(index, b"native", f"crop-{index}") for index in range(start, start + count)]


@pytest.mark.parametrize("fps", [24, 25, 30, 50, 60])
def test_extracts_every_frame_with_rational_time_mapping(fps: int) -> None:
    result = extract_temporal_volume(TemporalVolumeRequest(artifact(fps), 0, 4_000), provider(fps * 4))
    assert len(result.frames) == fps * 4
    assert result.frames[0].time_ms == 0
    assert result.frames[-1].time_ms == (fps * 4 - 1) * 1_000 // fps
    assert result.provenance.frame_count == fps * 4
    assert result.analysis_profile == AnalysisProfile.PRIMARY
    assert result.frames[0].native_reference == b"native"


def test_rejects_bad_frame_sequence_and_interval() -> None:
    with pytest.raises(TemporalVolumeError, match="MISSING_TEMPORAL_FRAME"):
        _ = extract_temporal_volume(TemporalVolumeRequest(artifact(), 0, 4_000), provider(23))
    with pytest.raises(TemporalVolumeError, match="DUPLICATE_TEMPORAL_FRAME"):
        duplicate = provider(96)
        duplicate[-1] = SourceFrame(94, b"x", "x")
        _ = extract_temporal_volume(TemporalVolumeRequest(artifact(), 0, 4_000), duplicate)
    disordered = provider(96)
    disordered[1], disordered[2] = disordered[2], disordered[1]
    with pytest.raises(TemporalVolumeError, match="OUT_OF_ORDER_TEMPORAL_FRAME"):
        _ = extract_temporal_volume(TemporalVolumeRequest(artifact(), 0, 4_000), disordered)
    with pytest.raises(TemporalVolumeError, match="TEMPORAL_INTERVAL_INVALID"):
        _ = extract_temporal_volume(TemporalVolumeRequest(artifact(), 0, 4_100), provider(96))


def test_rejects_bounds_count_corruption_and_cancellation() -> None:
    with pytest.raises(TemporalVolumeError, match="TEMPORAL_FRAME_LIMIT"):
        _ = extract_temporal_volume(TemporalVolumeRequest(artifact(60, 241), 0, 4_000), provider(241))
    with pytest.raises(TemporalVolumeError, match="SOURCE_DIMENSIONS_INVALID"):
        _ = extract_temporal_volume(TemporalVolumeRequest(NormalizedArtifact("s", "n", Path("x.mp4"), Fraction(24), 100, 100, 96), 0, 4_000), provider(96))
    token = MutableCancellationToken()
    token.cancel()
    with pytest.raises(TemporalVolumeError, match="COMPILER_CANCELLED"):
        _ = extract_temporal_volume(TemporalVolumeRequest(artifact(), 0, 4_000), provider(96), cancellation=token)
    with pytest.raises(TemporalVolumeError, match="COMPILER_STAGE_DEADLINE"):
        _ = extract_temporal_volume(TemporalVolumeRequest(artifact(), 0, 4_000), provider(96), budget=ResourceBudget(0.0))
    with pytest.raises(TemporalVolumeError, match="COMPILER_RSS_LIMIT"):
        _ = extract_temporal_volume(TemporalVolumeRequest(artifact(), 0, 4_000), provider(96), budget=ResourceBudget(rss_gib=12.1))


def test_rejects_non_normalized_or_corrupt_artifact() -> None:
    with pytest.raises(TemporalVolumeError, match="NORMALIZED_ARTIFACT_REQUIRED"):
        _ = extract_temporal_volume(TemporalVolumeRequest(NormalizedArtifact("s", "n", Path("quarantine/original.mp4"), Fraction(24), 1080, 1920, 96), 0, 4_000), provider(96))
    with pytest.raises(TemporalVolumeError, match="NORMALIZED_ARTIFACT_CORRUPT"):
        _ = extract_temporal_volume(TemporalVolumeRequest(NormalizedArtifact("s", "n", Path("x"), Fraction(24), 1080, 1920, 95), 0, 4_000), provider(96))
