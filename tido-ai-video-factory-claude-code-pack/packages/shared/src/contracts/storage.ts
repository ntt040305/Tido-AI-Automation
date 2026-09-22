import type { DbResult } from "../types/results";

/**
 * Where files live.
 *
 * A deliberately small interface, because the alternative was worse. Storage
 * has three real operations in this product — put a file somewhere, get a URL
 * for it, remove it — and an abstraction that also wrapped listing, copying,
 * signed upload policies and metadata would be a worse version of the SDK it
 * was hiding.
 *
 * An honest note about scope
 * --------------------------
 * The image engine writes its own render folders directly, in
 * `lib/image-engine/delivery`. That is NOT routed through this interface and
 * should not be: the engine is forbidden from importing infrastructure, and
 * handing it a storage provider from this package would break exactly the
 * boundary that keeps a render bug away from customer data.
 *
 * So this serves the application layer — anything a route needs to put
 * somewhere durable. The engine keeps writing to its own directory, and
 * moving those artifacts into object storage is a later phase that has to
 * cross the boundary through a route rather than from inside the engine.
 */

export interface StoredFile {
  /** The key within the bucket. What gets written to a row. */
  path: string;
  /** Bytes as stored, when the provider reported it. */
  size?: number;
  contentType?: string;
}

export interface PutFileInput {
  /** Key within the bucket. Callers namespace their own paths. */
  path: string;
  /**
   * The bytes.
   *
   * `Uint8Array` rather than `Buffer` on purpose: `Buffer` is a Node global,
   * and this package declares itself environment-agnostic with no runtime
   * dependencies. Typing it here would quietly require `@types/node` in a
   * contracts package that should compile anywhere. Node's `Buffer` already
   * IS a `Uint8Array`, so every caller passes one without a cast.
   */
  body: Uint8Array;
  contentType?: string;
  /** Replace an existing object at this key rather than failing. */
  upsert?: boolean;
}

export interface StorageProvider {
  /** True when a backing store is configured. */
  isConfigured(): boolean;

  put(input: PutFileInput): Promise<DbResult<StoredFile>>;

  /**
   * A URL the browser can use, valid for `expiresInSeconds`.
   *
   * Signed and expiring rather than public: these are a customer's product
   * photographs and finished commercial work, and a permanent public URL for
   * them is a leak with a long tail.
   */
  signedUrl(path: string, expiresInSeconds?: number): Promise<DbResult<string>>;

  remove(path: string): Promise<DbResult<void>>;
}
