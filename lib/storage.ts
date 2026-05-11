import { getServiceClient } from "@/lib/supabase";

export const RECEIPTS_BUCKET = "booking-receipts";
// 4 MB . keeps full request well under Vercel's 4.5 MB body cap so
// the form never gets a 413. Bucket itself is configured at 5 MB
// (created once via Storage API) which gives us a tiny safety net.
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

export const ALLOWED_RECEIPT_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export type ReceiptMime = (typeof ALLOWED_RECEIPT_MIMES)[number];

export function isAllowedReceiptMime(t: string): t is ReceiptMime {
  return (ALLOWED_RECEIPT_MIMES as readonly string[]).includes(t);
}

function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
  };
  return map[mime] ?? "bin";
}

// Upload a receipt screenshot under `bookings/{bookingId}/receipt.{ext}`.
// Returns the storage path used.
export async function uploadReceipt(
  bookingId: string,
  file: { mime: string; bytes: ArrayBuffer | Uint8Array | Buffer },
): Promise<string> {
  const supabase = getServiceClient();
  const path = `bookings/${bookingId}/receipt.${extensionFor(file.mime)}`;
  const body =
    file.bytes instanceof ArrayBuffer ? new Uint8Array(file.bytes) : file.bytes;
  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, body, {
      contentType: file.mime,
      upsert: true,
    });
  if (error) {
    throw new Error(`storage upload: ${error.message}`);
  }
  return path;
}

// Short-lived signed URL the owner uses to view the receipt from
// Telegram or email. Default 7 days . long enough to act on a booking,
// short enough that the link doesn't outlive the customer relationship.
export async function signedReceiptUrl(
  path: string,
  expiresInSeconds: number = 60 * 60 * 24 * 7,
): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`storage signedUrl: ${error?.message ?? "no url"}`);
  }
  return data.signedUrl;
}
