import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

type TempKind = "upload" | "mastered" | "preview";

export type TempRecord = {
  id: string;
  filePath: string;
  kind: TempKind;
  mime: string;
  jobId: string;
  expiresAt: number;
};

const TEMP_ROOT = path.join(os.tmpdir(), "mastersouce");
const FILE_REGISTRY = new Map<string, TempRecord>();
let cleanupRunning = false;

async function writeMeta(record: TempRecord): Promise<void> {
  const metaPath = path.join(TEMP_ROOT, `${record.id}.meta.json`);
  await fs.writeFile(metaPath, JSON.stringify(record), "utf8");
}

async function readMeta(id: string): Promise<TempRecord | null> {
  try {
    const metaPath = path.join(TEMP_ROOT, `${id}.meta.json`);
    const raw = await fs.readFile(metaPath, "utf8");
    const item = JSON.parse(raw) as TempRecord;
    if (!item.filePath || !item.jobId || !item.kind) return null;
    if (item.expiresAt <= Date.now()) return null;
    await fs.access(item.filePath);
    return item;
  } catch {
    return null;
  }
}

export async function ensureTempRoot(): Promise<void> {
  await fs.mkdir(TEMP_ROOT, { recursive: true });
}

export function getTempRoot(): string {
  return TEMP_ROOT;
}

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

export async function saveTempFile(params: {
  data: Buffer;
  extension: string;
  kind: TempKind;
  mime: string;
  jobId: string;
  ttlMs?: number;
}): Promise<TempRecord> {
  await ensureTempRoot();
  const id = makeId(params.kind);
  const filename = `${id}.${params.extension.replace(".", "")}`;
  const filePath = path.join(TEMP_ROOT, filename);
  await fs.writeFile(filePath, params.data);

  const record: TempRecord = {
    id,
    filePath,
    kind: params.kind,
    mime: params.mime,
    jobId: params.jobId,
    expiresAt: Date.now() + (params.ttlMs ?? 1000 * 60 * 30)
  };
  FILE_REGISTRY.set(id, record);
  await writeMeta(record);
  return record;
}

/**
 * Register a file already on disk (e.g. FFmpeg output).
 * ID must match the filename stem so URLs stay valid across dev workers / HMR.
 */
export async function registerExistingFile(params: {
  filePath: string;
  kind: TempKind;
  mime: string;
  jobId: string;
  ttlMs?: number;
}): Promise<TempRecord> {
  const id = path.basename(params.filePath, path.extname(params.filePath));
  const record: TempRecord = {
    id,
    filePath: params.filePath,
    kind: params.kind,
    mime: params.mime,
    jobId: params.jobId,
    expiresAt: Date.now() + (params.ttlMs ?? 1000 * 60 * 30)
  };
  FILE_REGISTRY.set(id, record);
  await writeMeta(record);
  return record;
}

/**
 * Resolve a temp file by id: in-memory first, then `.meta.json` on disk
 * (Next.js dev may run POST and GET on different workers).
 */
export async function resolveTempRecord(id: string): Promise<TempRecord | null> {
  const cached = FILE_REGISTRY.get(id) ?? null;
  if (cached) {
    if (cached.expiresAt <= Date.now()) {
      FILE_REGISTRY.delete(id);
      await removeTempRecord(id);
      return null;
    }
    return cached;
  }
  const fromDisk = await readMeta(id);
  if (fromDisk) {
    FILE_REGISTRY.set(id, fromDisk);
    return fromDisk;
  }
  return null;
}

export async function findLatestRecordForJob(jobId: string, kind: TempKind): Promise<TempRecord | null> {
  const now = Date.now();
  const fromMem = [...FILE_REGISTRY.values()].filter(
    (item) => item.jobId === jobId && item.kind === kind && item.expiresAt > now
  );
  if (fromMem.length) {
    fromMem.sort((a, b) => b.expiresAt - a.expiresAt);
    return fromMem[0];
  }

  await ensureTempRoot();
  let best: TempRecord | null = null;
  const entries = await fs.readdir(TEMP_ROOT);
  for (const name of entries) {
    if (!name.endsWith(".meta.json")) continue;
    try {
      const raw = await fs.readFile(path.join(TEMP_ROOT, name), "utf8");
      const item = JSON.parse(raw) as TempRecord;
      if (item.jobId !== jobId || item.kind !== kind || item.expiresAt <= now) continue;
      try {
        await fs.access(item.filePath);
      } catch {
        continue;
      }
      if (!best || item.expiresAt > best.expiresAt) best = item;
    } catch {
      continue;
    }
  }
  if (best) FILE_REGISTRY.set(best.id, best);
  return best;
}

export async function removeTempRecord(id: string): Promise<void> {
  const entry = FILE_REGISTRY.get(id);
  FILE_REGISTRY.delete(id);
  try {
    if (entry) await fs.unlink(entry.filePath);
  } catch {
    // ignore
  }
  try {
    await fs.unlink(path.join(TEMP_ROOT, `${id}.meta.json`));
  } catch {
    // ignore
  }
}

export async function cleanupExpiredTempFiles(): Promise<number> {
  if (cleanupRunning) return 0;
  cleanupRunning = true;
  let deletedCount = 0;
  const now = Date.now();
  try {
    const expired = [...FILE_REGISTRY.values()].filter((item) => item.expiresAt <= now);
    await Promise.all(
      expired.map(async (item) => {
        await removeTempRecord(item.id);
        deletedCount += 1;
      })
    );

    await ensureTempRoot();
    const entries = await fs.readdir(TEMP_ROOT, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const fullPath = path.join(TEMP_ROOT, entry.name);
          if (entry.name.endsWith(".meta.json")) return;
          const stats = await fs.stat(fullPath);
          const ageMs = now - stats.mtimeMs;
          if (ageMs > 1000 * 60 * 35) {
            try {
              await fs.unlink(fullPath);
              const stem = path.basename(entry.name, path.extname(entry.name));
              await fs.unlink(path.join(TEMP_ROOT, `${stem}.meta.json`)).catch(() => undefined);
              deletedCount += 1;
            } catch {
              // ignore
            }
          }
        })
    );

    return deletedCount;
  } finally {
    cleanupRunning = false;
  }
}
