import {
  authorizeSavedReferenceOwnership,
  isSavedReferenceId,
  parseSaveReferencePayload,
  SAVED_REFERENCE_NOT_FOUND_MESSAGE,
  toPersistedRecordFields,
  toPublicSavedReference,
  type PublicSavedReference,
  type SavedReferenceRequestError
} from "@/lib/song-architect/saved-reference";
import { getSavedReferenceStore, type SavedReferenceStore } from "@/lib/song-architect/saved-reference-store";

export type SaveOwnedReferenceResult =
  | { ok: true; id: string; reference: PublicSavedReference; reused: boolean }
  | SavedReferenceRequestError;

export type ListOwnedReferencesResult = { ok: true; references: PublicSavedReference[] };

export type DeleteOwnedReferenceResult = { ok: true } | SavedReferenceRequestError;

export async function saveOwnedReference(input: {
  trustedEmail: string;
  body: unknown;
  store?: SavedReferenceStore;
}): Promise<SaveOwnedReferenceResult> {
  const parsed = parseSaveReferencePayload(input.body);
  if (!parsed.ok) return parsed;

  const ownership = authorizeSavedReferenceOwnership({
    trustedEmail: input.trustedEmail,
    claimed: parsed.claimed
  });
  if (!ownership.ok) return ownership;

  const store = input.store ?? getSavedReferenceStore();
  const fields = toPersistedRecordFields({
    trustedEmail: input.trustedEmail,
    blueprint: parsed.blueprint
  });
  const saved = await store.upsert(fields);
  const reference = toPublicSavedReference(saved.record);
  return {
    ok: true,
    id: reference.id,
    reference,
    reused: saved.reused
  };
}

export async function listOwnedReferences(input: {
  trustedEmail: string;
  store?: SavedReferenceStore;
}): Promise<ListOwnedReferencesResult> {
  const store = input.store ?? getSavedReferenceStore();
  const records = await store.listByOwner(input.trustedEmail);
  return {
    ok: true,
    references: records.map(toPublicSavedReference)
  };
}

export async function deleteOwnedReference(input: {
  trustedEmail: string;
  id: string;
  store?: SavedReferenceStore;
}): Promise<DeleteOwnedReferenceResult> {
  if (!isSavedReferenceId(input.id)) {
    return {
      ok: false,
      status: 404,
      code: "reference_not_found",
      message: SAVED_REFERENCE_NOT_FOUND_MESSAGE
    };
  }
  const store = input.store ?? getSavedReferenceStore();
  const result = await store.deleteOwned(input.id.trim(), input.trustedEmail);
  if (result === "not_found") {
    return {
      ok: false,
      status: 404,
      code: "reference_not_found",
      message: SAVED_REFERENCE_NOT_FOUND_MESSAGE
    };
  }
  return { ok: true };
}
