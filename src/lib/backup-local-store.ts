// Local-filesystem BackupStore. Node-only (imports node:fs / node:path), used
// exclusively by the restore script (and ad-hoc verify harnesses) — never by the
// app's server functions or routes, so it must NOT be imported from
// backup-store.server.ts (that module can end up in the client build graph via
// dynamic import, where node:fs/node:path hard-fail the browser bundle).
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackupStore, StoredObject } from "./backup-store.server";

export class LocalStore implements BackupStore {
  readonly kind = "local" as const;
  constructor(private baseDir: string) {}

  private full(key: string) {
    return path.join(this.baseDir, key);
  }

  async put(key: string, body: Buffer | Uint8Array | string, _contentType: string): Promise<void> {
    const p = this.full(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, typeof body === "string" ? body : Buffer.from(body));
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.full(key));
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const root = this.baseDir;
    const out: StoredObject[] = [];
    const walk = async (dir: string) => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) await walk(abs);
        else {
          const key = path.relative(root, abs).split(path.sep).join("/");
          if (key.startsWith(prefix)) {
            const st = await fs.stat(abs);
            out.push({ key, size: st.size, lastModified: st.mtime });
          }
        }
      }
    };
    await walk(root);
    return out;
  }

  async remove(keys: string[]): Promise<void> {
    for (const k of keys) {
      try {
        await fs.unlink(this.full(k));
      } catch {
        /* ignore missing */
      }
    }
  }

  async presignGet(key: string, _ttlSec: number): Promise<string> {
    return "file://" + this.full(key).split(path.sep).join("/");
  }
}
