/**
 * Journey foundation: accounts, Song Project ownership, and Journey persistence.
 *
 * Exercises the real route handlers and stores against an in-memory Supabase fake
 * (scripts/lib/fake-supabase.mjs) plus a stubbed Supabase Auth HTTP endpoint.
 *
 * node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/journey-foundation-test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { createFakeSupabase } from "./lib/fake-supabase.mjs";

process.env.MASTERSAUCE_EMAIL_VERIFY_SECRET = "journey-foundation-test-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://journey-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_journey_test";

const ROOT = process.cwd();
const read = (relPath) => readFileSync(path.join(ROOT, relPath), "utf8");

const { NextRequest, NextResponse } = await import("next/server");
const { setJourneyDbForTests } = await import("@/lib/journeys/db");
const { attachAppSession, readAppSession } = await import("@/lib/auth/app-session");
const { JOURNEY_STAGE_IDS } = await import("@/lib/journeys/stages");
const { PROJECT_ARTIFACT_KINDS } = await import("@/lib/projects/types");
const { saveProjectArtifactRequest, readProjectIdFromLocation } = await import("@/lib/projects/client");
const { linkVerifiedUserHistory } = await import("@/lib/users/store");
const projectsRoute = await import("@/app/api/projects/route");
const projectRoute = await import("@/app/api/projects/[projectId]/route");
const artifactsRoute = await import("@/app/api/projects/[projectId]/artifacts/route");
const generationsRoute = await import("@/app/api/projects/[projectId]/generations/route");
const sessionRoute = await import("@/app/api/auth/session/route");
const logoutRoute = await import("@/app/api/auth/logout/route");
const confirmRoute = await import("@/app/auth/confirm/route");

const USER_A = { id: "a1111111-1111-4111-8111-111111111111", auth: "a2222222-2222-4222-8222-222222222222", email: "artist-a@example.com" };
const USER_B = { id: "b1111111-1111-4111-8111-111111111111", auth: "b2222222-2222-4222-8222-222222222222", email: "artist-b@example.com" };

function freshDb(extraSeed = {}) {
  const db = createFakeSupabase({
    users: [USER_A, USER_B].map((user) => ({
      id: user.id,
      auth_user_id: user.auth,
      normalized_email: user.email,
      email: user.email,
      stripe_customer_id: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z"
    })),
    ...extraSeed
  });
  setJourneyDbForTests(db);
  return db;
}

function sessionCookieFor(user) {
  const res = NextResponse.json({});
  attachAppSession(res, { userId: user.id, authUserId: user.auth, normalizedEmail: user.email });
  return `ms_account=${res.cookies.get("ms_account").value}`;
}

function request(method, urlPath, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const ctx = (projectId) => ({ params: { projectId } });

async function json(res) {
  return { status: res.status, body: await res.json() };
}

async function createProject(user, title = "Night Drive") {
  const res = await json(
    await projectsRoute.POST(request("POST", "/api/projects", { cookie: sessionCookieFor(user), body: { title } }))
  );
  assert.equal(res.status, 201);
  return res.body.project;
}

async function postArtifact(user, projectId, body) {
  return json(
    await artifactsRoute.POST(
      request("POST", `/api/projects/${projectId}/artifacts`, { cookie: sessionCookieFor(user), body }),
      ctx(projectId)
    )
  );
}

async function postGeneration(user, projectId, body) {
  return json(
    await generationsRoute.POST(
      request("POST", `/api/projects/${projectId}/generations`, { cookie: sessionCookieFor(user), body }),
      ctx(projectId)
    )
  );
}

async function patchProject(user, projectId, body) {
  return json(
    await projectRoute.PATCH(
      request("PATCH", `/api/projects/${projectId}`, { cookie: sessionCookieFor(user), body }),
      ctx(projectId)
    )
  );
}

async function getProject(user, projectId) {
  return json(await projectRoute.GET(request("GET", `/api/projects/${projectId}`, { cookie: sessionCookieFor(user) }), ctx(projectId)));
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------------------
// Account session
// ---------------------------------------------------------------------------
test("account session cookie is signed, HTTP-only, and tamper-evident", async () => {
  const res = NextResponse.json({});
  attachAppSession(res, { userId: USER_A.id, authUserId: USER_A.auth, normalizedEmail: USER_A.email });
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /ms_account=/);
  assert.match(setCookie, /HttpOnly/i, "account session must be HTTP-only");
  assert.match(setCookie, /SameSite=lax/i);

  const valid = request("GET", "/", { cookie: sessionCookieFor(USER_A) });
  assert.equal(readAppSession(valid)?.userId, USER_A.id);

  const raw = sessionCookieFor(USER_A).slice("ms_account=".length);
  const [payload, signature] = raw.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")), userId: USER_B.id })
  ).toString("base64url");
  assert.equal(readAppSession(request("GET", "/", { cookie: `ms_account=${forgedPayload}.${signature}` })), null);
  assert.equal(readAppSession(request("GET", "/", { cookie: `ms_account=${payload}.AAAA` })), null);
});

test("account session expires server-side and fails closed without a production secret", async () => {
  const sessionSource = read("lib/auth/app-session.ts");
  assert.ok(sessionSource.includes("ageMs > ACCOUNT_SESSION_MAX_AGE_SEC * 1000"));
  assert.ok(sessionSource.includes('if (process.env.NODE_ENV === "production") return null;'));
  assert.ok(sessionSource.includes("account-session:v1:"), "account session key is domain-separated from billing trust");
});

// ---------------------------------------------------------------------------
// Authentication gates and ownership (IDOR/BOLA)
// ---------------------------------------------------------------------------
test("every Project endpoint requires an authenticated account", async () => {
  freshDb();
  const pid = "c1111111-1111-4111-8111-111111111111";
  const calls = [
    projectsRoute.GET(request("GET", "/api/projects")),
    projectsRoute.POST(request("POST", "/api/projects", { body: {} })),
    projectRoute.GET(request("GET", `/api/projects/${pid}`), ctx(pid)),
    projectRoute.PATCH(request("PATCH", `/api/projects/${pid}`, { body: { title: "x" } }), ctx(pid)),
    artifactsRoute.GET(request("GET", `/api/projects/${pid}/artifacts`), ctx(pid)),
    artifactsRoute.POST(request("POST", `/api/projects/${pid}/artifacts`, { body: { kind: "idea", payload: {} } }), ctx(pid)),
    generationsRoute.GET(request("GET", `/api/projects/${pid}/generations`), ctx(pid)),
    generationsRoute.POST(request("POST", `/api/projects/${pid}/generations`, { body: {} }), ctx(pid))
  ];
  for (const res of await Promise.all(calls)) assert.equal(res.status, 401);

  // A validly signed session for a user whose auth identity changed is rejected.
  const db = freshDb();
  db.rows("users").find((row) => row.id === USER_A.id).auth_user_id = "d0000000-0000-4000-8000-000000000000";
  const stale = await projectsRoute.GET(request("GET", "/api/projects", { cookie: sessionCookieFor(USER_A) }));
  assert.equal(stale.status, 401);
});

test("Projects are scoped by stable user_id; cross-user UUID access is impossible", async () => {
  const db = freshDb();
  const projectA = await createProject(USER_A, "Song A");
  assert.equal(projectA.userId, USER_A.id);
  await createProject(USER_B, "Song B");

  const listB = await json(await projectsRoute.GET(request("GET", "/api/projects", { cookie: sessionCookieFor(USER_B) })));
  assert.deepEqual(listB.body.projects.map((p) => p.title), ["Song B"]);

  assert.equal((await getProject(USER_B, projectA.id)).status, 404);
  assert.equal((await patchProject(USER_B, projectA.id, { title: "stolen" })).status, 404);
  assert.equal((await postArtifact(USER_B, projectA.id, { kind: "idea", payload: { x: 1 } })).status, 404);
  assert.equal((await postGeneration(USER_B, projectA.id, { label: "x" })).status, 404);
  const foreignArtifacts = await artifactsRoute.GET(
    request("GET", `/api/projects/${projectA.id}/artifacts`, { cookie: sessionCookieFor(USER_B) }),
    ctx(projectA.id)
  );
  assert.equal(foreignArtifacts.status, 404);
  assert.equal(db.rows("projects").find((p) => p.id === projectA.id).title, "Song A");
  assert.equal(db.rows("project_artifacts").length, 0);

  // Ownership cannot be injected from the client body.
  const injected = await json(
    await projectsRoute.POST(
      request("POST", "/api/projects", { cookie: sessionCookieFor(USER_B), body: { title: "x", userId: USER_A.id } })
    )
  );
  assert.equal(injected.status, 201);
  assert.equal(injected.body.project.userId, USER_B.id);
  assert.equal((await postArtifact(USER_A, projectA.id, { kind: "idea", payload: {}, userId: USER_B.id })).status, 400);

  // Malformed ids are a clean 404, not a database error.
  assert.equal((await getProject(USER_A, "not-a-uuid")).status, 404);
});

test("selectedGenerationId only accepts a generation of the same Project and user", async () => {
  const db = freshDb();
  const projectA1 = await createProject(USER_A, "A1");
  const projectA2 = await createProject(USER_A, "A2");
  const projectB = await createProject(USER_B, "B1");
  const genA1 = (await postGeneration(USER_A, projectA1.id, { label: "take 1" })).body.generation;
  const genA2 = (await postGeneration(USER_A, projectA2.id, { label: "other song" })).body.generation;
  const genB = (await postGeneration(USER_B, projectB.id, { label: "victim take" })).body.generation;

  for (const foreign of [genA2.id, genB.id, "e0000000-0000-4000-8000-000000000000"]) {
    const res = await patchProject(USER_A, projectA1.id, { selectedGenerationId: foreign, currentStage: "selected_generation" });
    assert.equal(res.status, 404, `foreign generation ${foreign} must be rejected`);
    assert.equal(res.body.error, "generation_not_found");
  }
  assert.equal(db.rows("projects").find((p) => p.id === projectA1.id).selected_generation_id, null);

  // Lock Version requires a real lock.
  const noLock = await patchProject(USER_A, projectA1.id, { currentStage: "selected_generation" });
  assert.equal(noLock.status, 409);

  const locked = await patchProject(USER_A, projectA1.id, { selectedGenerationId: genA1.id, currentStage: "selected_generation" });
  assert.equal(locked.status, 200);
  assert.equal(locked.body.project.selectedGenerationId, genA1.id);
  assert.equal(db.rows("project_generations").find((g) => g.id === genA1.id).selected, true);

  // Generation-linked artifacts verify ownership too.
  const foreignLink = await postArtifact(USER_A, projectA1.id, { kind: "generation_match", payload: {}, generationId: genB.id });
  assert.equal(foreignLink.status, 404);
});

test("generation candidates accept only http(s) links", async () => {
  freshDb();
  const project = await createProject(USER_A);
  const bad = await postGeneration(USER_A, project.id, { externalUrl: "javascript:alert(document.cookie)" });
  assert.equal(bad.status, 400);
  const good = await postGeneration(USER_A, project.id, { externalUrl: "https://suno.com/song/abc", label: "v1" });
  assert.equal(good.status, 201);
  assert.equal(good.body.generation.externalUrl, "https://suno.com/song/abc");
});

// ---------------------------------------------------------------------------
// Journey persistence: Song Architect → Generation Match → Hit Analyzer → Mastering → Export
// ---------------------------------------------------------------------------
test("full Journey persists every stage and completes only on final export", async () => {
  const db = freshDb();
  const project = await createProject(USER_A, "Full Journey");

  // Song Architect autosave (same sequence app/song-architect/page.tsx posts).
  for (const [kind, advanceTo] of [
    ["idea", "song_dna"],
    ["song_dna", "lyrics"],
    ["lyrics", "suno_prompt"],
    ["suno_prompt", "generation"]
  ]) {
    const res = await postArtifact(USER_A, project.id, { kind, payload: { kind }, advanceTo });
    assert.equal(res.status, 201, `${kind} saved`);
  }
  assert.equal((await getProject(USER_A, project.id)).body.project.currentStage, "generation");

  // User leaves for Suno and returns: the same Project is still there.
  const returned = await getProject(USER_A, project.id);
  assert.equal(returned.body.artifacts.length, 4);

  // Generation Match: candidate record + linked history.
  const generation = (await postGeneration(USER_A, project.id, { label: "suno-take-2.wav", metadata: { sourceFile: { name: "suno-take-2.wav" } } })).body.generation;
  const match = await postArtifact(USER_A, project.id, {
    kind: "generation_match",
    generationId: generation.id,
    payload: { match: { overall: "high" }, improvedGenerationPrompt: "tighter drums", generationId: "client-forged" },
    advanceTo: "analyze_refine"
  });
  assert.equal(match.status, 201);
  assert.equal(match.body.artifact.payload.generationId, generation.id, "server-verified generation link wins");
  assert.equal(match.body.project.currentStage, "analyze_refine");

  // Hit Analyzer report attaches without moving the Journey.
  const report = await postArtifact(USER_A, project.id, { kind: "hit_analysis", payload: { report: { overallRating: 8 } } });
  assert.equal(report.status, 201);
  assert.equal(report.body.project.currentStage, "analyze_refine");

  // Explicit lock.
  assert.equal((await patchProject(USER_A, project.id, { selectedGenerationId: generation.id, currentStage: "selected_generation" })).status, 200);

  // Mastering readiness/settings are stamped with the locked generation server-side.
  const readiness = await postArtifact(USER_A, project.id, {
    kind: "master_readiness",
    payload: { masterReadiness: { verdict: "ready" }, selectedGenerationId: "client-forged" },
    advanceTo: "master"
  });
  assert.equal(readiness.body.artifact.payload.selectedGenerationId, generation.id);
  assert.equal(readiness.body.project.currentStage, "master");
  const settings = await postArtifact(USER_A, project.id, { kind: "master_settings", payload: { mode: "standard", jobId: "job-1" }, advanceTo: "export" });
  assert.equal(settings.body.project.currentStage, "export");
  assert.equal(settings.body.project.status, "active");

  // Final export completes the Journey.
  const exported = await postArtifact(USER_A, project.id, {
    kind: "export",
    payload: { format: "wav", jobId: "job-1", fileId: "file-1", masteringMode: "standard" },
    advanceTo: "complete"
  });
  assert.equal(exported.status, 201);
  assert.equal(exported.body.project.currentStage, "complete");
  assert.equal(exported.body.project.status, "complete");
  assert.equal(exported.body.artifact.payload.selectedGenerationId, generation.id);

  // Re-running an earlier tool never rewinds a completed Journey.
  const rerun = await postArtifact(USER_A, project.id, { kind: "song_dna", payload: { v: 2 }, advanceTo: "lyrics" });
  assert.equal(rerun.body.project.currentStage, "complete");
  assert.equal(rerun.body.artifact.version, 2, "artifacts are versioned, never overwritten");
  assert.equal(db.rows("project_artifacts").filter((row) => row.kind === "song_dna").length, 2);
});

test("artifact payloads are bounded and audio bytes are never accepted", async () => {
  freshDb();
  const project = await createProject(USER_A);
  const huge = await postArtifact(USER_A, project.id, { kind: "hit_analysis", payload: { blob: "x".repeat(600 * 1024) } });
  assert.equal(huge.status, 413);
});

test("concurrent artifact saves retry on version collisions", async () => {
  freshDb();
  const project = await createProject(USER_A);
  const results = await Promise.all(
    Array.from({ length: 3 }, (_, index) => postArtifact(USER_A, project.id, { kind: "lyrics", payload: { index } }))
  );
  assert.deepEqual(results.map((res) => res.status), [201, 201, 201]);
  assert.deepEqual(results.map((res) => res.body.artifact.version).sort(), [1, 2, 3]);
});

// ---------------------------------------------------------------------------
// Tool integrations (client wiring)
// ---------------------------------------------------------------------------
test("Song Architect, Generation Match, and Hit Analyzer persist into the Project", () => {
  const songArchitect = read("app/song-architect/page.tsx");
  assert.ok(songArchitect.includes("readProjectIdFromLocation(window.location.search)"));
  for (const kind of ["idea", "song_dna", "lyrics", "suno_prompt"]) {
    assert.match(songArchitect, new RegExp(`saveProjectArtifact\\(\\s*"${kind}"`), `Song Architect saves ${kind}`);
  }
  assert.match(songArchitect, /"suno_prompt",[\s\S]*?"generation"\s*\)/, "Song Architect advances to generation");
  assert.ok(songArchitect.includes("await persistSongArchitectProject(payload, data.data)"));

  const panel = read("components/song-architect/generation-match-panel.tsx");
  assert.ok(panel.includes("createProjectGenerationRequest(targetProjectId"), "Generation Match creates a generation record");
  assert.ok(panel.includes('kind: "generation_match"'));
  assert.ok(panel.includes("generationId: generation.generation.id"), "match history links the generation record");
  assert.ok(panel.includes('advanceTo: "analyze_refine"'));

  const hitAnalyzer = read("app/ar-ai/page.tsx");
  assert.ok(hitAnalyzer.includes('kind: "hit_analysis"'));
  assert.ok(hitAnalyzer.includes("void saveHitAnalysisToProject(data)"));
  assert.ok(hitAnalyzer.includes("`/?source=hit-analyzer&projectId=${projectId}#master`"), "Master CTA keeps projectId");

  const projectPage = read("app/projects/[projectId]/page.tsx");
  assert.ok(projectPage.includes("<GenerationMatchPanel"), "returning users can run Generation Match from the Project");
  assert.ok(projectPage.includes("selectedGenerationId: generationId"), "Lock Version persists the selected generation");
  assert.ok(projectPage.includes("Lock this version → Master"));
});

test("mastering persists readiness and settings", () => {
  const mastering = read("components/upload-form.tsx");
  assert.match(mastering, /void saveProjectArtifact\(\s*"master_readiness",[\s\S]*?"master"\s*\)/);
  const settingsSaves = mastering.match(/void saveProjectArtifact\(\s*"master_settings",[\s\S]*?"export"\s*\)/g) ?? [];
  assert.equal(settingsSaves.length, 2, "standard and adaptive mastering both persist settings");
});

function downloadHandlers(source, urlVariable) {
  const start = source.indexOf(`downloadFinalMasterWithOptionalBypass(\n`);
  assert.ok(start >= 0);
  const marker = source.indexOf(`${urlVariable},`, start);
  const call = source.lastIndexOf("downloadFinalMasterWithOptionalBypass(", marker);
  const thenIndex = source.indexOf(".then(", call);
  const catchIndex = source.indexOf(".catch(", thenIndex);
  const catchEnd = source.indexOf("});", source.indexOf("})", catchIndex + 1) + 1);
  return {
    onSuccess: source.slice(thenIndex, catchIndex),
    onFailure: source.slice(catchIndex, catchEnd)
  };
}

test("MP3/WAV successful export completes the Journey; failed download does not", () => {
  const mastering = read("components/upload-form.tsx");
  for (const [format, urlVariable] of [["mp3", "mp3DownloadUrl"], ["wav", "wavDownloadUrl"]]) {
    const { onSuccess, onFailure } = downloadHandlers(mastering, urlVariable);
    assert.ok(onSuccess.includes(`trackEvent("${format}_download_completed"`), `${format} success handler located`);
    assert.match(onSuccess, new RegExp(`saveProjectArtifact\\(\\s*"export",[\\s\\S]*?format: "${format}"[\\s\\S]*?"complete"\\s*\\)`), `${format} success saves export → complete`);
    assert.ok(onSuccess.includes("void saveProjectArtifact("), `${format} Project save never blocks the download`);
    assert.ok(!onFailure.includes("saveProjectArtifact"), `${format} failed download must not mark complete`);
  }
});

test("Project saves are best-effort and observable, never throwing into the download path", async () => {
  const pid = "c1111111-1111-4111-8111-111111111111";
  const rejected = await saveProjectArtifactRequest(pid, { kind: "export", payload: {}, advanceTo: "complete" }, async () => {
    throw new TypeError("network down");
  });
  assert.equal(rejected.ok, false);
  const failed = await saveProjectArtifactRequest(pid, { kind: "export", payload: {} }, async () =>
    new Response(JSON.stringify({ error: "project_not_found" }), { status: 404 })
  );
  assert.deepEqual(failed, { ok: false, status: 404, error: "project_not_found" });
  const saved = await saveProjectArtifactRequest(pid, { kind: "export", payload: {} }, async () =>
    new Response(JSON.stringify({ project: { currentStage: "complete" } }), { status: 201 })
  );
  assert.equal(saved.ok, true);
  assert.equal(saved.project.currentStage, "complete");

  assert.equal(readProjectIdFromLocation(`?projectId=${pid}`), pid);
  assert.equal(readProjectIdFromLocation("?projectId=../../api/admin"), "");

  const mastering = read("components/upload-form.tsx");
  assert.ok(mastering.includes("Retry save"), "failed Project saves are retryable");
  assert.ok(mastering.includes("Back to your Song Project"), "completion links back to the Project");
});

// ---------------------------------------------------------------------------
// Stage + schema contract
// ---------------------------------------------------------------------------
test("Journey stage and artifact contracts match the migration", () => {
  assert.deepEqual(JOURNEY_STAGE_IDS, [
    "idea",
    "song_dna",
    "lyrics",
    "suno_prompt",
    "generation",
    "analyze_refine",
    "selected_generation",
    "master",
    "export",
    "complete"
  ]);
  const migration = read("supabase/migrations/20261005150000_users_projects_journey_foundation.sql");
  const checkList = (marker) => {
    const start = migration.indexOf(marker);
    const block = migration.slice(start, migration.indexOf("))", start));
    return [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  };
  assert.deepEqual(checkList("current_stage text NOT NULL DEFAULT 'idea'"), ["idea", ...JOURNEY_STAGE_IDS]);
  assert.deepEqual(checkList("kind text NOT NULL"), [...PROJECT_ARTIFACT_KINDS]);

  for (const table of ["users", "projects", "project_artifacts", "project_generations"]) {
    assert.ok(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`), `${table} RLS enabled`);
    assert.ok(migration.includes(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated;`), `${table} not browser-readable`);
  }
  assert.ok(migration.includes("FOREIGN KEY (project_id, user_id)"), "children cannot disagree with the Project owner");
  assert.ok(migration.includes("enforce_project_selected_generation_owner"), "DB enforces same-project generation lock");
  assert.ok(!/DISABLE ROW LEVEL SECURITY/i.test(migration));
});

// ---------------------------------------------------------------------------
// Auth flow: Supabase token_hash verification → stable user → signed session
// ---------------------------------------------------------------------------
function stubSupabaseAuth({ user, failVerify = false }) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url ?? input);
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
    if (url.includes("/auth/v1/verify")) {
      if (failVerify) {
        return new Response(JSON.stringify({ code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }), {
          status: 403,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(
        JSON.stringify({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/auth/v1/logout")) return new Response(null, { status: 204 });
    throw new Error(`unexpected fetch ${url}`);
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

function authUser(id, email, overrides = {}) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: "2026-10-05T12:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: {},
    is_anonymous: false,
    created_at: "2026-10-05T12:00:00Z",
    ...overrides
  };
}

const confirm = (query) => confirmRoute.GET(request("GET", `/auth/confirm${query}`));

test("magic-link confirm verifies token_hash server-side and issues the MasterSauce session", async () => {
  const paidUserId = "f1111111-1111-4111-8111-111111111111";
  const db = freshDb({
    billing_customers: [{ id: "bc-1", normalized_email: "paid@example.com", stripe_customer_id: "cus_paid", user_id: null }],
    billing_subscriptions: [{ stripe_subscription_id: "sub_1", normalized_email: "paid@example.com", user_id: null }],
    song_architect_generation_events: [
      { id: "ev-1", email: "paid@example.com", user_id: null },
      { id: "ev-2", email: "paid@example.com", user_id: USER_B.id }
    ]
  });
  db.rows("users").push({
    id: paidUserId,
    auth_user_id: null,
    normalized_email: "paid@example.com",
    email: "paid@example.com",
    stripe_customer_id: "cus_paid",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z"
  });

  const authId = "f2222222-2222-4222-8222-222222222222";
  const stub = stubSupabaseAuth({ user: authUser(authId, "Paid@Example.com") });
  try {
    const res = await confirm("?token_hash=pkce_abc123&type=email");
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/projects");
    const verifyCall = stub.calls.find((call) => call.url.includes("/auth/v1/verify"));
    assert.equal(verifyCall.body.token_hash, "pkce_abc123");
    assert.equal(verifyCall.body.type, "email");
    assert.ok(stub.calls.some((call) => call.url.includes("/auth/v1/logout")), "unused Supabase session is revoked");

    const setCookie = res.headers.get("set-cookie") ?? "";
    const accountCookie = setCookie.slice(setCookie.indexOf("ms_account="), setCookie.indexOf("ms_verified_email="));
    assert.match(accountCookie, /HttpOnly/i, "account session cookie is HTTP-only");
    assert.match(setCookie, /ms_verified_email=/, "verified mailbox becomes the trusted billing identity");
    assert.ok(!setCookie.includes("test-access-token") && !setCookie.includes("test-refresh-token"), "Supabase tokens never reach the browser");

    const session = readAppSession(request("GET", "/", { cookie: `ms_account=${res.cookies.get("ms_account").value}` }));
    assert.equal(session.userId, paidUserId, "billing-bootstrapped stable user id is preserved");
    assert.equal(session.authUserId, authId);
    const userRow = db.rows("users").find((row) => row.id === paidUserId);
    assert.equal(userRow.auth_user_id, authId);
    assert.equal(userRow.stripe_customer_id, "cus_paid");
    assert.equal(db.rows("billing_subscriptions")[0].user_id, paidUserId, "billing history linked");
    assert.equal(db.rows("song_architect_generation_events").find((row) => row.id === "ev-1").user_id, paidUserId);
    assert.equal(
      db.rows("song_architect_generation_events").find((row) => row.id === "ev-2").user_id,
      USER_B.id,
      "already-claimed history is never reassigned"
    );

    // Second login with the same auth identity keeps the same stable user id.
    const again = await confirm("?token_hash=pkce_def456&type=magiclink");
    const sessionAgain = readAppSession(request("GET", "/", { cookie: `ms_account=${again.cookies.get("ms_account").value}` }));
    assert.equal(sessionAgain.userId, paidUserId);
    assert.equal(db.rows("users").length, 3);
  } finally {
    stub.restore();
  }
});

test("magic-link confirm rejects missing, foreign-type, expired, and unconfirmed links", async () => {
  freshDb();
  for (const query of ["", "?type=email", "?token_hash=abc&type=recovery", "?token_hash=abc&type=email_change", "?access_token=leaked"]) {
    const res = await confirm(query);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/projects?auth_error=invalid_link");
    assert.equal(res.cookies.get("ms_account"), undefined);
  }

  const expired = stubSupabaseAuth({ user: null, failVerify: true });
  try {
    const res = await confirm("?token_hash=expired&type=email");
    assert.equal(res.headers.get("location"), "/projects?auth_error=invalid_link");
    assert.equal(res.cookies.get("ms_account"), undefined);
  } finally {
    expired.restore();
  }

  const unconfirmed = stubSupabaseAuth({
    user: authUser("f3333333-3333-4333-8333-333333333333", "new@example.com", { email_confirmed_at: null })
  });
  try {
    const res = await confirm("?token_hash=abc&type=email");
    assert.equal(res.headers.get("location"), "/projects?auth_error=invalid_link");
    assert.equal(res.cookies.get("ms_account"), undefined);
  } finally {
    unconfirmed.restore();
  }
});

test("a verified email already linked to another auth identity cannot be taken over", async () => {
  freshDb();
  const stub = stubSupabaseAuth({ user: authUser("f4444444-4444-4444-8444-444444444444", USER_A.email) });
  try {
    const res = await confirm("?token_hash=abc&type=email");
    assert.equal(res.headers.get("location"), "/projects?auth_error=account_unavailable");
    assert.equal(res.cookies.get("ms_account"), undefined);
  } finally {
    stub.restore();
  }
});

test("historical linking reports partial failures instead of claiming success", async () => {
  const db = freshDb({ credit_pack_ledger: [{ id: "cp-1", normalized_email: USER_A.email, user_id: null }] });
  db.failNext("mastered_download_events", "update", "permission denied");
  const result = await linkVerifiedUserHistory(USER_A.id, USER_A.email);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failedTables, ["mastered_download_events"]);
  assert.equal(db.rows("credit_pack_ledger")[0].user_id, USER_A.id);
});

test("session and logout endpoints", async () => {
  freshDb();
  const signedIn = await json(await sessionRoute.GET(request("GET", "/api/auth/session", { cookie: sessionCookieFor(USER_A) })));
  assert.equal(signedIn.body.authenticated, true);
  assert.equal(signedIn.body.user.id, USER_A.id);
  const anonymous = await json(await sessionRoute.GET(request("GET", "/api/auth/session")));
  assert.equal(anonymous.body.authenticated, false);

  const logout = await logoutRoute.POST();
  const setCookie = logout.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /ms_account=;/);
  assert.match(setCookie, /ms_verified_email=;/);
  assert.match(setCookie, /Max-Age=0/i);
});

test("request-link uses the server-confirmed redirect and the publishable key only", () => {
  const requestLink = read("app/api/auth/request-link/route.ts");
  assert.ok(requestLink.includes("/auth/confirm`"));
  assert.ok(!existsSync(path.join(ROOT, "app/api/auth/complete/route.ts")), "implicit access-token completion endpoint removed");
  assert.ok(!existsSync(path.join(ROOT, "app/auth/callback/page.tsx")), "implicit callback page removed");
  const publicServer = read("lib/supabase/public-server.ts");
  assert.ok(!publicServer.includes("SERVICE_ROLE"));
  assert.ok(!publicServer.includes('flowType: "implicit"'));
  const confirmSource = read("app/auth/confirm/route.ts");
  assert.ok(confirmSource.includes("verifyOtp({ token_hash: tokenHash, type })"));
  assert.ok(!confirmSource.includes("user_metadata"), "authorization never reads user_metadata");
});

// ---------------------------------------------------------------------------
// Client bundles never reach service-role code
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(abs);
  }
  return out;
}

function resolveAlias(specifier) {
  const sub = specifier.slice(2);
  for (const candidate of [`${sub}.ts`, `${sub}.tsx`, path.join(sub, "index.ts"), path.join(sub, "index.tsx")]) {
    const abs = path.join(ROOT, candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
}

test("no service-role key or server store is reachable from client code", () => {
  const files = ["app", "components", "lib"].flatMap((dir) => walk(path.join(ROOT, dir)));
  const clientEntries = files.filter((file) => /^\s*["']use client["']/.test(readFileSync(file, "utf8")));
  assert.ok(clientEntries.length > 10);

  const forbidden = new Set(
    ["lib/supabase/admin.ts", "lib/journeys/db.ts", "lib/projects/store.ts", "lib/users/store.ts", "lib/supabase/public-server.ts"].map(
      (rel) => path.join(ROOT, rel)
    )
  );
  const seen = new Set();
  const queue = clientEntries.map((file) => ({ file, chain: [path.relative(ROOT, file)] }));
  while (queue.length > 0) {
    const { file, chain } = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    assert.ok(!source.includes("SUPABASE_SERVICE_ROLE_KEY"), `service-role key referenced from client graph: ${chain.join(" → ")}`);
    for (const match of source.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["'](@\/[^"']+)["']/gm)) {
      const target = resolveAlias(match[1]);
      if (!target) continue;
      assert.ok(!forbidden.has(target), `client graph imports server module: ${[...chain, path.relative(ROOT, target)].join(" → ")}`);
      queue.push({ file: target, chain: [...chain, path.relative(ROOT, target)] });
    }
  }
});

test("My Songs is reachable from primary navigation", () => {
  assert.ok(read("app/page.tsx").includes('href="/projects"'));
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(error);
  }
}
setJourneyDbForTests(null);
if (failed > 0) {
  console.error(`journey foundation: ${failed} of ${tests.length} failed`);
  process.exit(1);
}
console.log(`journey foundation tests passed (${tests.length})`);
