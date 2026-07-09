/**
 * Registers the `@/*` resolution hook (test-only). Use via:
 *   node --import ./scripts/lib/register-ts-alias.mjs <script>
 */
import { register } from "node:module";

register("./ts-alias-loader.mjs", import.meta.url);
