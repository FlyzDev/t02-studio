## T02 Studio v0.3.0 · Graphics-editor workspace

- **Rebuilt application shell:** File / Edit / View / Layer menus, a narrow left tool rail, an open central thermal-paper canvas, and a right inspector with Properties above Layers. This replaces the long three-column sidebar on `/` and `/alt`.
- **Contextual tools:** Text, Image, PDF, QR, Barcode, Address, Date/time, Shape, Border and Label designer open an overlaid options drawer. The cursor selects layers, and the canvas stays visible.
- **Compact controls:** paper length and layout mode at the top; zoom, PNG download and Print in the bottom status bar. Quick actions include V (select), T (text) and Ctrl+S (save).
- **Existing editing preserved:** box selection, Shift/Ctrl multi-select, moving/resizing groups, each layer's own × delete, undo/redo, saved JSON designs, printer discovery and print path are preserved. Legacy editor remains accessible.

## T02 Studio v0.2.1 · Multi-layer selection

- **Desktop-style box selection:** in Free edit, use Select / box-select and drag across empty paper to select multiple overlapping layers. Drag in either direction.
- **Move and resize a group:** drag any selected layer to move the whole selection, or drag its shared bottom-right handle to proportionally reposition and resize the selection.
- **Multi-select shortcuts:** Shift-click objects on the canvas, Ctrl/Shift-click rows in Layers, Ctrl+A to select all visible layers, and Escape to clear selection. Arrow keys nudge selected layers together; Shift+arrow nudges by 10 px.
- **Inline layer deletion:** each Layers row now has a small `×` at its right edge. Delete/Backspace removes the selection, including multiple selected layers, with Undo support.
- Existing JSON projects, raster PNG export and the printing pipeline are unchanged. Selection guides are editor-only and not printed.

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
