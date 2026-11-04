"""Turn PDF pages into narrow, readable, printable thermal receipt strips."""

from __future__ import annotations

import io
import math
import re

import pymupdf as fitz
from PIL import Image, ImageOps

from .raster import MAX_HEIGHT, PRINT_WIDTH, render_text, render_upload

MAX_PDF_BYTES = 30 * 1024 * 1024
MAX_PAGES = 20
MAX_PDF_RENDER_PIXELS = 8_000_000


def parse_pages(specification: str, total_pages: int) -> list[int]:
    if total_pages < 1:
        raise ValueError("PDF contains no pages")
    if not specification.strip():
        return list(range(total_pages))
    result = set()
    for piece in specification.split(","):
        piece = piece.strip()
        if not re.fullmatch(r"\d+(-\d+)?", piece):
            raise ValueError("Invalid page selection")
        numbers = [int(x) for x in piece.split("-")]
        first, last = (numbers[0], numbers[0]) if len(numbers) == 1 else numbers
        if first < 1 or last > total_pages or first > last:
            raise ValueError("Selected page was not found in the PDF")
        result.update(range(first - 1, last))
    return sorted(result)


def _validate_pixmap_size(page: fitz.Page, width: int) -> None:
    if page.rect.width <= 0 or page.rect.height <= 0:
        raise ValueError("Invalid PDF page dimensions")
    height = math.ceil(page.rect.height * width / page.rect.width)
    if height > MAX_HEIGHT or width * height > MAX_PDF_RENDER_PIXELS:
        raise ValueError("PDF page is too large or long for printing. Try splitting the pages")


def _page_pixmap(page: fitz.Page, width: int) -> Image.Image:
    _validate_pixmap_size(page, width)
    scale = width / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def _fit_page(page: fitz.Page) -> Image.Image:
    image = _page_pixmap(page, PRINT_WIDTH)
    if image.width != PRINT_WIDTH:
        image = image.resize((PRINT_WIDTH, image.height), Image.Resampling.LANCZOS)
    return image.convert("1", dither=Image.Dither.FLOYDSTEINBERG)


def _smart_page_parts(page: fitz.Page, enable_ocr: bool) -> list[Image.Image]:
    structure = page.get_text("dict", sort=True)
    parts: list[Image.Image] = []
    text_found = False
    for block in structure["blocks"]:
        if block.get("type") == 0:
            lines = []
            sizes = []
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                text_line = "".join(span.get("text", "") for span in spans).strip()
                if text_line:
                    lines.append(text_line)
                    sizes.extend(span.get("size", 12) for span in spans)
            content = "\n".join(lines)
            if not content:
                continue
            text_found = True
            heading = max(sizes, default=12) >= 16
            parts.append(render_text(content, font_size=29 if heading else 22,
                                     padding=14, bold=heading))
        elif block.get("type") == 1 and block.get("image"):
            try:
                parts.append(render_upload(block["image"], dither=True))
            except ValueError:
                continue
    if not text_found:
        if not enable_ocr:
            raise ValueError("This page may be scanned. Smart reflow needs local OCR; try Fit original instead")
        try:
            import pytesseract
            scanned = _page_pixmap(page, 1400)
            text = pytesseract.image_to_string(scanned, lang="tur+eng").strip()
        except (ImportError, OSError, RuntimeError) as exc:
            raise ValueError("OCR is unavailable. Choose Fit original instead") from exc
        if not text:
            raise ValueError("OCR found no readable text. Choose Fit original instead")
        return [render_text(text, font_size=22, padding=14)]
    return parts


def _tile_page_parts(page: fitz.Page, page_number: int) -> list[Image.Image]:
    # Twice the original 384-dot fit; overlapping strips retain small details.
    source = _page_pixmap(page, 760).convert("1", dither=Image.Dither.FLOYDSTEINBERG)
    overlap = 12
    columns = []
    left = 0
    while left < source.width:
        piece = Image.new("1", (PRINT_WIDTH, source.height), 1)
        crop = source.crop((left, 0, min(source.width, left + PRINT_WIDTH), source.height))
        piece.paste(crop, (0, 0))
        columns.append(piece)
        if left + PRINT_WIDTH >= source.width:
            break
        left += PRINT_WIDTH - overlap
    parts = []
    for index, piece in enumerate(columns, start=1):
        parts.append(render_text(f"PAGE {page_number} / TILE {index}-{len(columns)}", font_size=18, padding=10))
        parts.append(piece)
    return parts


def _stack_segments(pages: list[list[Image.Image]]) -> list[Image.Image]:
    """Pack complete PDF blocks into 384-dot strips, never over MAX_HEIGHT.

    The split happens between extracted text/image blocks, preserving readability.
    A document spanning more than one metre becomes multiple explicit print jobs.
    """
    result: list[Image.Image] = []
    placements: list[tuple[Image.Image, int]] = []
    used_height = 0

    def flush() -> None:
        nonlocal placements, used_height
        if not placements:
            return
        strip = Image.new("1", (PRINT_WIDTH, used_height), 1)
        for image, top in placements:
            strip.paste(image.convert("1"), (0, top))
        result.append(strip)
        placements = []
        used_height = 0

    for page_index, parts in enumerate(pages):
        page_height = sum(part.height for part in parts) + 7 * max(0, len(parts) - 1)
        if placements and page_height <= MAX_HEIGHT and used_height + 16 + page_height > MAX_HEIGHT:
            # Keep a whole source PDF page together when it fits on one strip.
            flush()
        for part_index, part in enumerate(parts):
            if part.width != PRINT_WIDTH or part.height < 1 or part.height > MAX_HEIGHT:
                raise ValueError("PDF segment is too long; split the content into smaller parts")
            gap = 16 if page_index > 0 and part_index == 0 else 7
            if not placements:
                gap = 0
            if placements and used_height + gap + part.height > MAX_HEIGHT:
                flush()
                gap = 0
            used_height += gap
            placements.append((part, used_height))
            used_height += part.height
    flush()
    if not result:
        raise ValueError("No printable content found in the PDF")
    return result


def _stack(images: list[Image.Image], gap: int = 8) -> Image.Image:
    if not images:
        raise ValueError("No printable content found in the PDF")
    height = sum(img.height for img in images) + gap * (len(images) - 1)
    if height > MAX_HEIGHT:
        raise ValueError("PDF is too long. Select fewer pages or print in segments")
    receipt = Image.new("1", (PRINT_WIDTH, height), 1)
    position = 0
    for image in images:
        if image.width != PRINT_WIDTH:
            image = ImageOps.pad(image, (PRINT_WIDTH, image.height), color="white")
        receipt.paste(image.convert("1"), (0, position))
        position += image.height + gap
    return receipt


def render_pdf_segments(blob: bytes, mode: str = "smart", pages: str = "",
                        options: dict | None = None) -> list[Image.Image]:
    if mode not in {"smart", "fit", "tile"}:
        raise ValueError("Invalid PDF print mode")
    if not blob or len(blob) > MAX_PDF_BYTES:
        raise ValueError("PDF is empty or too large")
    try:
        doc = fitz.open(stream=blob, filetype="pdf")
    except (fitz.FileDataError, ValueError, RuntimeError) as exc:
        raise ValueError("Upload a valid PDF") from exc
    try:
        if doc.needs_pass:
            raise ValueError("This PDF is encrypted. Unlock it first")
        selection = parse_pages(pages, len(doc))
        if len(selection) > MAX_PAGES:
            raise ValueError("Select at most 20 pages per print")
        options = options or {}
        page_parts: list[list[Image.Image]] = []
        for index in selection:
            page = doc[index]
            if mode == "smart":
                page_parts.append(_smart_page_parts(page, enable_ocr=bool(options.get("ocr", False))))
            elif mode == "fit":
                page_parts.append([_fit_page(page)])
            else:
                page_parts.append(_tile_page_parts(page, index + 1))
        return _stack_segments(page_parts)
    finally:
        doc.close()


def render_pdf(blob: bytes, mode: str = "smart", pages: str = "",
               options: dict | None = None) -> Image.Image:
    """Compatibility helper for scripts needing only a single, short receipt."""
    segments = render_pdf_segments(blob, mode=mode, pages=pages, options=options)
    if len(segments) > 1:
        raise ValueError("PDF is too long. Use the web editor for segment previews and printing")
    return segments[0]
