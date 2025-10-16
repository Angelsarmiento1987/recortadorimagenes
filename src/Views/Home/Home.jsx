import React, { useRef, useState, useEffect } from "react";



export default function ImageCropperApp() {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [imgObj, setImgObj] = useState(null); // HTMLImageElement

  // position & scale state for moving the image inside the crop viewport
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  // viewport size on screen (px)
  const [viewportSize, setViewportSize] = useState({ w: 600, h: 600 });

  // target output size in pixels (the resolution user wants)
  const [outputSize, setOutputSize] = useState({ w: 1024, h: 1030 });

  // crop box size (on screen) — this maintains the output aspect ratio
  const [cropBox, setCropBox] = useState({ w: 500, h: 503 });

  // rendered image size on screen (after fitting to viewport)
  const [renderedSize, setRenderedSize] = useState({ w: 0, h: 0 });

  // Recompute crop box when outputSize or viewport changes
  useEffect(() => {
    const vpW = viewportSize.w;
    const vpH = viewportSize.h;
    const aspect = outputSize.w / outputSize.h;
    // Fit the crop box maximizing size inside viewport while keeping aspect ratio
    let boxW = vpW * 0.9; // 90% of viewport width
    let boxH = boxW / aspect;
    if (boxH > vpH * 0.9) {
      boxH = vpH * 0.9;
      boxW = boxH * aspect;
    }
    setCropBox({ w: Math.round(boxW), h: Math.round(boxH) });
  }, [outputSize, viewportSize]);

  // When image loads, compute initial rendered size to fit the viewport
  useEffect(() => {
    if (!imgObj || !containerRef.current) return;
    const vp = containerRef.current.getBoundingClientRect();
    const maxW = vp.width;
    const maxH = vp.height;
    const aspect = imgObj.naturalWidth / imgObj.naturalHeight;
    let rw = maxW;
    let rh = Math.round(rw / aspect);
    if (rh < maxH) {
      // fits by width; ok
    } else {
      rh = maxH;
      rw = Math.round(rh * aspect);
    }
    setRenderedSize({ w: rw, h: rh });

    // center image in crop box by default
    const initialX = (vp.width - rw) / 2;
    const initialY = (vp.height - rh) / 2;
    setPos({ x: initialX, y: initialY });
  }, [imgObj]);

  // handle window resize to update viewport size
  useEffect(() => {
    function update() {
      // keep a square-ish viewport but responsive
      const width = Math.min(700, window.innerWidth - 80);
      const height = Math.min(700, window.innerHeight - 220);
      setViewportSize({ w: width, h: height });
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Load a selected file
  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFileUrl(url);
    const img = new Image();
    img.onload = () => {
      setImgObj(img);
      // reset position
      setPos({ x: 0, y: 0 });
    };
    img.src = url;
  };

  // Presets for common sizes
  const presets = [
    { w: 1024, h: 1365 },
    { w: 1024, h: 1030 },
    { w: 800, h: 600 },
    { w: 400, h: 400 },
    { w: 1200, h: 800 },
  ];

  const pointerDown = (e) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX ?? e.touches?.[0]?.clientX, y: e.clientY ?? e.touches?.[0]?.clientY };
    posStart.current = { ...pos };
  };
  const pointerMove = (e) => {
    if (!dragging) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    const dx = cx - dragStart.current.x;
    const dy = cy - dragStart.current.y;
    let nx = posStart.current.x + dx;
    let ny = posStart.current.y + dy;
    // constrain so the image always covers the crop box area (no empty gaps)

    // compute crop box position inside viewport (centered)
    const vp = containerRef.current.getBoundingClientRect();
    const cropLeft = Math.round((vp.width - cropBox.w) / 2);
    const cropTop = Math.round((vp.height - cropBox.h) / 2);

    // image bounds inside viewport
    const imgLeft = nx;
    const imgTop = ny;
    const imgRight = nx + renderedSize.w;
    const imgBottom = ny + renderedSize.h;

    // ensure left <= cropLeft and right >= cropLeft+cropW (image covers crop horizontally)
    if (imgLeft > cropLeft) nx = cropLeft;
    if (imgRight < cropLeft + cropBox.w) nx = cropLeft + cropBox.w - renderedSize.w;
    if (imgTop > cropTop) ny = cropTop;
    if (imgBottom < cropTop + cropBox.h) ny = cropTop + cropBox.h - renderedSize.h;

    setPos({ x: nx, y: ny });
  };
  const pointerUp = () => {
    setDragging(false);
  };

  // core: create cropped image and trigger download
  const handleDownload = () => {
    if (!imgObj) return;
    // compute mapping from screen coords to original image pixels
    const vp = containerRef.current.getBoundingClientRect();

    // renderScale: how many screen px correspond to 1 original image px
    const renderScaleX = renderedSize.w / imgObj.naturalWidth;
    const renderScaleY = renderedSize.h / imgObj.naturalHeight;
    // (we kept aspect, so both scales should be similar)

    // crop box position on screen
    const cropLeft = Math.round((vp.width - cropBox.w) / 2);
    const cropTop = Math.round((vp.height - cropBox.h) / 2);

    // the top-left of the crop box relative to the image (in screen px)
    const sx_screen = cropLeft - pos.x;
    const sy_screen = cropTop - pos.y;

    // convert to original image pixels
    const sx = Math.max(0, Math.round(sx_screen / renderScaleX));
    const sy = Math.max(0, Math.round(sy_screen / renderScaleY));
    const sWidth = Math.round(cropBox.w / renderScaleX);
    const sHeight = Math.round(cropBox.h / renderScaleY);

    // ensure we don't exceed image bounds
    const sx_clamped = Math.min(Math.max(0, sx), imgObj.naturalWidth - 1);
    const sy_clamped = Math.min(Math.max(0, sy), imgObj.naturalHeight - 1);
    const sWidth_clamped = Math.min(sWidth, imgObj.naturalWidth - sx_clamped);
    const sHeight_clamped = Math.min(sHeight, imgObj.naturalHeight - sy_clamped);

    // create canvas with desired output size
    const canvas = document.createElement("canvas");
    canvas.width = outputSize.w;
    canvas.height = outputSize.h;
    const ctx = canvas.getContext("2d");

    // draw the selected portion scaled to the output size
    ctx.drawImage(
      imgObj,
      sx_clamped,
      sy_clamped,
      sWidth_clamped,
      sHeight_clamped,
      0,
      0,
      outputSize.w,
      outputSize.h
    );

    // trigger download
    canvas.toBlob((blob) => {
      const link = document.createElement("a");
      link.download = `dije_crop_${outputSize.w}x${outputSize.h}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    }, "image/png");
  };

  return (
    <div style={{ fontFamily: "Inter, Roboto, sans-serif", padding: 20 }}>
      <h2 style={{ margin: 0 }}>Recortador Imagenes - Web Sin Vueltas</h2>
      <p style={{ color: "#555" }}>Subí una imagen, elegí la resolución deseada y mueve la imagen dentro del recuadro para recortarla.</p>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 300 }}>
          <label style={{ display: "block", marginBottom: 8 }}>Imagen</label>
          <input type="file" accept="image/*" onChange={handleFile} />

          <div style={{ marginTop: 16 }}>
            <label>Resolución de salida</label>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {presets.map((p) => (
                <button
                  key={`${p.w}x${p.h}`}
                  onClick={() => setOutputSize({ w: p.w, h: p.h })}
                  style={{ padding: "6px 10px", cursor: "pointer" }}
                >
                  {p.w} x {p.h}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                type="number"
                value={outputSize.w}
                onChange={(e) => setOutputSize((s) => ({ ...s, w: Math.max(1, Number(e.target.value) || 1) }))}
                style={{ width: 110, marginRight: 8 }}
              />
              x
              <input
                type="number"
                value={outputSize.h}
                onChange={(e) => setOutputSize((s) => ({ ...s, h: Math.max(1, Number(e.target.value) || 1) }))}
                style={{ width: 110, marginLeft: 8 }}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button onClick={handleDownload} disabled={!imgObj} style={{ padding: "10px 14px", cursor: imgObj ? "pointer" : "not-allowed" }}>
              Descargar imagen recortada
            </button>
          </div>

          <div style={{ marginTop: 16, color: "#666", fontSize: 14 }}>
            <strong>Tips:</strong>
            <ul>
              <li>Mueve la imagen dentro del recuadro arrastrando sobre la imagen.</li>
              <li>El recuadro mantiene la proporción de la resolución elegida.</li>
              <li>Si necesitás zoom, subí una imagen con mayor resolución para mejor calidad.</li>
            </ul>
          </div>
        </div>

        <div>
          <div
            ref={containerRef}
            style={{
              width: viewportSize.w,
              height: viewportSize.h,
              border: "1px solid #ddd",
              position: "relative",
              touchAction: "none",
              background: "#fafafa",
            }}
            onMouseMove={pointerMove}
            onMouseUp={pointerUp}
            onMouseLeave={pointerUp}
            onMouseDown={pointerDown}
            onTouchStart={pointerDown}
            onTouchMove={pointerMove}
            onTouchEnd={pointerUp}
          >
            {/* image */}
            {fileUrl && (
              <img
                ref={imgRef}
                src={fileUrl}
                alt="to crop"
                draggable={false}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: renderedSize.w,
                  height: renderedSize.h,
                  userSelect: "none",
                  touchAction: "none",
                  cursor: dragging ? "grabbing" : "grab",
                }}
              />
            )}

            {/* crop box overlay (centered) */}
            <div
              style={{
                position: "absolute",
                left: Math.round((viewportSize.w - cropBox.w) / 2),
                top: Math.round((viewportSize.h - cropBox.h) / 2),
                width: cropBox.w,
                height: cropBox.h,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                border: "2px dashed #fff",
                boxSizing: "border-box",
                pointerEvents: "none",
              }}
            />

            {/* helper border around viewport */}
            <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, pointerEvents: "none" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
