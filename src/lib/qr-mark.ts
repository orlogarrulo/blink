import QRCode from "qrcode";

/** Draw a high-contrast QR mark onto a canvas (ink on paper). */
export async function qrCanvas(text: string, size = 512): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  await QRCode.toCanvas(canvas, text, {
    margin: 0,
    width: size,
    errorCorrectionLevel: "M",
    color: { dark: "#1A120C", light: "#F6F0E6" },
  });
  return canvas;
}
