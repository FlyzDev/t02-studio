## T02 Studio v0.2.0 · More label tools

- Five additional component tools: **Barcode**, **Address**, **Date/time**, **Shape** and **Border**, alongside the existing text, image, PDF, QR and label designer.
- Code 128 and EAN-13 are generated locally with checksums. Retail product codes display optional numbers below the barcode.
- Seven editable monochrome shapes with independent stroke thickness, filled/outline mode, placement, layering, rotation and opacity.
- Addresses and date/time stamps become ordinary editable text layers. Date/time values are fixed when inserted.
- Refreshed GitHub description clarifies that T02 Studio is an independent, free and open-source visual editor for the Phomemo T02.

## Windows standalone download

Download **T02-Studio.exe** (Windows x64). No Python installation or manual build is required. Double-click to start a local server and open the English editor in your default browser. Keep the console window open while using the editor; close it to stop the server.

Also available: a ZIP with the executable, source-repository README, and AGPL-3.0 license, plus `SHA256SUMS.txt` for download verification.

### Safety and compatibility

- Windows 10/11 x64. The app binds to **127.0.0.1** by default, with no cloud account or background service.
- Pair your Phomemo T02 in Windows Bluetooth settings, then select its outgoing COM port in the app. **No print job is sent until Print is clicked.**
- This binary is **unsigned**. Windows SmartScreen may show a publisher warning; verify the SHA256 checksum and download only from this project's Releases page. Do not run it as Administrator.
- The release build automatically verifies that the packaged executable starts and serves its browser interface. A physical T02 printer is not used in CI.
- Optional PDF OCR requires separately installed Tesseract OCR and language data; it is not included in the EXE.
