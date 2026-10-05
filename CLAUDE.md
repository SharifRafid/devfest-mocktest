# CLAUDE.md — Smart Escape (AI DevFest vibe-coding contest, 90 min)

Source of truth: `PLAN.md` (module contracts, phases, checklists) and `EDGE_CASES.md` (validator rules, tie-break traps, test cases T1–T20). Read both before changing code.

## Contest rules (rulebook) — never violate
- **Frontend only.** Static files only: no backend, no serverless functions, no remote DB, no external API in the routing path.
- **Commit at least every 30 min, ≥3 commits total** (target 7–8). Never let 30 min pass without a pushed commit.
- **Every commit message** = first line "what changed" + body `Prompt: "<exact prompt>"` or `Manual edit`. Use `scripts/commit.sh` (it does this).
- **Never** `git push --force`, `git commit --amend` after a push, `git rebase`, or any history rewrite.
- **No secrets** anywhere (no API keys, tokens, `.env`), including in old commits.
- **Hard stop T+90. Final push by T+85.** No code, git or deploy changes after T+90.
- **Deployment must match the final commit.** Verify the live site after the last push.
- **Questions to organizers only T+0–T+15** (open questions listed in PLAN.md Phase 1).
- **README must contain all 9 items:** name, registration number, live HTTPS link, how to run, main features, bonus features, known issues, AI tools used, most useful prompt.
- Keep the **MIT `LICENSE`**. Commit `screenshots/baseline.png` (R1, cost 7) and `screenshots/reroute-c2.png` (R1 + C2 blocked, cost 11), taken from the live site.
- **Sample data only.** **Never hard-code sample routes, ids or costs** — judges use unseen graphs. Nothing may depend on `R1`, `E1`, etc.
- **Rulebook caveat:** before T+0 only README + LICENSE may be committed. On the real contest day, copy these setup files (CLAUDE.md, PLAN.md, EDGE_CASES.md, PROMPT.md, scripts/, tests/, package.json, .claude/) into the new public `devfest-<reg>` repo **only after T+0**.

## Stack rules
- Plain HTML + CSS + vanilla JS **ES modules**. No build step, no npm dependencies, no frameworks, no CDN JS.
- **Pure logic modules — no DOM, no fetch, no localStorage:** `js/validate.js`, `js/graph.js`, `js/router.js`, `js/geometry.js`, and `STRINGS`/`t()` in `js/i18n.js` (DOM helpers there guarded by `typeof document`). DOM lives only in `js/render.js` and `js/app.js`.
- Follow the exact exports/signatures in PLAN.md §2 — the tests import them.
- Load the default with **relative** `fetch('building.json', {cache:'no-cache'})` (never `/building.json`). **Upload + drag-drop must always work**, even if fetch fails or under `file://`.
- Render every dataset string with `textContent` / `createTextNode`. **Never `innerHTML` with data.**
- Use **`Map`/`Set` for all id lookups** (ids like `__proto__`, `constructor` must work). Never `obj[id]`.
- Validate fully before mutating app state. Invalid upload → show all errors (with paths, translated) and **keep the previous map**. Valid upload → replace graph, reset state from its `initial_state`, clear the start.

## Routing rules (spec §3.3 / §3.4)
- Cost = sum of edge costs. Never use coordinates or hop count as cost.
- Exclude blocked nodes **and all their incident edges**, blocked edges, and closed exits (as destinations **and** intermediates).
- A blocked corridor removes only that connection; its endpoints stay reachable via other routes.
- Choose the reachable open exit with **minimum cost**; tie → **lexicographically smallest exit ID**; tie → **lexicographically smallest node-ID sequence** to that exit.
- Every hazard change recomputes the route synchronously. **Reset** restores the supplied `initial_state` (fresh Sets from `graph.initial`) and keeps the start.

Implementation decisions (mandatory):
- **Dijkstra storing the full path per node** (`path: Map<id, string[]>`), never a predecessor tie-break. Relax when `nd < dist[v] || (nd === dist[v] && compareSeq(np, path[v]) < 0)`.
- **Compare by UTF-16 code unit** (`a < b ? -1 : a > b ? 1 : 0`), element-wise, shorter prefix first. **Never `localeCompare`, never compare `path.join(...)`**, no numeric/natural sort (`"R10" < "R2"`, `"E1" < "e1"`).
- **Exits are terminal**: never expand from any exit.
- Status order: `no_start` (null/unknown/exit start) → **`start_blocked` before `no_route`** → ok.
- Pick exit by **cost → exit ID → path** (exit id decided before comparing paths across exits).

## Exact UI strings (alone in the status element, no prefix, no trailing period)
| key | en | bn |
|---|---|---|
| status.no_route | No route available | কোনো পথ পাওয়া যায়নি |
| status.start_blocked | Starting location blocked | শুরুর স্থান অবরুদ্ধ |
| status.select_start | Select a starting location | একটি শুরুর স্থান নির্বাচন করুন |
| status.no_building | No building loaded — upload a JSON file | কোনো ভবন লোড হয়নি — একটি JSON ফাইল আপলোড করুন |

- Every UI string exists in **both `en` and `bn`** (tests enforce key parity and an `err.<code>` template for every validator code). Dataset labels are never translated.

## Workflow
1. Check PLAN.md for the current phase; work in its order. **If behind:** routing correctness > validation > map + start + hazards + reset > i18n > deploy/README/screenshots > animation > bonus. Deploy, README and screenshots are mandatory — cut polish, not those.
2. Consult EDGE_CASES.md before writing validator/router/UI logic.
3. **Run `npm test` before every commit**; never commit a red router/validator suite.
4. Commit + push with `scripts/commit.sh "<what changed>"` (uses the last logged prompt) or `scripts/commit.sh -m "<what changed>"` (Manual edit). Never raw `git commit` without the Prompt/Manual-edit body.
5. Tick the matching PLAN.md checkboxes in the same commit.
6. Prompts are auto-logged to `PROMPT.md` by the `UserPromptSubmit` hook (`scripts/log-prompt.sh`). Do not edit past entries. Prompts given to other AI tools: append manually (`pbpaste >> PROMPT.md`).
7. Local run: `npm run serve` → http://localhost:8000 (never open via `file://`).

## Deploy
- GitHub Pages (main, root) — enable once after the first push:
  `gh api -X POST repos/{owner}/{repo}/pages -f "source[branch]=main" -f "source[path]=/"`
- Verify deployed commit: `gh api repos/{owner}/{repo}/pages/builds/latest --jq .commit` == `git rev-parse HEAD`.
- Fallback if Pages is down/slow (not live by T+87): `netlify deploy --prod --dir .` or `vercel --prod`; submit that HTTPS link and put it in the README.
- `.nojekyll` must stay at the repo root.
