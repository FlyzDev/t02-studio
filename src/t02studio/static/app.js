"use strict";

const $ = (id) => document.getElementById(id);
let kind = "text";
let imageFile = null;
let pdfFile = null;
let pdfSegment = 0;
let pdfTotalSegments = 1;
let previewUrl = null;
let lengthMM = 0;
let previewReady = false;
let previewTimer = null;
let pendingPreview = null;
let printInFlight = false;
let currentPreviewSequence = 0;
let toastTimer = null;
let printerPort = "";

function createJobId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function toast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), error ? 8000 : 4200);
}

function setBusy(busy) {
  printInFlight = busy;
  $("print-button").disabled = busy || !previewReady || !printerPort;
  $("print-button").innerHTML = busy ? "⌛ Sending..." : "<span>▧</span> Print to T02";
  updateSegmentControls();
}

function updateSegmentControls() {
  const visible = kind === "pdf" && pdfTotalSegments > 1;
  $("pdf-segment-controls").classList.toggle("hidden", !visible);
  $("pdf-segment-label").textContent = `${pdfSegment + 1} / ${pdfTotalSegments}`;
  $("pdf-previous").disabled = printInFlight || pdfSegment <= 0;
  $("pdf-next").disabled = printInFlight || pdfSegment >= pdfTotalSegments - 1;
}

function resetPdfSegments() {
  pdfSegment = 0;
  pdfTotalSegments = 1;
  updateSegmentControls();
}

function updateLabels() {
  for (const [id, suffix, transform] of [
    ["font-size", " px", (x) => x], ["padding", " px", (x) => x],
    ["density", "%", (x) => x], ["contrast", "×", (x) => (x / 100).toFixed(1)],
    ["brightness", "×", (x) => (x / 100).toFixed(1)], ["sharpness", "×", (x) => (x / 100).toFixed(1)],
    ["target-height-mm", " mm", (x) => x]
  ]) $(id + "-value").textContent = transform(Number($(id).value)) + suffix;
  $("target-height-wrap").classList.toggle("hidden", $("image-mode").value !== "cover");
  document.querySelectorAll(".pdf-choice").forEach((choice) => {
    choice.classList.toggle("selected", choice.querySelector("input").checked);
  });
}

function chooseKind(next) {
  kind = next;
  document.querySelectorAll(".mode-tab").forEach((button) => button.classList.toggle("active", button.dataset.kind === kind));
  document.querySelectorAll(".editor-panel").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== kind));
  updateSegmentControls();
  invalidatePreview();
  schedulePreview();
}

function invalidatePreview() {
  ++currentPreviewSequence;
  if (pendingPreview) { pendingPreview.abort(); pendingPreview = null; }
  previewReady = false;
  $("print-button").disabled = true;
  $("download-preview").disabled = true;
}

function buildFormData() {
  const data = new FormData();
  data.append("kind", kind);
  if (kind === "text") {
    data.append("text", $("text-input").value);
    data.append("font_size", $("font-size").value);
    data.append("padding", $("padding").value);
    data.append("align", $("align").value);
    data.append("bold", $("bold").checked);
  } else if (kind === "image") {
    if (!imageFile) throw new Error("Choose an image first.");
    data.append("file", imageFile, imageFile.name);
    data.append("image_mode", $("image-mode").value);
    data.append("target_height", Math.round(Number($("target-height-mm").value) / 25.4 * 203));
    data.append("rotate", $("rotate").value);
    data.append("density", $("density").value);
    data.append("brightness", Number($("brightness").value) / 100);
    data.append("contrast", Number($("contrast").value) / 100);
    data.append("sharpness", Number($("sharpness").value) / 100);
    data.append("dither", $("dither").checked);
  } else if (kind === "pdf") {
    if (!pdfFile) throw new Error("Choose a PDF first.");
    data.append("file", pdfFile, pdfFile.name);
    data.append("pdf_mode", document.querySelector('input[name="pdf-mode"]:checked').value);
    data.append("pages", $("pages").value);
    data.append("ocr", $("ocr").checked);
    data.append("segment", pdfSegment);
  } else if (kind === "qr") {
    data.append("qr_value", $("qr-value").value);
    data.append("caption", $("qr-caption").value);
  }
  return data;
}

async function apiResponse(response) {
  if (response.ok) return response;
  let details = {};
  try { details = await response.json(); } catch { /* Server can return plain HTML errors. */ }
  throw new Error(details.error || `Server error (${response.status})`);
}

function schedulePreview() {
  invalidatePreview();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 500);
}

async function refreshPreview() {
  clearTimeout(previewTimer);
  invalidatePreview();
  const sequence = ++currentPreviewSequence;
  let body;
  try { body = buildFormData(); }
  catch (error) {
    $("preview-placeholder").classList.remove("hidden");
    $("preview-placeholder").querySelector("strong").textContent = error.message;
    $("preview-image").classList.add("hidden");
    $("length-value").textContent = "— mm";
    $("length-note").textContent = "Length appears after choosing a file";
    return;
  }
  const controller = new AbortController();
  pendingPreview = controller;
  $("preview-placeholder").classList.remove("hidden");
  $("preview-placeholder").querySelector("strong").textContent = "Converting…";
  $("preview-image").classList.add("hidden");
  try {
    const response = await apiResponse(await fetch("/api/preview", { method: "POST", body, signal: controller.signal }));
    const file = await response.blob();
    if (sequence !== currentPreviewSequence) return;
    const newUrl = URL.createObjectURL(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = newUrl;
    $("preview-image").src = newUrl;
    $("preview-image").classList.remove("hidden");
    $("preview-placeholder").classList.add("hidden");
    lengthMM = Number(response.headers.get("X-Print-Length-MM") || 0);
    if (kind === "pdf") {
      pdfTotalSegments = Math.max(1, Number(response.headers.get("X-Total-Segments") || 1));
      pdfSegment = Number(response.headers.get("X-Segment-Index") || 0);
    }
    updateSegmentControls();
    $("length-value").textContent = `${lengthMM.toLocaleString("en-US", {maximumFractionDigits:1})} mm`;
    const seconds = lengthMM / 8;
    $("length-note").textContent = `Estimated print: ~${Math.max(1, Math.round(seconds))} s · 53 mm thermal roll`;
    previewReady = true;
    $("print-button").disabled = printInFlight || !printerPort;
    $("download-preview").disabled = false;
  } catch (error) {
    if (error.name === "AbortError") return;
    if (sequence !== currentPreviewSequence) return;
    $("preview-placeholder").classList.remove("hidden");
    $("preview-placeholder").querySelector("strong").textContent = error.message;
    $("length-value").textContent = "— mm";
    $("length-note").textContent = "Resolve this error before printing";
    toast(error.message, true);
  } finally {
    if (pendingPreview === controller) pendingPreview = null;
  }
}

async function printNow() {
  if (!previewReady || printInFlight) return;
  if (lengthMM >= 300 && !window.confirm(`This print will use about ${Math.round(lengthMM)} mm of paper. Continue?`)) return;
  let body;
  try { body = buildFormData(); } catch (error) { toast(error.message, true); return; }
  const printingPdfSegment = kind === "pdf" ? pdfSegment : null;
  body.append("job_id", createJobId());
  body.append("printer_port", printerPort);
  setBusy(true);
  try {
    const response = await apiResponse(await fetch("/api/print", { method: "POST", body }));
    const result = await response.json();
    toast(`${result.length_mm} mm sent to ${result.port}${printingPdfSegment === null ? "" : ` (segment ${printingPdfSegment + 1}/${pdfTotalSegments})`}. Check the paper.`);
    if (printingPdfSegment !== null && kind === "pdf" && pdfSegment === printingPdfSegment && pdfSegment + 1 < pdfTotalSegments) {
      ++pdfSegment;
      schedulePreview();
    }
    await updateStatus();
  } catch (error) {
    toast(error.message + " Check the printer before retrying.", true);
  } finally { setBusy(false); }
}

async function updateStatus() {
  const selector = $("printer-select");
  const rescan = $("discover-printers");
  rescan.disabled = true;
  try {
    const response = await apiResponse(await fetch("/api/printers", {cache:"no-store"}));
    const data = await response.json();
    const ports = Array.isArray(data.ports) ? data.ports : [];
    const available = new Set(ports.map(item => item.port));
    let saved = "";
    try { saved = localStorage.getItem("t02-printer-port") || ""; } catch { /* Optional. */ }
    printerPort = [printerPort, saved, data.configured_port].find(value => available.has(value)) || "";
    if (!printerPort) {
      const identified = ports.filter(item => item.likely_printer);
      const bluetooth = ports.filter(item => item.transport === "Bluetooth");
      if (identified.length === 1) printerPort = identified[0].port;
      else if (bluetooth.length === 1) printerPort = bluetooth[0].port;
    }
    selector.replaceChildren();
    selector.add(new Option(ports.length ? "Select a printer port" : "No paired serial ports found", ""));
    for (const item of ports) selector.add(new Option(
      `${item.likely_printer ? "★ " : ""}${item.port} · ${item.description} (${item.transport})`, item.port));
    selector.disabled = !ports.length;
    selector.value = printerPort;
    $("printer-help").textContent = ports.length ? "Choose your printer's outgoing Bluetooth COM port." :
      "Pair it in Windows Bluetooth settings, then rescan. Discovery does not pair devices.";
    $("printer-status").textContent = printerPort ? `${printerPort} selected · not physically verified` : "Choose a printer port";
    $("status-led").classList.toggle("ok", !!printerPort);
    $("status-led").classList.toggle("bad", !printerPort);
    $("print-button").disabled = !previewReady || printInFlight || !printerPort;
    return true;
  } catch (error) {
    printerPort = "";
    selector.replaceChildren(new Option("Discovery unavailable", ""));
    selector.disabled = true;
    $("print-button").disabled = true;
    $("printer-status").textContent = "Printer discovery unavailable";
    $("status-led").classList.add("bad");
    return false;
  } finally { rescan.disabled = false; }
}

function attachUpload(id, dropId, nameId, onFile) {
  const input = $(id);
  const drop = $(dropId);
  function setFile(file) {
    if (!file) return;
    onFile(file);
    $(nameId).textContent = file.name + ` (${(file.size / 1024).toFixed(0)} KB)`;
    schedulePreview();
  }
  input.addEventListener("change", () => setFile(input.files[0]));
  drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("drag-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault(); drop.classList.remove("drag-over");
    setFile(event.dataTransfer.files[0]);
  });
}

function init() {
  const saved = localStorage.getItem("t02-studio-draft");
  if (saved) {
    try { const draft = JSON.parse(saved); $("text-input").value = draft.text || $("text-input").value; $("qr-value").value = draft.qr || $("qr-value").value; } catch { /* Ignore stale draft. */ }
  }
  document.querySelectorAll(".mode-tab").forEach((button) => button.addEventListener("click", () => chooseKind(button.dataset.kind)));
  document.querySelectorAll("#editor-form input, #editor-form textarea, #editor-form select").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.id === "pages" || input.id === "ocr" || input.name === "pdf-mode") resetPdfSegments();
      updateLabels(); schedulePreview();
      if (input.id === "text-input" || input.id === "qr-value")
        localStorage.setItem("t02-studio-draft", JSON.stringify({text: $("text-input").value, qr: $("qr-value").value}));
    });
    input.addEventListener("change", () => {
      if (input.id === "pages" || input.id === "ocr" || input.name === "pdf-mode") resetPdfSegments();
      updateLabels(); schedulePreview();
    });
  });
  attachUpload("image-file", "image-drop", "image-name", (file) => { imageFile = file; });
  attachUpload("pdf-file", "pdf-drop", "pdf-name", (file) => { pdfFile = file; resetPdfSegments(); });
  $("pdf-previous").addEventListener("click", () => {
    if (printInFlight || pdfSegment <= 0) return;
    --pdfSegment; updateSegmentControls(); schedulePreview();
  });
  $("pdf-next").addEventListener("click", () => {
    if (printInFlight || pdfSegment >= pdfTotalSegments - 1) return;
    ++pdfSegment; updateSegmentControls(); schedulePreview();
  });
  $("refresh-preview").addEventListener("click", refreshPreview);
  $("print-button").addEventListener("click", printNow);
  $("refresh-status").addEventListener("click", updateStatus);
  $("discover-printers").addEventListener("click", updateStatus);
  $("printer-select").addEventListener("change", event => {
    printerPort = event.target.value;
    try { localStorage.setItem("t02-printer-port", printerPort); } catch { /* Optional. */ }
    $("printer-status").textContent = printerPort ? `${printerPort} selected · not physically verified` : "Choose a printer port";
    $("status-led").classList.toggle("ok", !!printerPort);
    $("status-led").classList.toggle("bad", !printerPort);
    $("print-button").disabled = printInFlight || !previewReady || !printerPort;
  });
  $("download-preview").addEventListener("click", () => {
    if (!previewReady || !previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl; link.download = `t02-${kind}${kind === "pdf" ? `-segment-${pdfSegment + 1}` : ""}-${Date.now()}.png`;
    document.body.appendChild(link); link.click(); link.remove();
  });
  updateLabels();
  updateStatus();
  schedulePreview();
}

document.addEventListener("DOMContentLoaded", init);
