// Storage abstraction for the backup system. Imports @aws-sdk/* (which has a
// browser build, so it survives being pulled into a client chunk via dynamic
// import — the app's *.functions.ts / server routes reference this only through
// dynamic import()). It must stay browser-safe: NO node:fs / node:path here.
// The Node-only LocalStore lives in ./backup-local-store (script-only).
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BACKUP_BUCKET_DEFAULT } from "./backup-tables";

export interface StoredObject {
  key: string;
  size: number;
  lastModified?: Date;
}

export interface BackupStore {
  readonly kind: "r2" | "local";
  /** Masked, non-secret description of the write target (for diagnostics). */
  describe?(): string;
  put(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  list(prefix: string): Promise<StoredObject[]>;
  remove(keys: string[]): Promise<void>;
  /** Presigned download URL (R2) or a file:// URL (local). ttlSec used by R2 only. */
  presignGet(key: string, ttlSec: number): Promise<string>;
}

// ── R2 (production) ──────────────────────────────────────────────────────────

export interface R2Env {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * Reads + validates R2 config from the environment. Throws a precise, actionable
 * error naming any missing variable (surfaces in the fail-loud SMS + logs).
 */
export function readR2Env(env: NodeJS.ProcessEnv = process.env): R2Env {
  // Be forgiving about how R2_ACCOUNT_ID was pasted. If it's a full endpoint URL
  // (or has a scheme / trailing path), reduce it to the bare account id — a
  // multi-dot host like "id.r2.cloudflarestorage.com.r2.cloudflarestorage.com"
  // or a scheme prefix fails the TLS handshake (SSL alert 40), since the R2
  // wildcard cert only covers one subdomain level.
  const accountId = (env.R2_ACCOUNT_ID || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.r2\.cloudflarestorage\.com$/i, "");
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BACKUP_BUCKET?.trim() || BACKUP_BUCKET_DEFAULT;

  const missing = [
    ...(!accountId ? ["R2_ACCOUNT_ID"] : []),
    ...(!accessKeyId ? ["R2_ACCESS_KEY_ID"] : []),
    ...(!secretAccessKey ? ["R2_SECRET_ACCESS_KEY"] : []),
  ];
  if (missing.length) {
    throw new Error(
      `Missing Cloudflare R2 env var(s): ${missing.join(", ")}. ` +
        `Set them in .env (local) and the Vercel project's Environment Variables. ` +
        `Optional: R2_BACKUP_BUCKET (defaults to "${BACKUP_BUCKET_DEFAULT}").`,
    );
  }
  return { accountId: accountId!, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey!, bucket };
}

export function hasR2Env(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

export class R2Store implements BackupStore {
  readonly kind = "r2" as const;
  private client: S3Client;
  private bucket: string;
  private accountId: string;

  constructor(env?: R2Env) {
    const cfg = env ?? readR2Env();
    this.bucket = cfg.bucket;
    this.accountId = cfg.accountId;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  /** Masked host so a misconfigured R2_ACCOUNT_ID is diagnosable without leaking it. */
  describe(): string {
    const a = this.accountId;
    const masked = a.length <= 8 ? a : `${a.slice(0, 4)}…${a.slice(-4)}`;
    const dots = (a.match(/\./g) || []).length;
    return `r2 host "${masked}.r2.cloudflarestorage.com" (accountId len=${a.length}, dots=${dots}, bucket=${this.bucket})`;
  }

  async put(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const out: StoredObject[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) {
        if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async remove(keys: string[]): Promise<void> {
    if (!keys.length) return;
    // DeleteObjects caps at 1000 keys per request.
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  async presignGet(key: string, ttlSec: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSec,
    });
  }
}

/** Production factory: R2 when configured. Throws (with the missing-var list) otherwise. */
export function getBackupStore(): BackupStore {
  return new R2Store();
}
