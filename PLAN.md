# Smart Escape — 90-Minute Build Plan

> Static HTML/CSS/vanilla JS, no build step, no dependencies. Deploy: GitHub Pages (main, /root).
> Fallback: `netlify deploy --prod --dir .` or `vercel --prod`.
> Spec refs: §3.1 input, §3.2 tasks, §3.3 routing, §3.4 hazards, §4.1 sample checks,
> §4.2 animation/optional, §5 rules, §6 deliverables. Edge-case details: see `EDGE_CASES.md`.

## 0. Ground rules (read before T+0)
- [ ] Hard stop at **T+90**. Final push by **T+85**. Form submitted by T+88. No git or deploy changes after T+90.
- [ ] Commit at least every 30 min, at least 3 commits in total (target 7–8). Message = what changed + `Prompt: "<prompt>"` or `Manual edit`.
- [ ] No `--force`, no `--amend` after a push, no rebase. No secrets in the repo.
- [ ] The repo is named `devfest-<registration-number>` and is public, with an MIT LICENSE.
- [ ] Organizer questions are allowed only from T+0 to T+15 (list in Phase 1).
- [ ] **Priority if behind:** routing correctness > validation > map + start + hazards + reset > i18n > deploy/README/screenshots > animation > bonus. Deploy, README and screenshots are mandatory: never skip them, cut polish instead.

## 1. File layout
```
index.html            # shell, data-i18n attrs, classic file:// guard + <script type="module" src="js/app.js">
css/style.css         # layout, node/edge styles, states, animations, reduced-motion
js/validate.js        # PURE: parse + validate → error codes with paths
js/graph.js           # PURE: buildGraph, createState, cloneState, toggles
js/router.js          # PURE: compareSeq, findRoute
js/geometry.js        # PURE: fitToViewBox, midpoint
js/i18n.js            # STRINGS (pure) + t(); DOM helpers guarded
js/render.js          # DOM/SVG only
js/app.js             # wiring: load, upload, drag-drop, modes, update()
building.json         # default dataset (fetched by relative path)
tests/*.test.mjs      # node:test, zero dependencies
tests/helpers.mjs
scripts/commit.sh     # npm test + git add -A + commit with last prompt + push
scripts/log-prompt.sh # UserPromptSubmit hook → PROMPT.md
screenshots/baseline.png  screenshots/reroute-c2.png
README.md LICENSE CLAUDE.md PROMPT.md PLAN.md EDGE_CASES.md .gitignore .nojekyll
package.json          # {"type":"module","scripts":{"test":"node --test tests/*.test.mjs"}}
```
- `"type":"module"` lets Node import `js/*.js` as ESM; the browser ignores package.json.
- Prefer building fixtures in code (structuredClone of the sample plus a mutation) over many JSON files.

## 2. Module contracts (pure modules: no DOM, no fetch, no localStorage)

### js/validate.js
```js
stripBom(text) -> string
parseJsonText(text) -> {ok:true, value} | {ok:false, errors:[{code:'json_parse', path:'$', params:{message}}]}
validateBuilding(raw /* string | unknown */)
  -> { ok: boolean,
       errors:   Array<{code, path, params}>,   // ALL errors collected, e.g. path 'nodes[3].x'
       warnings: Array<{code, path, params}>,   // e.g. state_duplicate (deduped)
       data: null | { building, nodes:[{id,label,type,x,y}], edges:[{id,from,to,cost}],
                      initial_state:{blocked_nodes:[], blocked_edges:[], closed_exits:[]} } }
```
Rules (§3.1):
- Strip the BOM.
- Root must be a plain object (not null and not an array).
- `building` must be a non-empty string after trim.
- `nodes` must be an array of length 2–60; `edges` an array of length 1–150.
- Nodes:
  - `id`: non-empty string, unique, case-sensitive.
  - `label`: non-empty string.
  - `type`: exactly `room|junction|exit`.
  - `x`, `y`: `typeof === 'number' && Number.isFinite`.
- At least one room or junction, and at least one exit.
- Edges:
  - `id`: unique string.
  - `from`/`to`: existing node ids.
  - No self-loops.
  - No repeated unordered pair; key with `JSON.stringify([a,b].sort())`.
  - `cost`: `Number.isSafeInteger(c) && c > 0`.
- `initial_state`: an object with 3 arrays of strings, each entry the right kind:
  - `blocked_nodes` → room/junction;
  - `closed_exits` → exit;
  - `blocked_edges` → existing edge.
  - Dedupe repeated entries with a warning.
- Ignore extra fields.
- Use only `Map`/`Set` for id lookups (ids like `__proto__` must work).

Error codes (each needs an en+bn template in i18n.js): `json_parse, root_not_object, building_invalid, nodes_not_array, nodes_count, node_not_object, node_id_invalid, node_id_duplicate, node_label_invalid, node_type_invalid, node_coord_invalid, need_room_or_junction, need_exit, edges_not_array, edges_count, edge_not_object, edge_id_invalid, edge_id_duplicate, edge_endpoint_unknown, edge_self_loop, edge_pair_duplicate, edge_cost_invalid, initial_state_invalid, state_array_invalid, state_id_not_string, state_unknown_id, state_wrong_category`.

### js/graph.js
```js
buildGraph(data) -> { building, nodeIds:string[] /*file order*/, nodes:Map<id,Node>,
                      edgeIds:string[], edges:Map<id,Edge>,
                      adj:Map<id, Array<{to, edgeId, cost}>>,
                      initial:{blockedNodes:Set, blockedEdges:Set, closedExits:Set} }
createState(graph) -> State            // {blockedNodes, blockedEdges, closedExits}: fresh Sets copied from graph.initial
cloneState(state) -> State
toggleNode(graph, state, id) -> State   // room/junction only; returns NEW state
toggleEdge(state, id) -> State
toggleExit(graph, state, id) -> State   // exits only
```

### js/router.js
```js
compareSeq(a:string[], b:string[]) -> -1|0|1   // element-wise, code-unit (x<y), shorter prefix first
findRoute(graph, state, startId)
  -> { status:'ok'|'no_start'|'start_blocked'|'no_route',
       path:string[], exit:string|null, cost:number|null }
```
Algorithm (§3.3, §3.4):
1. If `startId` is null, unknown, or an exit → return `no_start`.
2. If `state.blockedNodes.has(startId)` → return `start_blocked`. **This check comes before the no-route check.**
3. Run O(V²) Dijkstra with `dist:Map` and `path:Map<id,string[]>` (the full path, not a predecessor).
   - Skip a neighbor when it is a blocked node, when the edge is blocked, or when it is a closed exit.
   - **Never expand from any exit.**
   - Relax when `nd < dist[v] || (nd === dist[v] && compareSeq(np, path[v]) < 0)`.
4. Among reachable open exits, take min cost, then min exit id (`<`, never `localeCompare`), then that exit's path. If none is reachable, return `no_route`.

### js/geometry.js
```js
fitToViewBox(nodes, {width:1000, height:600, pad:60}) -> Map<id,{x,y}>
  // uniform scale, centered; zero extent on an axis → center; negatives/huge ok; output always finite
midpoint(p, q) -> {x,y}
```

### js/i18n.js
```js
STRINGS = { en:{...}, bn:{...} }          // pure
t(key, params={}, lang) -> string          // {name} interpolation; falls back to en
formatError(err, lang) -> string           // `${path}: ${t('err.'+code, params)}`
// DOM-only (guarded by typeof document): getLang(), setLang(lang) [localStorage 'smartEscape.lang', try/catch], applyI18n(root)
```
Required exact strings:

| key | en | bn |
|---|---|---|
| status.no_route | No route available | কোনো পথ পাওয়া যায়নি |
| status.start_blocked | Starting location blocked | শুরুর স্থান অবরুদ্ধ |
| status.select_start | Select a starting location | একটি শুরুর স্থান নির্বাচন করুন |
| status.no_building | No building loaded — upload a JSON file | কোনো ভবন লোড হয়নি — একটি JSON ফাইল আপলোড করুন |
| err.file_protocol | Open via a local web server or the live site to auto-load the sample; upload still works. | স্বয়ংক্রিয়ভাবে নমুনা লোড করতে লোকাল সার্ভার বা লাইভ সাইট ব্যবহার করুন; আপলোড কাজ করবে। |

Other keys to provide in both languages:
- app title/subtitle, upload, load sample, reset, mode.select, mode.hazard, start label;
- route, exit, total cost;
- legend (room কক্ষ, junction সংযোগস্থল, exit বহির্গমন, blocked অবরুদ্ধ, closed exit বন্ধ বহির্গমন, blocked corridor অবরুদ্ধ করিডোর);
- panel headings, drop hint, instructions, disclaimer (educational simulation);
- upload rejected / loaded OK messages;
- every `err.*` code.

### js/render.js (DOM)
```js
renderMap(svg, graph, positions, state, route, {startId, mode, onNodeClick, onEdgeClick, animateRoute})
renderStartSelect(selectEl, graph, state, startId, lang)
renderHazardLists(container, graph, state, {onToggleNode, onToggleEdge, onToggleExit}, lang)
renderRoutePanel(el, route, lang)           // "R1 - C1 - C2 - E1", exit, total cost
renderErrors(el, errors, lang, max=12)      // "+N more"
```
**Every dataset string goes through `textContent`/`createTextNode`. Never use `innerHTML` with data.**

### js/app.js (state machine)
`store = {graph, positions, state, startId, mode:'select'|'hazard', lang, lastRouteKey}`

- `update()`: run `findRoute` synchronously, then render everything. Re-trigger the route animation only when `path.join('\u0000')` changes.
- `loadText(text, source)`: run `validateBuilding`.
  - Failure: show the errors and **keep the previous map and state**.
  - Success: swap in the new graph, `createState`, `startId=null`, then `update()`.

---

## 3. Timeline and checklists

### Phase 1 — T+0 → T+12: read, ask, scaffold, deploy the skeleton
- [ ] Read the problem fully.
- [ ] Ask the organizers by T+15 (planned answer in brackets):
  - [ ] Duplicate ids in `initial_state`: reject or dedupe? (dedupe + warn)
  - [ ] Is "lexicographic sequence" element-wise with code-unit order? (yes)
  - [ ] Can a blocked node be chosen as the start? (dropdown disables it; a start that becomes blocked shows the message)
  - [ ] Are string-typed numbers invalid? (yes)
- [ ] `index.html` skeleton:
  - [ ] header: title + EN/বাংলা toggle
  - [ ] toolbar: Upload, Load sample, Reset, mode toggle, start select
  - [ ] `<svg viewBox="0 0 1000 600">`
  - [ ] side panel, status bar, route panel, legend, error box
  - [ ] Noto Sans Bengali `<link>` with a fallback font stack
- [ ] **Classic** inline `<script>` guard: `if (location.protocol === 'file:')` → show the `err.file_protocol` text in both languages.
- [ ] Commit 1 + push → enable Pages: `gh api -X POST repos/{owner}/{repo}/pages -f "source[branch]=main" -f "source[path]=/"` (or Settings → Pages).
- [ ] Check `https://<user>.github.io/<repo>/` (the first build takes 1–2 min).

**Accept:** the skeleton page is in the repo and Pages is enabled.

### Phase 2 — T+12 → T+30: core logic + tests (§3.1, §3.3, §3.4, §4.1)
- [x] `validate.js` and `graph.js` per §2.
- [x] `router.js` per §2.
- [x] Router tests green:
  - [x] S1 baseline R1 → `R1,C1,C2,E1` cost 7
  - [x] S2 block C2 → `R1,C1,C3,C4,E2` cost 11 (beats the tied `R1,R2,C3,C4,E2`)
  - [x] S3 close E1+E2 → `no_route`
  - [x] S4 start R2 → `R2,C3,C4,E2` cost 7
  - [x] S5 R1 then block R1 → `start_blocked`
  - [x] T1 exit tie: E10 beats E2
  - [x] T2 predecessor trap → `S,A,Z,T`
  - [x] T3 exit id decided before the path → `S,B,E1`
  - [x] T4 cost, not hops
  - [x] T5 disconnected → `no_route`
  - [x] T6 block L03 → `R1,C1,C2,C4,E2` cost 10
  - [x] T7 closed exit as intermediate → `S,A,E2` cost 11
  - [x] T8 exits are terminal
  - [x] T10 unblock the start
  - [x] T11 reset restores a non-empty initial_state (deep clone)
  - [x] T12 start blocked in initial_state
  - [x] T13 all exits initially closed → reopen E1 → `R2,C3,C4,C2,E1` cost 10
  - [x] T14 E1 beats e1
  - [x] T15 R10 beats R2
  - [x] T16 a longer path wins when it is lex-smaller
  - [x] T17 start C3 → `C3,C4,E2` cost 5
  - [x] no_start for null, unknown or exit
- [x] Validate tests green:
  - [x] Valid inputs accepted: sample, sample with BOM, ids `__proto__`/`constructor`, extra fields.
  - [x] Bounds: 60/150 valid; 61 nodes, 151 edges, 0 edges, 1 node rejected.
  - [x] Full invalid-input list (EDGE_CASES.md §3).
  - [x] Multiple errors collected at once.
  - [x] Duplicate state ids deduped with a warning.
- [x] `npm test` green.
- [x] **Commit 2 by T+30.**

**Accept:** every §4.1 sample check and every §3.3 tie-break rule is proven in Node.

### Phase 3 — T+30 → T+45: map rendering + start selection (§3.2)
- [x] `geometry.js` + T20 tests: identical points, negative and huge coordinates.
- [x] `render.js` map, drawn in layers: edges → cost pills → route → nodes → labels.
  - [x] Edges: visible line plus a transparent hit line (`stroke-width:16; pointer-events:stroke`).
  - [x] Cost pills at edge midpoints.
  - [x] Node shapes: room = rounded square, junction = circle, exit = larger green shape.
  - [x] Labels: ID + label with a halo.
  - [x] Nodes: `tabindex=0`, `role=button`, `aria-label`, Enter/Space.
- [x] Boot with `fetch('building.json', {cache:'no-cache'})` (**relative path**). If it fails, show a message; upload still works.
- [x] Start `<select>` lists rooms and junctions only. Clicking a node in Select mode sets the start; exits are ignored with a hint.
- [x] Route panel: `R1 - C1 - C2 - E1`, exit `E1`, total cost `7`.
- [x] Status precedence: no_building → select_start → start_blocked → no_route → ok.
- [x] Start ring + thick route highlight.
- [x] Verify the live Pages URL.
- [x] **Commit 3 (~T+45)** + push.

**Accept:** nodes appear at the supplied coordinates with readable labels, distinct types and visible costs. Selecting R1 shows cost 7.

### Phase 4 — T+45 → T+55: hazards, reset, upload (§3.2, §3.4)
- [ ] Mode toggle (Select start / Toggle hazard). In hazard mode:
  - [ ] room/junction click → block/unblock
  - [ ] exit click → close/reopen
  - [ ] edge click → block/unblock (edge clicks toggle in both modes)
- [ ] Side checkbox lists, kept in sync with the map:
  - [ ] Blocked rooms/junctions
  - [ ] Blocked corridors (`L01 R1–C1 (2)`)
  - [ ] Closed exits
- [ ] Visual states:
  - [ ] Blocked node: red + ✕
  - [ ] Blocked edge: red dashed
  - [ ] Closed exit: gray + lock
  - [ ] Edges incident to a blocked node: dimmed
- [ ] Every change runs `update()` synchronously.
- [ ] Reset → `state = createState(graph)`; **keep the start**.
- [ ] Upload: file input + drag-drop + "Load sample". Reject files > 1 MB.
  - [ ] Valid upload: replaces the map, clears the start.
  - [ ] Invalid upload: translated errors with paths; the old map stays.
- [ ] Manually smoke-test all 5 §4.1 rows.
- [ ] **Commit 4 (~T+55)** + push.

**Accept:** every §4.1 row reproduces in the UI, and Reset restores `initial_state`.

### Phase 5 — T+55 → T+63: Bangla/English (§3.2, Rulebook 5.6)
- [ ] Fill in all of `STRINGS.bn`. `applyI18n` handles `data-i18n`, `data-i18n-aria` and `data-i18n-placeholder`.
- [ ] Re-render dynamic text on a language change and set `<html lang>`.
- [ ] Persist the language in localStorage (try/catch). Default to `en`.
- [ ] `tests/i18n.test.mjs` green:
  - [ ] en and bn have identical key sets.
  - [ ] Every `err.*` validator code has a template.
  - [ ] The 3 status strings are exact.
- [ ] **Commit 5 (~T+63)** + push.

### Phase 6 — T+63 → T+70: animation + polish (§4.2 required)
- [ ] Route draw: `pathLength="1"`, dashoffset 1→0 over **250 ms**, only when the route key changes.
- [ ] Start ring scale-in over 150 ms; hazard fill/stroke transition over 150–200 ms. Never block input; no flashing.
- [ ] `prefers-reduced-motion` → no animation.
- [ ] Legend complete. Panel stacks below 900 px. Disclaimer in the footer.
- [ ] **Commit 6 (~T+70)** + push.

### Phase 7 — T+70 → T+80: screenshots + README (§6, Rulebook 9.2/9.3)
- [ ] `screenshots/baseline.png` (R1, cost 7) and `screenshots/reroute-c2.png` (R1 with C2 blocked, cost 11), taken from the **live** site.
- [ ] README contents:
  - [ ] Name + registration number
  - [ ] Live HTTPS link
  - [ ] How to run: live link, `python3 -m http.server 8000`, `npm test`
  - [ ] Main features (mapped to §3.2)
  - [ ] Routing rules
  - [ ] Bonus features
  - [ ] Known issues/assumptions
  - [ ] AI tools (Claude Code)
  - [ ] Most useful prompt
  - [ ] MIT note
- [ ] **Commit 7 (~T+78)** + push.

### Phase 8 — T+80 → T+85: bonus (only if every core box is checked), then freeze
- [ ] At most one stretch item, timeboxed to 5 min.
- [ ] Run `npm test` again. Check `git status`; `git grep -iE "api[_-]?key|token|secret"` finds nothing.
- [ ] **Final commit and push by T+85.**

### Phase 9 — T+85 → T+90: verify + submit (no code changes)
- [ ] Open the live URL in an incognito Chrome window. Run all 5 §4.1 rows in EN and BN.
- [ ] `gh api repos/{o}/{r}/pages/builds/latest --jq .commit` == `git rev-parse HEAD`.
- [ ] If Pages isn't live by T+87, run `netlify deploy --prod --dir .` **before T+90** and submit that link.
- [ ] Submit the form: name, registration number, repo URL, final commit (7+ chars), live HTTPS link.
- [ ] Log out of all accounts.

---

## 4. Commit schedule
| # | ~Time | Message (first line) | Body |
|---|---|---|---|
| 1 | T+10 | Scaffold static app shell, docs and Pages config | `Prompt: "..."` |
| 2 | T+28 | Add JSON validator and deterministic Dijkstra router with node tests | `Prompt: "..."` |
| 3 | T+45 | Render SVG map with costs, node types and start selection | `Prompt: "..."` |
| 4 | T+55 | Add hazard toggles, reset, file upload and drag-drop | `Prompt: "..."` |
| 5 | T+63 | Add Bangla/English language switch for all UI text | `Prompt: "..."` |
| 6 | T+70 | Add route draw and hazard animations with reduced-motion support | `Prompt: "..."` |
| 7 | T+78 | Add README, screenshots of baseline and C2 reroute | `Manual edit` or prompt |
| 8 | T+85 | Final fixes / bonus | prompt or `Manual edit` |

`scripts/commit.sh "<summary>"` commits with the last logged prompt; `scripts/commit.sh -m "<summary>"` commits as `Manual edit`. **Never let 30 minutes pass between commits.**

## 5. Stretch / bonus (only after Phases 1–7 are all checked)
- [ ] High-contrast toggle (`body.hc`, saved to localStorage).
- [ ] PNG export: SVG → Image → canvas → `toBlob` → download (inline the computed styles first).
- [ ] Save progress: `{lang, startId, blocked sets, datasetHash}` in localStorage; restore only when the hash matches.
- [ ] Alternative routes: the best route to each other reachable exit, with its cost.
- [ ] Walkthrough: Prev/Next stepping that shows the running cost.

## 6. Final pre-submission checklist
- [ ] `npm test` green. No `console.error` on the live site.
- [ ] The live HTTPS URL opens without login, auto-loads the sample, and selecting R1 shows cost 7.
- [ ] All 5 §4.1 rows pass on the live site in EN and BN.
- [ ] Invalid upload → errors shown and the old map remains. Valid upload → start cleared.
- [ ] Reset restores `initial_state` and keeps the start.
- [ ] README has all 9 items. LICENSE is MIT. Both screenshots exist.
- [ ] No secrets. History not rewritten. ≥3 commits, each with a Prompt or Manual edit line.
- [ ] Final commit pushed before T+90. Deployed commit == HEAD. Form submitted.
