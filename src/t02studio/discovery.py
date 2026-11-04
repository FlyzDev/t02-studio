"""Read-only discovery of serial ports already registered with the host OS.

T02 Studio does not scan nearby Bluetooth devices, pair devices, open a port,
or transmit bytes during discovery. Bluetooth RFCOMM must first be paired in
Windows so the operating system creates an outgoing COM port.
"""

from __future__ import annotations

import re


def available_ports(port_provider=None) -> list[dict[str, str | bool]]:
    if port_provider is None:
        try:
            from serial.tools import list_ports
        except ImportError:
            return []
        port_provider = list_ports.comports

    ports = []
    seen = set()
    for info in port_provider():
        name = str(getattr(info, "device", "") or "").upper()
        if not re.fullmatch(r"COM[1-9]\d{0,2}", name) or name in seen:
            continue
        seen.add(name)
        description = str(getattr(info, "description", "") or "Serial port").strip()[:180]
        metadata = " ".join(str(getattr(info, field, "") or "")
                            for field in ("description", "hwid", "manufacturer", "product", "interface"))
        metadata = metadata.lower()
        bluetooth = any(token in metadata for token in
                        ("bluetooth", "bthenum", "rfcomm", "bthmodem"))
        usb = bool(getattr(info, "vid", None)) or any(token in metadata for token in
                    ("usb", "vid:", "usbser"))
        likely_printer = any(token in metadata for token in ("phomemo", "t02 mini", "t02 printer"))
        transport = "Bluetooth" if bluetooth else "USB" if usb else "Serial"
        ports.append({"port": name, "description": description,
                      "transport": transport, "likely_printer": likely_printer})
    return sorted(ports, key=lambda item: (
        not item["likely_printer"], item["transport"] != "Bluetooth",
        int(str(item["port"])[3:])))
