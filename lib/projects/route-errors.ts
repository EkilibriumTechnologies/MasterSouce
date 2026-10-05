import { NextResponse } from "next/server";
import { ProjectStoreError, type ProjectStoreErrorCode } from "@/lib/projects/store";

const STATUS_BY_CODE: Record<ProjectStoreErrorCode, number> = {
  project_not_found: 404,
  generation_not_found: 404,
  artifact_payload_too_large: 413,
  invalid_external_url: 400,
  selected_generation_required: 409
};

/** Maps known store errors to client-safe responses; anything else stays a 500. */
export function projectStoreErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof ProjectStoreError)) return null;
  return NextResponse.json({ error: error.code }, { status: STATUS_BY_CODE[error.code] });
}

export function authenticationRequiredResponse(): NextResponse {
  return NextResponse.json({ error: "authentication_required" }, { status: 401 });
}

export function projectNotFoundResponse(): NextResponse {
  return NextResponse.json({ error: "project_not_found" }, { status: 404 });
}
