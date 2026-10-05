import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const ROOT = process.cwd();
const read = (relPath) => readFileSync(path.join(ROOT, relPath), "utf8");

function includes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

function excludes(content, needle, context) {
  assert.ok(!content.includes(needle), `${context}: must not include "${needle}"`);
}

function run() {
  const migration = read("supabase/migrations/20261005150000_users_projects_journey_foundation.sql");
  for (const table of ["public.users", "public.projects", "public.project_artifacts", "public.project_generations"]) {
    includes(migration, table, `journey migration includes ${table}`);
  }
  includes(migration, "ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;", "projects RLS enabled");
  includes(migration, "REVOKE ALL ON TABLE public.projects FROM anon, authenticated;", "projects not browser-readable");
  includes(migration, "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO service_role;", "projects server API grant");
  includes(migration, "auth_user_id uuid UNIQUE", "stable auth identity column");
  includes(migration, "user_id uuid NOT NULL REFERENCES public.users(id)", "projects keyed by stable user id");

  const session = read("lib/auth/app-session.ts");
  includes(session, 'const ACCOUNT_SESSION_COOKIE = "ms_account";', "signed account session cookie");
  includes(session, "timingSafeEqual", "account session signature verified");
  includes(session, 'if (process.env.NODE_ENV === "production") return null;', "session signing fails closed in production");
  includes(session, "ageMs > ACCOUNT_SESSION_MAX_AGE_SEC * 1000", "account session replay expires server-side");

  const complete = read("app/api/auth/complete/route.ts");
  includes(complete, "supabase.auth.getUser(parsed.data.accessToken)", "server verifies Supabase access token");
  includes(complete, "upsertVerifiedMasterSauceUser", "verified auth identity maps to stable user");
  const userStore = read("lib/users/store.ts");
  includes(userStore, '.eq("auth_user_id", input.authUserId)', "verified auth id is the stable account anchor");
  includes(
    userStore,
    "existingByAuth.id !== existingByEmail.id",
    "email collision cannot silently merge distinct accounts"
  );
  includes(complete, 'attachTrustedEmailAccessState(res, user.normalizedEmail, "authenticated_user")', "verified account becomes trusted billing identity");

  const collection = read("app/api/projects/route.ts");
  includes(collection, "requireAuthenticatedAccount(request)", "project collection requires account");
  includes(collection, "createProjectForUser(account.user.id", "project creation uses session user id");
  excludes(collection, "userId:", "project collection does not accept client user ownership");

  const detail = read("app/api/projects/[projectId]/route.ts");
  includes(detail, "getProjectForUser(account.user.id, params.projectId)", "project reads are owner-scoped");
  includes(detail, "userId: account.user.id", "project updates are owner-scoped");
  const projectStore = read("lib/projects/store.ts");
  includes(
    projectStore,
    '.eq("project_id", input.projectId)',
    "selected generation must belong to the same Project"
  );
  includes(
    projectStore,
    '.eq("user_id", input.userId)',
    "selected generation must belong to the same user"
  );

  const artifacts = read("app/api/projects/[projectId]/artifacts/route.ts");
  includes(artifacts, "userId: account.user.id", "artifact writes are owner-scoped");
  includes(artifacts, "appendProjectArtifact", "Journey artifacts are durable/versioned");

  const songArchitect = read("app/song-architect/page.tsx");
  includes(songArchitect, 'get("projectId")', "Song Architect accepts Project context");
  for (const kind of ["idea", "song_dna", "lyrics", "suno_prompt"]) {
    includes(songArchitect, `saveProjectArtifact("${kind}"`, `Song Architect saves ${kind}`);
  }
  includes(songArchitect, '"generation"', "Song Architect advances to generation stage");

  const generationMatch = read("components/song-architect/generation-match-panel.tsx");
  includes(
    generationMatch,
    `fetch(\`/api/projects/\${projectId}/generations\``,
    "Generation Match creates a Project generation candidate"
  );
  includes(generationMatch, 'kind: "generation_match"', "Generation Match is persisted");
  includes(generationMatch, 'advanceTo: "analyze_refine"', "Generation Match advances Journey");

  const hitAnalyzer = read("app/ar-ai/page.tsx");
  includes(hitAnalyzer, 'kind: "hit_analysis"', "Hit Analyzer report is persisted");
  includes(hitAnalyzer, "projectId", "Hit Analyzer preserves Project context into mastering");

  const mastering = read("components/upload-form.tsx");
  includes(mastering, '"master_readiness"', "Master Readiness is persisted");
  includes(mastering, '"master_settings"', "master choice is persisted");
  includes(mastering, '"export"', "final export is persisted");
  includes(mastering, '"complete"', "download completes Journey");

  const projectPage = read("app/projects/[projectId]/page.tsx");
  includes(projectPage, "JourneyProgress", "Song Project shows Journey progress");
  includes(projectPage, "Lock this version → Master", "selection is explicit before mastering");
  includes(
    projectPage,
    "selectedGenerationId: generationId",
    "locked mastering version persists the selected generation"
  );
  includes(projectPage, "/song-architect?projectId=", "Project resumes Song Architect");
  includes(projectPage, "/?projectId=", "Project resumes mastering");

  const home = read("app/page.tsx");
  includes(home, 'href="/projects"', "My Songs is reachable from primary navigation");

  console.log("journey project invariants passed");
}

run();
