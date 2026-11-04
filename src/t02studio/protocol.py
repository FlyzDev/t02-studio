"""Small, deterministic ESC/POS raster packets understood by our paired T02."""

from __future__ import annotations

from PIL import Image

PRINT_WIDTH = 384
ROW_BYTES = PRINT_WIDTH // 8
MAX_HEIGHT = 8000
BLOCK_ROWS = 255


def encode_raster(image: Image.Image) -> bytes:
    if image.width != PRINT_WIDTH:
        raise ValueError("T02 baskı genişliği 384 piksel olmalı")
    if not 1 <= image.height <= MAX_HEIGHT:
        raise ValueError("Baskı fazla uzun veya boş")
    packed_white_bits = image.convert("1").tobytes()
    packet = bytearray(b"\x1b\x40\x1b\x61\x01")
    for first_row in range(0, image.height, BLOCK_ROWS):
        rows = min(BLOCK_ROWS, image.height - first_row)
        packet.extend(b"\x1d\x76\x30\x00")
        packet.extend(ROW_BYTES.to_bytes(2, "little"))
        packet.extend(rows.to_bytes(2, "little"))
        chunk = packed_white_bits[first_row * ROW_BYTES:(first_row + rows) * ROW_BYTES]
        packet.extend(byte ^ 0xFF for byte in chunk)
    packet.extend(b"\x1b\x64\x03")
    return bytes(packet)
