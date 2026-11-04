# T02 Studio

An open-source, self-hosted, browser-based receipt designer for the **Phomemo T02 Mini** thermal printer.

T02 Studio combines text, images, PDF extracts and QR codes into one 384-dot-wide strip. Its free-layout editor supports dragging, resizing, 90° rotation, an adjustable paper edge, paste-to-add images, layers, project JSON and PNG export.

## Interfaces

| Route | Purpose |
| --- | --- |
| `/` and `/alt` | Main three-column English editor, **dark by default**, light-mode toggle |
| `/composer` | Legacy full receipt composer |
| `/classic` | Legacy one-item-at-a-time editor |

All three interfaces use the same local backend. The alternate design is native HTML/CSS/JavaScript inspired by neutral design-system primitives; it does **not** bundle React or shadcn components.

## Quick start (Windows)

Prerequisites: Python 3.11+, a Phomemo T02 Mini or compatible serial printer, and Bluetooth enabled on your Windows PC. Pair the printer in **Windows Bluetooth settings** first. The USB cable on some models may only charge the device.

1. Clone this repository.
2. In PowerShell, from the project directory:

   ```powershell
   .\start.ps1
   ```

3. Open <http://127.0.0.1:8062/>.
4. Under **Printer connection**, click **Rescan**, then select your printer's outgoing Bluetooth COM port. The selection is remembered in that browser.

The discovery list shows serial ports already registered by the operating system, labeled as Bluetooth / USB / serial when available. It prioritizes identifiable T02/Phomemo entries and may automatically select an unambiguous Bluetooth port. Some Windows drivers expose generic names such as *Standard Serial over Bluetooth link*; if several appear, choose the **outgoing** COM port shown under Windows Bluetooth's **More Bluetooth options → COM Ports**. The app never sends a test print during discovery and cannot guarantee a listed printer is powered on. It does not scan nearby unpaired devices or handle Bluetooth pairing.

Nothing prints until you explicitly press **Print**. An ordinary PNG export doesn't use the printer. No COM port environment variable is needed for the main editor; `T02_COM_PORT` remains optional for scripts and legacy interfaces.

### Optional trusted home-LAN access

The application deliberately starts on localhost and permits localhost requests by default. **There is no login screen**. Only enable LAN access on a trusted private network.

For example, if the host PC's private LAN address is `192.168.1.50` and the trusted subnet is `192.168.1.0/24`:

```powershell
$env:T02_BIND_HOST = '192.168.1.50'
$env:T02_ALLOWED_NETWORKS = '192.168.1.0/24'
.\start.ps1
```

If needed, create a **narrow Windows Firewall inbound rule** for only that PC's IP, port 8062, the trusted source subnet, and the Private network profile. This repository does not create a broad firewall rule automatically.

**Never port-forward this service to the Internet or expose it to guest Wi-Fi.** A device allowed to access the app can submit print jobs without authentication. Requests from non-allowlisted IPs and cross-site browser print requests are blocked, but those are not substitutes for network isolation.

## Features

- Compose a long strip from multiple blocks (text, image, PDF segment, QR).
- Discover paired Windows serial ports, identify likely T02 entries, and remember the selected outgoing COM port per browser. Supports multiple LAN clients selecting ports independently.
- Flow and free-layout modes; clipboard image paste and drag/drop.
- Adjustable 20–999 mm free canvas, including a draggable bottom paper edge.
- Rotate blocks left/right by 90°, drag to position, resize, re-order, hide or delete.
- PDF: text reflow, original fit, tiling, page ranges and bounded multi-segment previews.
- Optional local OCR for scanned PDFs when Tesseract and language data are installed.
- Local-only project autosave, JSON import/export, full-resolution PNG export.
- A single locked print path with per-job identifiers to reduce accidental duplicate submissions.

## Development

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node tests/test_studio_core.js
```

The Python tests fake the serial printer and **do not print physical paper**. The JavaScript geometry tests run in Node; no browser-side build step is required.

## Project boundaries

- Thermal output is monochrome, 384 dots wide, with a maximum 8,000-pixel single job.
- Printing is over a Windows Bluetooth serial COM port; this is **not** a universal Windows print driver.
- Printer power-save and physical paper feed cannot be reliably inferred merely from a registered COM port.
- Port discovery and selection are read-only until **Print** is clicked. Port labels are an aid, not proof of printer identity; other Bluetooth and USB serial devices may also appear.
- The app stores no uploaded documents on the server. Browser local storage and downloaded JSON/PNG copies can retain document data.
- Tested principally on a Phomemo T02 Mini. Support for other models is not claimed.

## License and acknowledgement

T02 Studio is released under **GNU AGPL-3.0-only**. See [LICENSE](LICENSE). It uses PyMuPDF, which is available under the AGPL or a separate commercial license. Check the licenses of all dependencies if you redistribute modified builds. The [vivier/phomemo-tools](https://github.com/vivier/phomemo-tools) repository was a research reference for T02 interoperability; consult its GPL-3.0 license independently.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). The project is community-supported and provided without warranty.
