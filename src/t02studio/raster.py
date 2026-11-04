"""Human-readable designs and photos for the 384-dot thermal print head."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps, UnidentifiedImageError

PRINT_WIDTH = 384
MAX_HEIGHT = 8000
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_SOURCE_PIXELS = 8_000_000


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if not 8 <= size <= 100:
        raise ValueError("Yazı boyutu 8 ile 100 arasında olmalı")
    candidates = (
        [r"C:\Windows\Fonts\arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
        if bold else
        [r"C:\Windows\Fonts\arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    )
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default(size=size)


def wrap_text(text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    """Wrap at word boundaries, falling back to characters for long tokens."""
    if max_width < 16:
        raise ValueError("Yazı alanı çok dar")
    lines: list[str] = []
    for paragraph in text.replace("\r\n", "\n").split("\n"):
        if not paragraph.strip():
            lines.append("")
            continue
        current = ""
        for word in paragraph.split():
            candidate = f"{current} {word}" if current else word
            if font.getlength(candidate) <= max_width:
                current = candidate
                continue
            if current:
                lines.append(current)
                current = ""
            for char in word:
                if current and font.getlength(current + char) > max_width:
                    lines.append(current)
                    current = ""
                current += char
        if current:
            lines.append(current)
    return lines


def render_text(text: str, font_size: int = 24, padding: int = 16,
                bold: bool = False, align: str = "left") -> Image.Image:
    if not text or not text.strip():
        raise ValueError("Metin boş olamaz")
    if len(text) > 20_000:
        raise ValueError("Metin çok uzun, lütfen bölerek yazdırın")
    if not 0 <= padding <= 80:
        raise ValueError("Kenar boşluğu geçersiz")
    if align not in {"left", "center", "right"}:
        raise ValueError("Hizalama geçersiz")
    font = load_font(font_size, bold)
    lines = wrap_text(text.strip(), font, PRINT_WIDTH - 2 * padding)
    line_height = max(font_size + 8, int(font.getbbox("Ay")[3] * 1.35))
    height = max(42, 2 * padding + len(lines) * line_height)
    if height > MAX_HEIGHT:
        raise ValueError("Metin baskı için fazla uzun")
    canvas = Image.new("RGB", (PRINT_WIDTH, height), "white")
    draw = ImageDraw.Draw(canvas)
    for index, line in enumerate(lines):
        width = font.getlength(line)
        x = padding if align == "left" else (PRINT_WIDTH - width) / 2 if align == "center" else PRINT_WIDTH - padding - width
        draw.text((x, padding + index * line_height), line, font=font, fill="black")
    return canvas.convert("1")


def render_upload(blob: bytes, density: int = 50, dither: bool = True,
                  rotate: int = 0, brightness: float = 1.0, contrast: float = 1.0,
                  sharpness: float = 1.0, mode: str = "fit", target_height: int | None = None) -> Image.Image:
    if len(blob) > MAX_UPLOAD_BYTES:
        raise ValueError("Dosya boyutu 10 MB sınırını aşıyor")
    if not 0 <= density <= 100:
        raise ValueError("Baskı yoğunluğu geçersiz")
    if rotate not in {0, 90, 180, 270}:
        raise ValueError("Döndürme açısı geçersiz")
    if mode not in {"fit", "cover"}:
        raise ValueError("Ölçekleme türü geçersiz")
    for value in (brightness, contrast, sharpness):
        if not 0.25 <= value <= 3.0:
            raise ValueError("Fotoğraf ayarı geçersiz")
    try:
        source = Image.open(io.BytesIO(blob))
        if source.width * source.height > MAX_SOURCE_PIXELS:
            raise ValueError("Görsel çok fazla piksel içeriyor")
        oriented = ImageOps.exif_transpose(source)
        if "A" in oriented.getbands() or "transparency" in oriented.info:
            rgba = oriented.convert("RGBA")
            background = Image.new("RGBA", rgba.size, "white")
            image = Image.alpha_composite(background, rgba).convert("RGB")
        else:
            image = oriented.convert("RGB")
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise ValueError("Geçerli bir görsel yükleyin") from exc
    if rotate:
        image = image.rotate(-rotate, expand=True)
    if mode == "cover" and target_height:
        if not 1 <= target_height <= MAX_HEIGHT:
            raise ValueError("Hedef uzunluk geçersiz")
        image = ImageOps.fit(image, (PRINT_WIDTH, target_height), method=Image.Resampling.LANCZOS)
    else:
        height = max(1, round(image.height * PRINT_WIDTH / image.width))
        if height > MAX_HEIGHT:
            raise ValueError("Görsel baskı için fazla uzun")
        image = image.resize((PRINT_WIDTH, height), Image.Resampling.LANCZOS)
    image = ImageEnhance.Brightness(image).enhance(brightness)
    image = ImageEnhance.Contrast(image).enhance(contrast)
    image = ImageEnhance.Sharpness(image).enhance(sharpness)
    grayscale = ImageOps.grayscale(image)
    threshold = max(15, min(240, 128 + (density - 50) * 2))
    if dither:
        # Higher density darkens the image before Floyd-Steinberg diffusion.
        grayscale = grayscale.point(lambda value: max(0, min(255, value - (threshold - 128))))
        return grayscale.convert("1", dither=Image.Dither.FLOYDSTEINBERG)
    return grayscale.point(lambda value: 255 if value >= threshold else 0, mode="1")


def render_qr(value: str, caption: str = "") -> Image.Image:
    if not value or not value.strip():
        raise ValueError("QR içeriği boş olamaz")
    if len(value) > 1500:
        raise ValueError("QR içeriği fazla uzun")
    import qrcode
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M,
                       box_size=4, border=2)
    qr.add_data(value)
    qr.make(fit=True)
    code = qr.make_image(fill_color="black", back_color="white").convert("1")
    code.thumbnail((300, 300), Image.Resampling.NEAREST)
    label = render_text(caption, font_size=20, padding=8, align="center") if caption.strip() else None
    total_height = 320 + (label.height + 8 if label else 0)
    canvas = Image.new("1", (PRINT_WIDTH, total_height), 1)
    canvas.paste(code, ((PRINT_WIDTH-code.width)//2, 10))
    if label:
        canvas.paste(label, (0, 318))
    return canvas

