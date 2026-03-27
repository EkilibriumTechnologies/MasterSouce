export type JsonLike = Record<string, unknown> | null;

export async function readResponsePayload(response: Response): Promise<JsonLike> {
  const raw = await response.text();
  if (!raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
