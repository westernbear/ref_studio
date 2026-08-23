from typing import Final, final, override

from compiler.ocr_bounds import (
    NativeOcrDetector,
    OcrBoundsError,
    OcrCandidate,
    PixelBounds,
    RegionKind,
    measure_ocr_bounds,
)
from compiler.temporal_volume import SourceFrame
@final
class FixtureDetector(NativeOcrDetector):
    def __init__(self, candidates: dict[int, tuple[OcrCandidate, ...]]) -> None:
        self.candidates: Final = candidates

    @override
    def detect(self, frame: SourceFrame) -> tuple[OcrCandidate, ...]:
        return self.candidates.get(frame.index, ())


def frame(index: int) -> SourceFrame:
    return SourceFrame(index, f"native-{index}".encode(), f"crop-{index}")


def candidate(index: int, text: str, bounds: PixelBounds, kind: RegionKind, confidence: float | None = 0.9) -> OcrCandidate:
    return OcrCandidate(text, bounds, confidence, kind, index, f"native-frame:{index}")


def test_measures_korean_english_regions_with_independent_subtitle_and_ui_bounds() -> None:
    frames = (frame(0), frame(1))
    detector = FixtureDetector({
        0: (
            candidate(0, "분석", PixelBounds(120, 280, 150, 72), RegionKind.TITLE),
            candidate(0, "완료", PixelBounds(275, 280, 150, 72), RegionKind.TITLE),
            candidate(0, "Analysis complete", PixelBounds(120, 390, 420, 42), RegionKind.SUBTITLE),
            candidate(0, "result", PixelBounds(120, 500, 600, 300), RegionKind.UI_SURFACE),
        ),
        1: (
            candidate(1, "분석", PixelBounds(120, 280, 150, 72), RegionKind.TITLE),
            candidate(1, "완료", PixelBounds(275, 280, 150, 72), RegionKind.TITLE),
            candidate(1, "Analysis complete", PixelBounds(120, 390, 420, 42), RegionKind.SUBTITLE),
            candidate(1, "result", PixelBounds(120, 500, 600, 300), RegionKind.UI_SURFACE),
        ),
    })
    result = measure_ocr_bounds(frames, detector)
    assert len(result.regions) == 4
    assert {region.text for region in result.regions} == {"분석", "완료", "Analysis complete", "result"}
    subtitle = next(region for region in result.regions if region.kind is RegionKind.SUBTITLE)
    assert subtitle.bounds == PixelBounds(120, 390, 420, 42)
    assert subtitle.source_frame_indices == (0, 1)
    assert result.native_references == (b"native-0", b"native-1")
    assert measure_ocr_bounds(frames, detector) == result


def test_rejects_stable_failure_tokens() -> None:
    cases = (
        (candidate(0, " ", PixelBounds(0, 0, 4, 4), RegionKind.TEXT_WORD), "BLANK_TEXT"),
        (candidate(0, "blur", PixelBounds(0, 0, 0, 4), RegionKind.TEXT_WORD), "BLURRED_TEXT"),
        (candidate(0, "ambiguous", PixelBounds(0, 0, 4, 4), RegionKind.TEXT_WORD, 1.1), "CONFIDENCE_OUT_OF_RANGE"),
        (candidate(0, "missing", PixelBounds(0, 0, 4, 4), RegionKind.TEXT_WORD, None), "MISSING_CONFIDENCE"),
        (candidate(0, "placeholder", PixelBounds(0, 0, 4, 4), RegionKind.TEXT_WORD), "PLACEHOLDER_VLM_RESPONSE"),
    )
    for item, token in cases:
        text = "<placeholder>" if item.text == "placeholder" else item.text
        invalid = OcrCandidate(text, item.bounds, item.confidence, item.kind, item.source_frame_index, item.provenance)
        try:
            _ = measure_ocr_bounds((frame(0),), FixtureDetector({0: (invalid,)}))
        except OcrBoundsError as error:
            assert token in str(error)
        else:
            raise AssertionError(f"expected {token}")


def test_rejects_swapped_subtitle_and_missing_ui_owner_bounds() -> None:
    swapped = FixtureDetector({0: (
        candidate(0, "title", PixelBounds(10, 400, 40, 40), RegionKind.TITLE),
        candidate(0, "subtitle", PixelBounds(10, 100, 80, 20), RegionKind.SUBTITLE),
    )})
    try:
        _ = measure_ocr_bounds((frame(0),), swapped)
    except OcrBoundsError as error:
        assert "SUBTITLE_GEOMETRY_INVALID" in str(error)
    else:
        raise AssertionError("expected subtitle geometry failure")
    missing_ui = FixtureDetector({0: (candidate(0, "ui", PixelBounds(1, 2, 1, 4), RegionKind.UI_SURFACE),)})
    try:
        _ = measure_ocr_bounds((frame(0),), missing_ui)
    except OcrBoundsError as error:
        assert "MISSING_OWNER_BOUNDS" in str(error)
    else:
        raise AssertionError("expected owner bounds failure")
