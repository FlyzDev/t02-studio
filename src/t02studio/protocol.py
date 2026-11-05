"""Small, deterministic ESC/POS GS v 0 packets; T02 is the verified default."""

from __future__ import annotations

from PIL import Image

from .profiles import PrinterProfile, T02_PROFILE

PRINT_WIDTH = 384
ROW_BYTES = PRINT_WIDTH // 8
MAX_HEIGHT = 8000
BLOCK_ROWS = 255


def encode_raster(image: Image.Image, *, profile: PrinterProfile = T02_PROFILE) -> bytes:
    if profile.protocol != "escpos-gsv0":
        raise ValueError("Unsupported raster packet format")
    if image.width != profile.width_px:
        raise ValueError(f"{profile.name} print width must be {profile.width_px} pixels")
    if not 1 <= image.height <= profile.max_height_px:
        raise ValueError("Print is empty or too long")
    row_bytes = profile.width_px // 8
    packed_white_bits = image.convert("1").tobytes()
    packet = bytearray(b"\x1b\x40\x1b\x61\x01")
    for first_row in range(0, image.height, BLOCK_ROWS):
        rows = min(BLOCK_ROWS, image.height - first_row)
        packet.extend(b"\x1d\x76\x30\x00")
        packet.extend(row_bytes.to_bytes(2, "little"))
        packet.extend(rows.to_bytes(2, "little"))
        chunk = packed_white_bits[first_row * row_bytes:(first_row + rows) * row_bytes]
        packet.extend(byte ^ 0xFF for byte in chunk)
    packet.extend(b"\x1b\x64\x03")
    return bytes(packet)
