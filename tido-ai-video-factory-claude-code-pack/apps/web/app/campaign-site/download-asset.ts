"use client";

/**
 * Browser download helpers for rendered campaign assets.
 *
 * The render endpoint returns a URL served by this app, not the raw bytes. A
 * plain `<a download href={url}>` would work for same-origin files but silently
 * degrades to a navigation if the URL ever moves to a CDN, so the file is fetched
 * into a blob first and handed to the anchor from memory. That keeps the
 * behaviour identical wherever the image is actually stored.
 *
 * A failed download must never destroy the preview — the image on screen is the
 * thing the user asked for; saving it is a convenience on top. Every function
 * here reports failure to the caller instead of throwing into the render flow.
 */

/** Triggers a browser download for an already-built blob. */
function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  // Firefox requires the anchor to be in the document before a synthetic click.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick: revoking synchronously can cancel the download
  // before the browser has read the blob.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

/**
 * Downloads a rendered image.
 *
 * Returns an error string rather than throwing, so a download failure leaves the
 * on-screen preview untouched.
 */
export async function downloadRenderedAsset(
  imageUrl: string,
  filename: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return { ok: false, error: `Không tải được file (HTTP ${res.status})` };
    saveBlob(await res.blob(), filename);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Saves the export metadata record next to the image the user just downloaded. */
export function downloadExportMetadata(metadata: unknown, imageFilename: string): void {
  const jsonName = imageFilename.replace(/\.[a-z0-9]+$/i, "") + ".export.json";
  saveBlob(new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" }), jsonName);
}
