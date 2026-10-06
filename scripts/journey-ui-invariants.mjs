import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const projectsPage = readFileSync("app/projects/page.tsx", "utf8");
const projectDetail = readFileSync("app/projects/[projectId]/page.tsx", "utf8");
const home = readFileSync("app/page.tsx", "utf8");

assert.match(home, />\s*Journeys\s*<\/Link>/, "Home nav exposes Journeys");
assert.match(home, /id="song-journeys"/, "Homepage visibly features Song Journeys");
assert.match(home, /Start a Song Journey/, "Homepage offers a primary Journey CTA");
assert.match(home, /One song\. One Journey\. Every MasterSauce tool connected\./, "Homepage explains the Journey product");
assert.match(home, /JOURNEY_PREVIEW_STEPS/, "Homepage previews the Journey stages");
assert.match(projectsPage, />\s*Song Journeys\s*</, "Projects landing is visibly branded Song Journeys");
assert.match(projectsPage, /Start New Journey/, "Primary CTA starts a Journey");
assert.match(projectsPage, /Step \$\{journeyStep\} of \$\{journeyStepCount\}/, "Journey cards expose step position");
assert.match(projectsPage, /journeyProgress/, "Journey cards expose visual progress");
assert.match(projectDetail, /Song Journey · Step/, "Project detail identifies itself as a Song Journey");
assert.match(projectDetail, /Your Song Journey/, "Project detail labels the Journey progress rail");
assert.match(projectDetail, /← Song Journeys/, "Project detail returns to Song Journeys");

console.log("journey UI invariants passed");
