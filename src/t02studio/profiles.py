"""Printer capabilities, independent of the editor and transport implementation.

Only profiles proven against physical hardware belong in VERIFIED_PROFILES.
Creating a profile is not evidence that its commands work on a real printer.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PrinterProfile:
    id: str
    name: str
    width_px: int
    dpi: int
    max_height_px: int
    protocol: str
    transport: str
    baudrate: int | None = None
    hardware_verified: bool = False

    def __post_init__(self) -> None:
        if not self.id or not self.name:
            raise ValueError("A printer profile needs an ID and a display name")
        if not 8 <= self.width_px <= 4096 or self.width_px % 8:
            raise ValueError("Raster width must be between 8 and 4096 and divisible by 8")
        if not 72 <= self.dpi <= 1200:
            raise ValueError("Printer DPI must be between 72 and 1200")
        if not 1 <= self.max_height_px <= 65535:
            raise ValueError("Invalid maximum print length")
        if self.protocol not in {"escpos-gsv0"}:
            raise ValueError("Unsupported printer raster protocol")
        if self.transport not in {"serial", "usb", "network"}:
            raise ValueError("Unsupported printer transport")
        if self.transport == "serial" and (self.baudrate is None or self.baudrate <= 0):
            raise ValueError("Serial printer profiles need a valid baud rate")

    def public_capabilities(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "width_px": self.width_px,
            "dpi": self.dpi,
            "max_height_px": self.max_height_px,
            "protocol": self.protocol,
            "transport": self.transport,
            "hardware_verified": self.hardware_verified,
        }


T02_PROFILE = PrinterProfile(
    id="phomemo-t02",
    name="Phomemo T02 Mini",
    width_px=384,
    dpi=203,
    max_height_px=8000,
    protocol="escpos-gsv0",
    transport="serial",
    baudrate=9600,
    hardware_verified=True,
)

VERIFIED_PROFILES = (T02_PROFILE,)


def verified_profile(profile_id: str) -> PrinterProfile:
    for profile in VERIFIED_PROFILES:
        if profile.id == profile_id:
            return profile
    raise ValueError(f"Printer profile {profile_id!r} is not hardware-verified")
