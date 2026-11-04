"""Password-free, private-network-only Windows startup for T02 Studio."""

from __future__ import annotations

import ipaddress
import os

from .server import create_app


def validate_bind_host(address: str) -> str:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError as exc:
        raise ValueError("Server bind address must be an IP address") from exc
    permitted = ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
    if not any(ip in ipaddress.ip_network(net) for net in permitted):
        raise ValueError("Only loopback or RFC1918 private IPv4 addresses are allowed")
    return address


def main() -> None:
    from waitress import serve

    bind_host = validate_bind_host(os.environ.get("T02_BIND_HOST", "127.0.0.1"))
    port = int(os.environ.get("T02_PORT", "8062"))
    if not 1024 <= port <= 65535:
        raise ValueError("Port must be between 1024 and 65535")
    app = create_app()
    print(f"T02 Studio: http://{bind_host}:{port}", flush=True)
    print("No login required for devices on the trusted home LAN.", flush=True)
    print("Pair the printer with Windows Bluetooth, then select its port in the web UI.", flush=True)
    serve(app, host=bind_host, port=port, threads=4)


if __name__ == "__main__":
    main()
