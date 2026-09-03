from pathlib import Path

from compiler.preflight import digest


def test_digest_sha256() -> None:
    path = Path(__file__).with_name("_digest.bin")
    path.write_bytes(b"abc")
    try:
        assert (
            digest(path)
            == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
    finally:
        path.unlink(missing_ok=True)
