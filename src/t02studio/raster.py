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
        raise ValueError("Font size must be between 8 and 100")
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
        raise ValueError("Text area is too narrow")
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
        raise ValueError("Text cannot be empty")
    if len(text) > 20_000:
        raise ValueError("Text is too long; print it in smaller parts")
    if not 0 <= padding <= 80:
        raise ValueError("Invalid margin")
    if align not in {"left", "center", "right"}:
        raise ValueError("Invalid text alignment")
    font = load_font(font_size, bold)
    lines = wrap_text(text.strip(), font, PRINT_WIDTH - 2 * padding)
    line_height = max(font_size + 8, int(font.getbbox("Ay")[3] * 1.35))
    height = max(42, 2 * padding + len(lines) * line_height)
    if height > MAX_HEIGHT:
        raise ValueError("Text is too long to print")
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
        raise ValueError("File exceeds the 10 MB limit")
    if not 0 <= density <= 100:
        raise ValueError("Invalid print density")
    if rotate not in {0, 90, 180, 270}:
        raise ValueError("Invalid rotation angle")
    if mode not in {"fit", "cover"}:
        raise ValueError("Invalid image scaling mode")
    for value in (brightness, contrast, sharpness):
        if not 0.25 <= value <= 3.0:
            raise ValueError("Invalid photo adjustment")
    try:
        source = Image.open(io.BytesIO(blob))
        if source.width * source.height > MAX_SOURCE_PIXELS:
            raise ValueError("Image has too many pixels")
        oriented = ImageOps.exif_transpose(source)
        if "A" in oriented.getbands() or "transparency" in oriented.info:
            rgba = oriented.convert("RGBA")
            background = Image.new("RGBA", rgba.size, "white")
            image = Image.alpha_composite(background, rgba).convert("RGB")
        else:
            image = oriented.convert("RGB")
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise ValueError("Upload a valid image") from exc
    if rotate:
        image = image.rotate(-rotate, expand=True)
    if mode == "cover" and target_height:
        if not 1 <= target_height <= MAX_HEIGHT:
            raise ValueError("Invalid target length")
        image = ImageOps.fit(image, (PRINT_WIDTH, target_height), method=Image.Resampling.LANCZOS)
    else:
        height = max(1, round(image.height * PRINT_WIDTH / image.width))
        if height > MAX_HEIGHT:
            raise ValueError("Image is too long to print")
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
        raise ValueError("QR code content cannot be empty")
    if len(value) > 1500:
        raise ValueError("QR code content is too long")
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


def render_barcode(value: str, symbology: str = "code128", show_text: bool = True) -> Image.Image:
    """Generate a real, check-summed, scanner-readable barcode on a white paper strip."""
    from barcode import Code128, EAN13
    from barcode.writer import ImageWriter

    value = value.strip()
    if symbology == "code128":
        if not 1 <= len(value) <= 36 or any(not 32 <= ord(char) <= 126 for char in value):
            raise ValueError("Code 128 needs 1–36 printable ASCII characters")
        barcode = Code128(value, writer=ImageWriter())
    elif symbology == "ean13":
        if not value.isascii() or not value.isdigit() or len(value) not in (12, 13):
            raise ValueError("EAN-13 needs 12 or 13 digits")
        digits = value[:12]
        weighted = sum(int(digit) * (1 if index % 2 == 0 else 3)
                       for index, digit in enumerate(digits))
        check = str((10 - weighted % 10) % 10)
        if len(value) == 13 and value[-1] != check:
            raise ValueError(f"Invalid EAN-13 check digit; expected {check}")
        barcode = EAN13(digits, writer=ImageWriter())
    else:
        raise ValueError("Choose Code 128 or EAN-13")

    image = barcode.render(writer_options={
        "module_width": 0.34, "module_height": 15, "quiet_zone": 2.5,
        "font_size": 0, "write_text": False, "dpi": 203,
        "background": "white", "foreground": "black",
    }).convert("L")
    # Nearest-neighbor scaling protects vertical bar edges from gray antialiasing.
    if image.width > 352:
        image = image.resize((352, image.height), Image.Resampling.NEAREST)
    image = image.point(lambda pixel: 0 if pixel < 128 else 255, mode="1")
    caption = barcode.get_fullcode() if show_text else ""
    label = render_text(caption, font_size=19, padding=8, align="center") if caption else None
    height = image.height + (label.height + 4 if label else 0) + 16
    if height > MAX_HEIGHT:
        raise ValueError("Barcode is too tall")
    canvas = Image.new("1", (PRINT_WIDTH, height), 1)
    canvas.paste(image, ((PRINT_WIDTH - image.width) // 2, 8))
    if label:
        canvas.paste(label, (0, image.height + 12))
    return canvas

