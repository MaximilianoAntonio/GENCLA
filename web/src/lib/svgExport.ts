export interface SvgSize {
  width: number;
  height: number;
}

export function getSvgSizeFromElement(svg: SVGSVGElement, fallback: SvgSize = { width: 1000, height: 640 }): SvgSize {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }
  const width = Number.parseFloat(svg.getAttribute("width") ?? "") || svg.clientWidth || fallback.width;
  const height = Number.parseFloat(svg.getAttribute("height") ?? "") || svg.clientHeight || fallback.height;
  return { width, height };
}

export function getSvgSizeFromString(svgText: string, fallback: SvgSize = { width: 1000, height: 640 }): SvgSize {
  const widthMatch = svgText.match(/width=["']([0-9.]+)(px)?["']/i);
  const heightMatch = svgText.match(/height=["']([0-9.]+)(px)?["']/i);
  const viewBoxMatch = svgText.match(/viewBox=["']([0-9.\s]+)["']/i);

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map((value) => Number.parseFloat(value));
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const width = widthMatch ? Number.parseFloat(widthMatch[1]) : fallback.width;
  const height = heightMatch ? Number.parseFloat(heightMatch[1]) : fallback.height;
  return { width, height };
}

export async function svgTextToPngBlob(
  svgText: string,
  size: SvgSize,
  background = "#ffffff"
): Promise<Blob> {
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  image.decoding = "async";

  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("No se pudo cargar el SVG"));
  });

  image.src = url;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("No se pudo inicializar el canvas");
  }

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size.width, size.height);
  }
  ctx.drawImage(image, 0, 0, size.width, size.height);
  URL.revokeObjectURL(url);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((pngBlob) => {
      if (pngBlob) resolve(pngBlob);
      else reject(new Error("No se pudo generar el PNG"));
    }, "image/png");
  });

  return blob;
}
