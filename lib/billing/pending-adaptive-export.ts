import type { MasterJobAnalysis } from "@/lib/api/master-analysis";

import { MASTERSOUCE_PENDING_ADAPTIVE_EXPORT_KEY } from "@/lib/billing/client-key";

export type PendingAdaptiveExportV1 = {
  v: 1;
  jobId: string;
  fileId: string;
  previews: { original: string; mastered: string };
  analysis: MasterJobAnalysis;
  quota?: {
    mastersUsedThisPeriod: number;
    monthlyMastersLimit: number;
    remainingMonthlyMasters: number;
    creditPackBalance: number;
    remainingMasters: number;
    planId: string;
  };
};

export function savePendingAdaptiveExport(snapshot: PendingAdaptiveExportV1): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MASTERSOUCE_PENDING_ADAPTIVE_EXPORT_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadPendingAdaptiveExport(): PendingAdaptiveExportV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MASTERSOUCE_PENDING_ADAPTIVE_EXPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== 1) return null;
    if (typeof o.jobId !== "string" || typeof o.fileId !== "string") return null;
    if (!o.previews || typeof o.previews !== "object") return null;
    const p = o.previews as Record<string, unknown>;
    if (typeof p.original !== "string" || typeof p.mastered !== "string") return null;
    if (!o.analysis || typeof o.analysis !== "object") return null;
    return {
      v: 1,
      jobId: o.jobId,
      fileId: o.fileId,
      previews: { original: p.original, mastered: p.mastered },
      analysis: o.analysis as MasterJobAnalysis,
      quota: o.quota as PendingAdaptiveExportV1["quota"]
    };
  } catch {
    return null;
  }
}

export function clearPendingAdaptiveExport(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MASTERSOUCE_PENDING_ADAPTIVE_EXPORT_KEY);
  } catch {
    /* ignore */
  }
}
