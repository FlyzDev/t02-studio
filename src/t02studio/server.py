"""Password-free trusted LAN browser app; no cloud or background replay."""

from __future__ import annotations

import io
import ipaddress
import os
import re
import threading
import time
import uuid

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.exceptions import RequestEntityTooLarge

from .discovery import available_ports
from .pdf import render_pdf_segments
from .printer import PrinterBusy, PrinterError, PrinterUnavailable, print_image
from .raster import render_barcode, render_qr, render_text, render_upload


def _number(key: str, default: float, cast=float):
    value = request.form.get(key, default)
    try:
        return cast(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(f"Invalid value for {key}") from exc


def _file_blob() -> bytes:
    uploaded = request.files.get("file")
    if not uploaded:
        raise ValueError("Choose a file first")
    blob = uploaded.read(31 * 1024 * 1024)
    if not blob:
        raise ValueError("The file is empty")
    return blob


def _render_request(*, preview: bool = False):
    kind = request.form.get("kind", "text")
    if kind == "text":
        return render_text(
            request.form.get("text", ""),
            font_size=_number("font_size", 25, int),
            padding=_number("padding", 16, int),
            bold=request.form.get("bold") == "true",
            align=request.form.get("align", "left"),
        ), 0, 1
    if kind == "image":
        return render_upload(
            _file_blob(),
            density=_number("density", 50, int),
            dither=request.form.get("dither", "true") == "true",
            rotate=_number("rotate", 0, int),
            brightness=_number("brightness", 1.0),
            contrast=_number("contrast", 1.0),
            sharpness=_number("sharpness", 1.0),
            mode=request.form.get("image_mode", "fit"),
            target_height=_number("target_height", 180, int),
        ), 0, 1
    if kind == "pdf":
        segments = render_pdf_segments(
            _file_blob(),
            mode=request.form.get("pdf_mode", "smart"),
            pages=request.form.get("pages", ""),
            options={"ocr": request.form.get("ocr") == "true"},
        )
        index = _number("segment", 0, int)
        if not 0 <= index < len(segments):
            raise ValueError(f"PDF segment must be between 1 and {len(segments)}")
        return segments[index], index, len(segments)
    if kind == "qr":
        return render_qr(request.form.get("qr_value", ""), request.form.get("caption", ""),
                         compact=preview and request.form.get("compact") == "true"), 0, 1
    if kind == "barcode":
        return render_barcode(request.form.get("barcode_value", ""),
                              request.form.get("barcode_type", "code128"),
                              request.form.get("barcode_caption", "true") == "true"), 0, 1
    raise ValueError("Unknown content type")


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    allowlist = ["127.0.0.0/8", "::1/128"]
    allowlist.extend(part.strip() for part in os.environ.get("T02_ALLOWED_NETWORKS", "").split(",") if part.strip())
    for net in allowlist:
        ipaddress.ip_network(net, strict=False)
    app.config.update(
        COM_PORT=os.environ.get("T02_COM_PORT", "").upper(),
        PORT_LIST_FUNCTION=available_ports,
        ALLOWED_NETWORKS=allowlist,
        MAX_CONTENT_LENGTH=35 * 1024 * 1024,
        PRINT_FUNCTION=print_image,
    )
    if config:
        app.config.update(config)
    job_lock = threading.Lock()
    attempted_jobs: dict[str, float] = {}

    @app.before_request
    def restrict_network():
        try:
            client_ip = ipaddress.ip_address(request.remote_addr or "")
            trusted = any(client_ip in ipaddress.ip_network(net, strict=False)
                          for net in app.config["ALLOWED_NETWORKS"])
        except ValueError:
            trusted = False
        if not trusted:
            return jsonify(error="This interface is available only to trusted local-network clients"), 403
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("Origin")
            if origin and origin.rstrip("/") != request.host_url.rstrip("/"):
                return jsonify(error="Print requests from another website are not accepted"), 403
            if request.headers.get("Sec-Fetch-Site") in {"cross-site", "same-site"}:
                return jsonify(error="Untrusted browser origin"), 403

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(error):
        return jsonify(error="File size limit exceeded"), 413

    @app.get("/")
    def index():
        return render_template("studio_alt.html")

    @app.get("/composer")
    def legacy_composer():
        return render_template("studio.html")

    @app.get("/classic")
    def classic():
        return render_template("index.html")

    @app.get("/alt")
    def alternative_studio():
        return render_template("studio_alt.html")

    @app.get("/api/status")
    def status():
        port_name = app.config["COM_PORT"]
        visible = any(item["port"] == port_name for item in app.config["PORT_LIST_FUNCTION"]())
        return jsonify(port=port_name, port_visible=visible,
                       message="A listed port does not guarantee the printer is powered on")

    @app.get("/api/printers")
    def printers():
        return jsonify(ports=app.config["PORT_LIST_FUNCTION"](),
                       configured_port=app.config["COM_PORT"],
                       hint="Pair the printer in Windows Bluetooth settings first, then rescan. "
                            "Only existing serial ports are listed; discovery never sends data.")

    @app.post("/api/preview")
    def preview():
        try:
            image, segment_index, total_segments = _render_request(preview=True)
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        stream = io.BytesIO()
        image.save(stream, format="PNG")
        stream.seek(0)
        response = send_file(stream, mimetype="image/png", as_attachment=False)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Print-Length-MM"] = str(round(image.height / 203 * 25.4, 1))
        if request.form.get("kind") == "pdf":
            response.headers["X-PDF-Mode"] = request.form.get("pdf_mode", "smart")
            response.headers["X-Total-Segments"] = str(total_segments)
            response.headers["X-Segment-Index"] = str(segment_index)
        return response

    @app.post("/api/print")
    def print_job():
        try:
            image, segment_index, total_segments = _render_request()
            job_id = str(uuid.UUID(request.form.get("job_id", "")))
            port_name = (request.form.get("printer_port") or app.config["COM_PORT"]).strip().upper()
            if not re.fullmatch(r"COM[1-9]\d{0,2}", port_name):
                raise PrinterUnavailable("Select a detected printer port before printing")
            if not any(item["port"] == port_name for item in app.config["PORT_LIST_FUNCTION"]()):
                raise PrinterUnavailable(f"{port_name} is no longer available. Rescan and select a port.")
        except PrinterUnavailable as exc:
            return jsonify(error=str(exc)), 503
        except (ValueError, AttributeError) as exc:
            return jsonify(error=str(exc)), 400
        with job_lock:
            now = time.monotonic()
            for previous, stamped in list(attempted_jobs.items()):
                if now - stamped > 1800:
                    del attempted_jobs[previous]
            if job_id in attempted_jobs:
                return jsonify(error="This print job was already submitted; click again for a new job"), 409
            attempted_jobs[job_id] = now
        try:
            result = app.config["PRINT_FUNCTION"](image, port_name)
        except PrinterBusy as exc:
            return jsonify(error=str(exc)), 409
        except PrinterUnavailable as exc:
            return jsonify(error=str(exc)), 503
        except PrinterError as exc:
            return jsonify(error=str(exc)), 502
        return jsonify(status="printed", bytes_sent=result.bytes_written,
                       length_mm=round(image.height / 203 * 25.4, 1), port=result.port_name,
                       segment_index=segment_index, total_segments=total_segments)

    return app
