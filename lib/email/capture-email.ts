import crypto from "node:crypto";

type EmailLead = {
  email: string;
  jobId: string;
  createdAt: number;
};

const EMAIL_LEADS: EmailLead[] = [];
const UNLOCKED_JOBS = new Set<string>();

export function saveEmailLead(email: string, jobId: string): { ok: true; leadId: string } {
  const leadId = crypto.randomBytes(8).toString("hex");
  EMAIL_LEADS.push({ email, jobId, createdAt: Date.now() });
  UNLOCKED_JOBS.add(jobId);
  return { ok: true, leadId };
}

export function isJobUnlocked(jobId: string): boolean {
  return UNLOCKED_JOBS.has(jobId);
}

export function getLeadsSnapshot(): EmailLead[] {
  return [...EMAIL_LEADS];
}
