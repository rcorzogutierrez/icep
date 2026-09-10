import { toDataURL } from 'qrcode';

/** Data URL de un QR para `text`, generado 100% en el navegador (sin servicio externo). Null si falla. */
export async function generateQrDataUrl(text: string): Promise<string | null> {
  try {
    return await toDataURL(text, { width: 220, margin: 1 });
  } catch {
    return null;
  }
}
