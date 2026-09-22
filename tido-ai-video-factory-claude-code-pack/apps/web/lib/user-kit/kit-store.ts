import fs from "fs";
import path from "path";
import type { UserKit, UserKitStore } from "@/lib/image-engine/evolution/experiment/UserKit";
import { emptyKit } from "@/lib/image-engine/evolution/experiment/UserKit";

/**
 * Where a user's kit lives.
 *
 * `UserKitStore` has been an interface with no implementation since the module
 * was written, which is why `UserKit.ts` had zero importers: the shape existed,
 * the merge rules existed, and there was nowhere to put the result.
 *
 * One JSON file per user, atomic write, matching `feature-flags.ts`. Per-user
 * files rather than one shared file on purpose: two people rendering at once
 * cannot then clobber each other's memory, and one corrupt file costs one
 * person's preferences rather than everyone's.
 *
 * This is explicitly not a database. It is the smallest honest thing that
 * makes the memory real, and the interface above it is what a real store
 * implements when one node stops being enough.
 */

const KITS_DIR = process.env.TIDO_KITS_PATH
  ? path.resolve(process.env.TIDO_KITS_PATH)
  : path.join(process.cwd(), "data", "accounts", "kits");

/**
 * Keeps a user id from escaping the kits directory.
 *
 * Ids are uuids from `crypto.randomUUID`, so this should never fire -- but the
 * id reaches here from a cookie, and a value that came from outside is
 * untrusted no matter how it was minted. A `..` in a filename is a read of any
 * file on the box.
 */
function safeFile(userId: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(userId || ""))) return null;
  return path.join(KITS_DIR, `${userId}.json`);
}

export const fileKitStore: UserKitStore = {
  load(userId: string): UserKit | null {
    const file = safeFile(userId);
    if (!file) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.preferences)) return null;
      return parsed as UserKit;
    } catch {
      // No kit yet is the normal state for a new account, not an error.
      return null;
    }
  },

  save(kit: UserKit): void {
    const file = safeFile(kit.user_id);
    if (!file) return;
    fs.mkdirSync(KITS_DIR, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(kit, null, 2), "utf-8");
    fs.renameSync(tmp, file);
  },
};

/** The kit for this user, or a fresh empty one. Never null. */
export function loadOrCreateKit(userId: string): UserKit {
  return fileKitStore.load(userId) || emptyKit(userId);
}
