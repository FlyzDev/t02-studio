# Multi-printer roadmap

T02 Studio started as a visual editor for the Phomemo T02. The longer-term
goal is a **printer-neutral, open-source label designer**, without sacrificing
the simplicity or reliability of the working T02 release.

## Support status

| Device / path | Status | What is actually tested |
| --- | --- | --- |
| Phomemo T02 Mini over Windows Bluetooth COM | **Hardware-verified** | Existing 384-dot, 203-DPI, 9600-baud printing workflow |
| Other serial ESC/POS printers | **Not supported yet** | Packet-encoding tests only; command dialects, feed, density and ports vary |
| USB-connected printers | **Not supported yet** | No USB print transport is implemented |
| Network printers | **Not supported yet** | No network print transport is implemented |
| Native OS printer drivers | **Not supported yet** | No Windows/macOS/Linux spooler integration is implemented |

The application's `/api/printer-profiles` endpoint returns the **verified
profiles only**. Today this is `phomemo-t02`. The print endpoint accepts an
optional `printer_profile` form field (default `phomemo-t02`) and rejects
unknown or unverified IDs **before starting a print**.

The profile data includes printable raster width, DPI, maximum job height,
protocol family and transport. The GS `v 0` raster encoder can now encode
other byte-aligned widths, which we exercise using synthetic 576-dot fixtures.
**An offline 576-dot test is not proof of compatibility with a 576-dot printer.**

## Implementation sequence

1. **Capabilities and safety (first slice):** centralize device capabilities,
   parameterize the raster packet encoder, preserve the original T02 byte
   sequence, and fail closed on unverified print targets.
2. **Canvas portability:** separate document dimensions from 384-pixel T02
   output, scale/import old projects correctly, and allow a per-printer width
   and physical printable-area preview. Avoid reflowing or clipping a user's
   saved design merely because they select a new printer.
3. **Transport boundaries:** implement independently tested serial, USB and
   network print adapters with explicit connection lifecycle and error states.
   Do not retry after a partial transmission without user confirmation.
4. **Protocol adapters:** support each printer's command language, paper-feed
   behavior, DPI/density options and status reporting only where documented
   and reproducible. Do not assume every printer labeled ESC/POS shares the
   same raster implementation.
5. **Cross-platform packaging:** verify local discovery and printing on
   Windows, macOS and Linux separately. Include permissions and driver setup
   instructions, rather than promising universal plug-and-play.
6. **International launch:** update UI copy, screenshot examples, documentation
   and GitHub branding once the device-selection flow and at least one
   additional **physical printer** pass real-world acceptance tests.

## Verification gate for a new printer

- Exact manufacturer/model and firmware revision recorded.
- Physical print sample checked for width, orientation, margins, feed and
  cut behavior using short and long designs.
- Printed QR and retail barcodes scanned on real paper where supported.
- Disconnect, missing paper, busy printer and interrupted write handled with
  actionable messages and no automatic duplicate output.
- Print preview, exported PNG and physical page checked against one another.
- A profile added to the public supported list only after those checks pass.

**Naming:** Keep the GitHub repository and download as `t02-studio` for now.
Once broader hardware works, choose a device-neutral product name, check
trademark/domain/repository availability, migrate download and documentation
links, and publish a clear compatibility table. Marketing and community posts
should describe only what people can actually print with.
