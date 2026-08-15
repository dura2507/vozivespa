// Browser-side receipt shrinking.
//
// Thomas asked to raise the deposit-receipt upload from 4 MB to 10 MB. We
// cannot simply raise the number: Vercel rejects any Serverless Function
// request whose body exceeds 4.5 MB, and it does so BEFORE our route runs.
// A bigger server limit would therefore not accept bigger photos, it would
// only replace our clear "too large" message with an opaque platform error.
//
// What the customer actually needs is for a modern phone photo (8-15 MB) to
// go through. So we accept the big file in the picker and downscale it in the
// browser to comfortably under the server cap. A 12 MP receipt photo lands
// around 300-600 KB with no loss of readability, and the request stays far
// below the platform limit.
//
// PDFs cannot be re-encoded here; they keep the hard limit with a clear
// message. HEIC is attempted (Safari decodes it) and falls back gracefully.

// Hard server-side cap, mirrors MAX_RECEIPT_BYTES in lib/storage.ts.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
// What the file picker accepts before we even try. Generous: this is the
// original phone photo, not what gets uploaded.
export const MAX_PICK_BYTES = 25 * 1024 * 1024;
// Longest edge after downscaling. A receipt/bank-transfer screenshot stays
// perfectly legible; going bigger only costs bytes.
const MAX_EDGE = 2000;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Returns a file small enough to upload, or the original when it is already
 * small enough / cannot be re-encoded. Never throws: on any decode problem it
 * hands back the original so the caller's size check produces the normal
 * error message instead of a crash.
 */
export async function prepareReceipt(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES) return file;
  if (file.type === "application/pdf") return file;
  if (typeof document === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    // Step the quality down until it fits. Three tries is plenty: a 2000px
    // JPEG at 0.6 is well under 1 MB.
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) break;
      if (blob.size <= MAX_UPLOAD_BYTES) {
        const base = file.name.replace(/\.[^.]+$/, "");
        return new File([blob], `${base}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }
    return file;
  } catch {
    // HEIC on a browser that can't decode it, a corrupt file, memory limits:
    // hand back the original and let the caller reject it normally.
    return file;
  }
}
