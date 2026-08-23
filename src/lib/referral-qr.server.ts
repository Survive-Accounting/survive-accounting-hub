// referral-qr.server.ts — QR data-URI generation, isolated from referral.server.ts so the `qrcode`
// package never enters the redirect route's client graph. Imported ONLY from *.functions.ts handler
// bodies (which are stripped from the client bundle). `qrcode` is pure JS (same package flyer.server.ts
// uses), so this is safe to bundle server-side.
import QRCode from "qrcode";

export async function qrDataUri(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 600,
    color: { dark: "#14213D", light: "#FFFFFF" },
  });
}
