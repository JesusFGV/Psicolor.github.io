// ===== Referencias =====
const stack = document.getElementById("canvas-stack");
const canvasDraw = document.getElementById("canvas-draw");
const canvasImg = document.getElementById("canvas-img");
const ctxDraw = canvasDraw.getContext("2d");
const ctxImg = canvasImg.getContext("2d");

const warnEl = document.getElementById("warn");

const inputColor = document.getElementById("input-color");
const colorPreview = document.getElementById("color-preview");
const eraserBtn = document.getElementById("btn-eraser");

const inputSize = document.getElementById("input-size");
const sizeValue = document.getElementById("size-value");

// ===== Estado =====
let colorChosen = false;
let currentColor = null;
let strokeSize = 12;
let drawing = false;
let usedColors = new Set();
let isEraser = false;
let lastPos = null;

let currentImage = null; // HTMLImageElement
let imageLocked = false; // bloquear reemplazo hasta guardar/reset

// ===== Sizing (DPR) para llenar TODO el workspace =====
function resizeCanvasToStack(canvas, ctx) {
  const rect = stack.getBoundingClientRect(); // tamaño lógico visible
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  // trabajamos en px lógicos
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function setupCanvasSizes() {
  resizeCanvasToStack(canvasDraw, ctxDraw);
  resizeCanvasToStack(canvasImg, ctxImg);
  if (currentImage) fitAndDrawImage(currentImage); // re-centra/redibuja
}

window.addEventListener("load", setupCanvasSizes);
window.addEventListener("resize", setupCanvasSizes);

// ===== Dibujo de imagen centrada y proporcional =====
function fitAndDrawImage(img) {
  const rect = stack.getBoundingClientRect();
  const frameW = rect.width;
  const frameH = rect.height;

  ctxImg.clearRect(0, 0, frameW, frameH);

  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;

  const scale = Math.min(frameW / imgW, frameH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const offsetX = (frameW - drawW) / 2;
  const offsetY = (frameH - drawH) / 2;

  ctxImg.imageSmoothingEnabled = true;
  ctxImg.imageSmoothingQuality = "high";
  ctxImg.drawImage(img, offsetX, offsetY, drawW, drawH);
}

// ===== Herramientas =====
function setColor(color) {
  colorChosen = true;
  currentColor = color;
  isEraser = false;
  eraserBtn.setAttribute("aria-pressed", "false");
  colorPreview.style.background = color;
  showWarn("");
}
function toggleEraser() {
  isEraser = !isEraser;
  eraserBtn.setAttribute("aria-pressed", String(isEraser));
  if (isEraser) showWarn("");
}

// Color selector
inputColor.addEventListener("input", (e) => {
  const value = e.target.value;
  if (!value) return;
  setColor(value);
});

// Grosor
inputSize.addEventListener("input", (e) => {
  strokeSize = Number(e.target.value) || 12;
  sizeValue.textContent = String(strokeSize);
});

// Borrador
eraserBtn.addEventListener("click", toggleEraser);

// ===== Imagen =====
function loadImage(src) {
  if (imageLocked && currentImage) {
    showWarn(
      "Ya hay una imagen cargada. Guarda o reinicia el lienzo para cargar otra."
    );
    return;
  }
  const img = new Image();
  img.onload = () => {
    currentImage = img;
    imageLocked = true;
    setupCanvasSizes();
    fitAndDrawImage(currentImage);
  };
  img.onerror = () => showWarn("No se pudo cargar la imagen.");
  img.src = src;
}

// ===== Dibujo (Pointer Events con offsetX/offsetY) =====
function canDraw() {
  if (!currentImage) {
    showWarn("Selecciona una imagen antes de dibujar.");
    return false;
  }
  if (!colorChosen && !isEraser) {
    showWarn("Selecciona un color para dibujar (o activa el borrador).");
    return false;
  }
  return true;
}

function getPosFromEvent(e) {
  // offsetX/offsetY están en px lógicos relativos al canvas → perfectos.
  return { x: e.offsetX, y: e.offsetY };
}

canvasDraw.addEventListener("pointerdown", (e) => {
  if (!canDraw()) return;
  canvasDraw.setPointerCapture(e.pointerId);
  drawing = true;
  lastPos = getPosFromEvent(e);
});

canvasDraw.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  e.preventDefault(); // evita scroll en touch
  const currentPos = getPosFromEvent(e);

  ctxDraw.save();
  if (isEraser) {
    ctxDraw.globalCompositeOperation = "destination-out";
    ctxDraw.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctxDraw.globalCompositeOperation = "source-over";
    ctxDraw.strokeStyle = currentColor;
  }
  ctxDraw.lineWidth = strokeSize;
  ctxDraw.lineCap = "round";
  ctxDraw.lineJoin = "round";

  ctxDraw.beginPath();
  ctxDraw.moveTo(lastPos.x, lastPos.y);
  ctxDraw.lineTo(currentPos.x, currentPos.y);
  ctxDraw.stroke();
  ctxDraw.restore();

  lastPos = currentPos;
  if (!isEraser && currentColor) usedColors.add(currentColor);
});

["pointerup", "pointercancel", "pointerleave"].forEach((ev) => {
  canvasDraw.addEventListener(ev, (e) => {
    drawing = false;
    try {
      canvasDraw.releasePointerCapture(e.pointerId);
    } catch {}
    lastPos = null;
  });
});

// ===== Guardar / Reset =====
function guardarInformacion() {
  const tmp = document.createElement("canvas");
  tmp.width = canvasDraw.width;
  tmp.height = canvasDraw.height;
  const tctx = tmp.getContext("2d");

  tctx.drawImage(canvasDraw, 0, 0);
  tctx.drawImage(canvasImg, 0, 0);

  const preview = tmp.toDataURL("image/png");
  const datos = {
    colores_utilizados: Array.from(usedColors),
    vista_previa: preview,
  };

  fetch("guardar_coloreo.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  })
    .then((res) => {
      if (res.ok) {
        alert("Guardado exitosamente");
        resetCanvas();
      } else {
        alert("Error al guardar");
      }
    })
    .catch(() => alert("Error de red al guardar"));
}

function resetCanvas() {
  const rect = stack.getBoundingClientRect();
  ctxDraw.clearRect(0, 0, rect.width, rect.height);
  ctxImg.clearRect(0, 0, rect.width, rect.height);

  drawing = false;
  usedColors.clear();
  isEraser = false;
  eraserBtn.setAttribute("aria-pressed", "false");
  lastPos = null;

  currentImage = null;
  imageLocked = false;

  colorChosen = false;
  currentColor = null;
  colorPreview.style.background = "conic-gradient(#0b1220, #111827)";
  inputColor.value = "";

  strokeSize = 12;
  inputSize.value = 12;
  sizeValue.textContent = "12";
}

// ===== Mensajes =====
function showWarn(msg) {
  if (!warnEl) return;
  if (!msg) {
  } else {
    alert(msg);
  }
}

// Exponer para HTML
window.loadImage = loadImage;
window.guardarInformacion = guardarInformacion;
window.resetCanvas = resetCanvas;
