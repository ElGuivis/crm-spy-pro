import QRCode from "qrcode";

/** Sanitize instance name to evolution-api allowed charset. */
export function sanitizeInstanceName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Extract a string QR value from various evolution-api response shapes. */
export function normalizeQrValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const base64 = obj.base64;
    if (typeof base64 === "string" && base64) return base64;

    const qrcode = obj.qrcode;
    if (qrcode && typeof qrcode === "object") {
      const nested = qrcode as Record<string, unknown>;
      const nestedBase64 = nested.base64;
      if (typeof nestedBase64 === "string" && nestedBase64) return nestedBase64;
    }
  }

  return null;
}

/** Generate a QR data URL from a string code (when evolution-api returns code instead of image). */
export async function generateQrImageFromCode(code: string): Promise<string> {
  return QRCode.toDataURL(code, { margin: 1, width: 256 });
}
