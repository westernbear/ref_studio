from dataclasses import dataclass
import pytest

from compiler.matting_tracking import AlphaMatte, MattingTrackingError, track_matting
from compiler.ocr_bounds import MeasuredRegion, PixelBounds, RegionKind


@dataclass(frozen=True, slots=True)
class FixtureMatte:
    mattes: tuple[AlphaMatte, ...]

    def matte(self, frame_index: int) -> AlphaMatte:
        return next(matte for matte in self.mattes if matte.frame_index == frame_index)


def region() -> MeasuredRegion:
    return MeasuredRegion("subtitle:hello:1:1", "hello", RegionKind.SUBTITLE, PixelBounds(1, 1, 2, 2), 0.9, (0, 1, 2), ("fixture",))


def matte(index: int, alpha: float = 1.0) -> AlphaMatte:
    rows = tuple(tuple(alpha if 1 <= x <= 2 and 1 <= y <= 2 else 0.0 for x in range(4)) for y in range(4))
    return AlphaMatte(index, 4, 4, rows)


def test_tracks_identity_lifecycle_and_residual_separately() -> None:
    result = track_matting((region(),), (0, 1, 2), FixtureMatte((matte(0), matte(1), matte(2))), 4, 4)
    subtitle = next(track for track in result.tracks if track.owner_id.startswith("subtitle:"))
    assert subtitle.start_frame == 0
    assert subtitle.end_frame == 2
    assert subtitle.samples[1].appearance_continuity == 1.0
    assert subtitle.samples[1].iou == 1.0
    assert subtitle.masks[0].coverage == 1.0
    assert subtitle.masks[0].alpha_min == 1.0
    assert len(result.residual) == 3
    assert result.residual[0].coverage == 1.0
    assert track_matting((region(),), (0, 1, 2), FixtureMatte((matte(0), matte(1), matte(2))), 4, 4) == result


def test_occlusion_is_tracked_without_inventing_owner() -> None:
    occluded = MeasuredRegion("subtitle:hello:1:1", "hello", RegionKind.SUBTITLE, PixelBounds(1, 1, 2, 2), 0.9, (0, 2), ("fixture",))
    result = track_matting((occluded,), (0, 1, 2), FixtureMatte((matte(0), matte(1), matte(2))), 4, 4)
    assert result.tracks[0].samples[1].overlap.value == "occluded"
    assert len(result.choices) == 0


def test_rejects_insufficient_matting_and_unknown_frame() -> None:
    with pytest.raises(MattingTrackingError, match="INSUFFICIENT_MATTING_EVIDENCE"):
        _ = track_matting((), (0,), FixtureMatte((AlphaMatte(0, 2, 2, ((0.0, 0.0), (0.0, 0.0))),)), 2, 2)
    with pytest.raises(MattingTrackingError, match="OWNER_MISMATCH"):
        _ = track_matting((), (0,), FixtureMatte((matte(9),)), 4, 4)


def test_multiple_non_text_instances_emit_one_choice() -> None:
    result = track_matting((), (0, 1), FixtureMatte((matte(0), matte(1))), 4, 4, (PixelBounds(0, 0, 1, 1), PixelBounds(2, 2, 1, 1)))
    assert len(result.choices) == 1
    assert result.choices[0].reason == "MULTI_INSTANCE_MATTE_LIMIT"


def test_rejects_unclassified_partial_foreground_overlap() -> None:
    partial = matte(0, 0.5)
    with pytest.raises(MattingTrackingError, match="UNCLASSIFIED_DEPTH_OVERLAP"):
        _ = track_matting((region(),), (0,), FixtureMatte((partial,)), 4, 4)
