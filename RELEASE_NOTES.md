## T02 Studio v0.3.4 · Stable inspector and unified tool icons

- The contextual ribbon now lives **only over the canvas column**. Opening or closing Text, Image, Border or Label designer never pushes the right-hand Properties/Layers panel down; the inspector stays pinned beneath the fixed toolbar.
- Every left-rail tool now uses a consistent 22 px vector pictogram rather than a mixture of font glyphs. Icons and their 46 px clickable targets are truly centered in the rail, with accessible names and tooltips intact.
- Existing layer selection, saved designs, printer port, and the independent border/opacity/Undo features remain unchanged.

## T02 Studio v0.3.3 · Context ribbon and constrained dragging

- Clicking a left-rail tool now shows its editable options in a horizontal contextual ribbon **under** the fixed top toolbar. No floating sidebar drawer blocks the canvas; changing tools swaps the ribbon. Existing inputs and label maker controls are retained.
- **Undo** and **Redo** are always visible on the fixed top toolbar, including while a tool is active.
- **Opacity** now opens a matching 0–100% slider popover under its top-bar chip, with live updates to the selected layer.
- **Shift-drag** constrains Free edit movement to the dominant X or Y axis, for one layer or a multi-selection. Releasing Shift resumes continuous free movement without jumping; Shift-click still toggles selection.
- **Border** inserts its own independently movable, resizable frame without changing the Label designer's selected preset. The left tool rail has more breathing room and centered icons.
- Existing project JSON, live drafts, print settings, and the 384-dot monochrome pipeline remain compatible.

## T02 Studio v0.3.2 · Inline size and weight sliders

- The top **Size** chip opens a small anchored font-size slider while keeping its editable numeric value.
- The top **Weight** chip opens a matching 1–5 text-thickness slider with a live fraction indicator.
- Both controls update the selected text as they move, remain usable as defaults for new text, and disable themselves for unrelated selections.
- Clicking outside or pressing Escape closes the popovers; changing tools keeps the panels in sync with the selected layer.

## T02 Studio v0.3.1 · Interactive editing polish

- **Marquee selection from the gray workspace:** drag a rectangle starting outside the white paper to select layers it crosses. Existing blank-paper marquee, Shift/Ctrl selection and group move/resize continue to work.
- **Drag-to-reorder Layers:** grab a row's dotted handle or row body and drop above/below another layer. An accent line shows the intended position; Undo restores the previous stack.
- **Center commands:** with one or several layers selected, use **Center X** or **Center on page** on the top bar, or equivalent Layer menu actions.
- **QR-only insertion:** QR components now create a tight square with a small scanner-friendly quiet zone, without a 384-pixel-wide white receipt or caption. Existing projects and the standard 384-pixel print endpoint remain compatible.
- **Working contextual controls:** top-bar Font, Size, Weight and Opacity now edit the selected object where applicable, or provide text defaults before insertion. Left tool icons are centered in their rail, with clearer active and drag feedback.

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
