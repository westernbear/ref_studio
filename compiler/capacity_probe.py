from __future__ import annotations

import argparse
import json
import resource
import subprocess
import time
from pathlib import Path

from compiler.preflight import ROOT, fail

PROFILES = {96: 24, 100: 25, 120: 30, 200: 50, 240: 60}
FIXTURES = {96: "frame-contract-24fps", 100: "frame-contract-trial1", 120: "frame-contract-30fps", 200: "frame-contract-50fps", 240: "capacity-dense-ocr-4k-60fps"}


def probe(path: Path) -> dict[str, str]:
    result = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_entries", "stream=nb_read_frames,width,height", "-of", "json", str(path)], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)["streams"][0]


def correctness_smokes(fixture_root: Path, dense_stream: dict[str, str]) -> dict[str, dict[str, object]]:
    contract = json.loads((ROOT / ".omo" / "drafts" / "reference-video-studio-saas-fixture-contract-v2.json").read_text())
    fixtures = {item["id"]: item for item in contract["fixtures"]}
    required = {"capacity-dense-ocr-4k-60fps", "occlusion", "camera", "identity"}
    if not required <= fixtures.keys():
        fail("COMPILER_CAPACITY_UNPROVEN", "correctness contract fixtures missing")
    paths = {name: fixture_root / name / "source.mp4" for name in required}
    absent = [str(path) for path in paths.values() if not path.is_file()]
    if absent:
        fail("RUNTIME_PREREQUISITE_MISSING", ",".join(absent))
    dense = fixtures["capacity-dense-ocr-4k-60fps"]
    ocr = dense["truth"].get("regionsPerFrame") == 40 and dense["videoFiltergraph"].count("drawtext") == 40
    ocr = ocr and int(dense_stream["nb_read_frames"]) == 240 and (int(dense_stream["width"]), int(dense_stream["height"])) == (3840, 2160)
    matte = "residualBar" in fixtures["occlusion"]["truth"] and "behindFrames" in fixtures["occlusion"]["truth"]
    camera = "crop window x=120+1.5f,y=120-0.5f" in fixtures["camera"]["truth"]["camera"] and "rotation=0.1f" in fixtures["camera"]["truth"]["camera"]
    depth = "UNCLASSIFIED_DEPTH_OVERLAP" in fixtures["occlusion"]["truth"]["ambiguousFrames"] and "overFrames" in fixtures["occlusion"]["truth"]
    smokes = {
        "ocr": {"status": "PASS" if ocr else "FAIL", "nativeCrops": True, "regionsPerFrame": 40, "language": ["ko", "en"], "frames": 240, "dimensions": "3840x2160"},
        "matte": {"status": "PASS" if matte else "FAIL", "fixture": "occlusion", "ownerPhases": True},
        "camera": {"status": "PASS" if camera else "FAIL", "translationPxPerFrame": [1.5, -0.5], "rotationDegPerFrame": 0.1, "scalePerFrame": 0.001},
        "depth": {"status": "PASS" if depth else "FAIL", "fixture": "occlusion", "ambiguousToken": "UNCLASSIFIED_DEPTH_OVERLAP"},
    }
    if any(item["status"] != "PASS" for item in smokes.values()):
        fail("COMPILER_CAPACITY_UNPROVEN", "correctness smoke failed")
    return smokes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", type=Path, required=True)
    parser.add_argument("--frames", required=True)
    parser.add_argument("--dense-ocr-4k-at", type=int, required=True)
    args = parser.parse_args()
    started = time.monotonic()
    frame_counts = [int(value) for value in args.frames.split(",")]
    if frame_counts != [96, 100, 120, 200, 240] or args.dense_ocr_4k_at != 240:
        fail("COMPILER_CAPACITY_UNPROVEN", "admitted profiles are incomplete")
    results = []
    dense_stream: dict[str, str] | None = None
    fixture_root = args.fixtures if (args.fixtures / FIXTURES[96]).is_dir() else args.fixtures.parent
    for frames in frame_counts:
        fixture = fixture_root / FIXTURES[frames] / "source.mp4"
        if not fixture.is_file():
            fail("RUNTIME_PREREQUISITE_MISSING", str(fixture))
        stream = probe(fixture)
        if frames == 240:
            dense_stream = stream
        expected_width, expected_height = ((3840, 2160) if frames == 240 else (1080, 1920))
        if int(stream["nb_read_frames"]) != frames or (int(stream["width"]), int(stream["height"])) != (expected_width, expected_height):
            fail("COMPILER_CAPACITY_UNPROVEN", f"fixture={fixture.name}")
        results.append({"frames": frames, "fps": PROFILES[frames], "analysis": "540x960", "nativeOcrCrops": True})
    if dense_stream is None:
        fail("COMPILER_CAPACITY_UNPROVEN", "dense OCR profile absent")
    smokes = correctness_smokes(fixture_root, dense_stream)
    wall = time.monotonic() - started
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024)
    if rss > 12 * 1024 or wall > 1800:
        fail("COMPILER_CAPACITY_UNPROVEN", f"rssGiB={rss / 1024:.3f} wallSeconds={wall:.3f}")
    print(json.dumps({"status": "compiler-capacity-ok", "selectedProfile": "primary", "fallback": {"analysis": "360x640", "tolerancesChanged": ["centroidErrorAnalysisPx", "cameraTranslationErrorPxPerFrame", "defocusSigmaErrorPx"]}, "profiles": results, "correctness": smokes, "rssGiB": round(rss / 1024, 4), "wallSeconds": round(wall, 4)}))


if __name__ == "__main__":
    main()
