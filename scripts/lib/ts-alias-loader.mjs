/**
 * Node module resolution hook that maps the project's `@/*` TypeScript path
 * alias (see tsconfig.json paths) to files under the repo root, so `.mjs` test
 * scripts can import real `.ts` modules that use `@/...` value imports.
 *
 * Type stripping is handled natively by Node (>= 23.6). This hook only resolves
 * specifiers; it never transforms source. Test-only — not used by the app.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const sub = specifier.slice(2);
    const candidates = [sub, `${sub}.ts`, `${sub}.tsx`, path.join(sub, "index.ts")];
    for (const candidate of candidates) {
      const abs = path.join(ROOT, candidate);
      if (existsSync(abs)) {
        return nextResolve(pathToFileURL(abs).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
