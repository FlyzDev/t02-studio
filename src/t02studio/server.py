"""Password-free trusted LAN browser app; no cloud or background replay."""

from __future__ import annotations

import io
import ipaddress
import os
import threading
import time
import uuid

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.exceptions import RequestEntityTooLarge

from .pdf import render_pdf_segments
from .printer import PrinterBusy, PrinterError, PrinterUnavailable, print_image
from .raster import render_qr, render_text, render_upload


def _number(key: str, default: float, cast=float):
    value = request.form.get(key, default)
    try:
        return cast(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(f"{key} için geçersiz değer") from exc


def _file_blob() -> bytes:
    uploaded = request.files.get("file")
    if not uploaded:
        raise ValueError("Önce bir dosya seçin")
    blob = uploaded.read(31 * 1024 * 1024)
    if not blob:
        raise ValueError("Dosya boş")
    return blob


def _render_request():
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
            raise ValueError(f"PDF parçası 1 ile {len(segments)} arasında olmalı")
        return segments[index], index, len(segments)
    if kind == "qr":
        return render_qr(request.form.get("qr_value", ""), request.form.get("caption", "")), 0, 1
    raise ValueError("Bilinmeyen içerik türü")


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    allowlist = ["127.0.0.0/8", "::1/128"]
    allowlist.extend(part.strip() for part in os.environ.get("T02_ALLOWED_NETWORKS", "").split(",") if part.strip())
    for net in allowlist:
        ipaddress.ip_network(net, strict=False)
    app.config.update(
        COM_PORT=os.environ.get("T02_COM_PORT", "COM6"),
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
            return jsonify(error="Bu arayüze yalnızca ev ağından erişilebilir"), 403
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("Origin")
            if origin and origin.rstrip("/") != request.host_url.rstrip("/"):
                return jsonify(error="Başka bir siteden baskı isteği kabul edilmez"), 403
            if request.headers.get("Sec-Fetch-Site") in {"cross-site", "same-site"}:
                return jsonify(error="Tarayıcı kaynağı güvenilir değil"), 403

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(error):
        return jsonify(error="Dosya boyutu sınırı aşıldı"), 413

    @app.get("/")
    def index():
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
        try:
            from serial.tools import list_ports
            visible = any(port.device.upper() == port_name.upper() for port in list_ports.comports())
        except ImportError:
            visible = False
        return jsonify(port=port_name, port_visible=visible,
                       message="Port listede olsa bile yazıcı kapalı olabilir")

    @app.post("/api/preview")
    def preview():
        try:
            image, segment_index, total_segments = _render_request()
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
        except (ValueError, AttributeError) as exc:
            return jsonify(error=str(exc)), 400
        with job_lock:
            now = time.monotonic()
            for previous, stamped in list(attempted_jobs.items()):
                if now - stamped > 1800:
                    del attempted_jobs[previous]
            if job_id in attempted_jobs:
                return jsonify(error="Bu baskı talebi zaten gönderildi; yeni baskı için tekrar tıklayın"), 409
            attempted_jobs[job_id] = now
        try:
            result = app.config["PRINT_FUNCTION"](image, app.config["COM_PORT"])
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
