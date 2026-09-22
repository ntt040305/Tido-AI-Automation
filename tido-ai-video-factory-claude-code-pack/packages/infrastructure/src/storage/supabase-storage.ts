import type {
  DbResult,
  StorageProvider,
  StoredFile,
  PutFileInput,
} from "@tido/shared";
import { getDb } from "../supabase/client";

/**
 * Supabase Storage, behind the shared `StorageProvider` contract.
 *
 * Honest status
 * -------------
 * Nothing calls this yet. It exists because the infrastructure boundary needs
 * a storage seam to be a boundary at all, and because the alternative — the
 * application reaching for the Supabase SDK the first time it needs to put a
 * file somewhere — is how the separation this phase just built gets undone.
 *
 * That said, an unused abstraction is a real cost in this codebase, which has
 * repeatedly shipped capability that nothing reached. So the scope is kept
 * deliberately tiny: three methods, no configuration surface, no speculative
 * features. When the first route needs durable file storage it implements
 * against this and finds it adequate or extends it then.
 *
 * What it does NOT do, on purpose: the image engine's render folders. Those
 * are written inside `lib/image-engine/delivery` and stay there, because
 * routing them through here would require the engine to import
 * infrastructure — the exact dependency this phase exists to forbid.
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "tido-assets";

/** How long a signed URL lives. Long enough to load a page, short enough to leak little. */
const DEFAULT_TTL_SECONDS = 60 * 10;

function failure<T>(e: unknown): DbResult<T> {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export const supabaseStorage: StorageProvider = {
  isConfigured(): boolean {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  },

  async put(input: PutFileInput): Promise<DbResult<StoredFile>> {
    const db = await getDb();
    if (!db) return { ok: false, error: "storage not configured", unavailable: true };

    try {
      const res = await db.storage.from(BUCKET).upload(input.path, input.body, {
        contentType: input.contentType,
        upsert: Boolean(input.upsert),
      });
      if (res.error) return failure(res.error);
      return {
        ok: true,
        data: {
          path: res.data?.path || input.path,
          size: input.body.byteLength,
          contentType: input.contentType,
        },
      };
    } catch (e) {
      return failure(e);
    }
  },

  async signedUrl(path: string, expiresInSeconds = DEFAULT_TTL_SECONDS): Promise<DbResult<string>> {
    const db = await getDb();
    if (!db) return { ok: false, error: "storage not configured", unavailable: true };

    try {
      // Signed rather than public. These are a customer's product photographs
      // and finished commercial work; a permanent public URL for them is a
      // leak that outlives the session that created it.
      const res = await db.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
      if (res.error) return failure(res.error);
      if (!res.data?.signedUrl) return { ok: false, error: "no signed url returned" };
      return { ok: true, data: res.data.signedUrl };
    } catch (e) {
      return failure(e);
    }
  },

  async remove(path: string): Promise<DbResult<void>> {
    const db = await getDb();
    if (!db) return { ok: false, error: "storage not configured", unavailable: true };

    try {
      const res = await db.storage.from(BUCKET).remove([path]);
      if (res.error) return failure(res.error);
      return { ok: true, data: undefined };
    } catch (e) {
      return failure(e);
    }
  },
};
