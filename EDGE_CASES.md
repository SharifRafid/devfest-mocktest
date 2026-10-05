# Smart Escape — Edge Cases & Hidden-Test Analysis

Source: Smart_Escape_Problem_Statement.pdf, AI_DevFest_Vibe_Coding_Rulebook.pdf, building.json.

---

## 1. Validator checklist (spec §3.1)

Spec: "All fields required. Empty initial-state arrays valid. 2–60 nodes, 1–150 undirected edges, ≥1 room/junction and ≥1 exit. IDs case-sensitive. No self-loops or repeated node pairs. Initial-state IDs must exist and match category. Disconnected graphs valid. Reject malformed or inconsistent files clearly."

**Strategy:** Collect **all** errors, each with a path (e.g. `edges[3].cost must be a positive integer`), and show them in the current language. When an upload is rejected, keep the previous valid map and show a clear error banner.

### A. File / parse level
| # | Condition | Action |
|---|---|---|
| A1 | Empty file / whitespace only | Reject ("File is empty / invalid JSON") |
| A2 | `JSON.parse` throws | Reject and show the parser message |
| A3 | Leading UTF-8 BOM `﻿` | **Strip before parse** (otherwise Chrome's `JSON.parse` fails on a valid file) |
| A4 | Not a `.json` file | Set `accept=".json,application/json"` on the input, but always validate the content; don't reject on extension alone |
| A5 | Root not a plain object (array, null, number, string) | Reject |
| A6 | Literal `1e999` parses to `Infinity` | Caught by the finite checks below |

### B. Top-level fields
| # | Condition | Action |
|---|---|---|
| B1 | `building` missing, not a string, `""`, or whitespace only | Reject |
| B2 | `nodes` missing or not an array | Reject |
| B3 | `edges` missing or not an array | Reject |
| B4 | `initial_state` missing or not a plain object | Reject |
| B5 | Unknown extra fields (anywhere) | **Ignore**: "required" doesn't mean "exclusive" |

### C. Nodes
| # | Condition | Action |
|---|---|---|
| C1 | `nodes.length < 2` or `> 60` | Reject |
| C2 | Element is not a plain object | Reject |
| C3 | `id` missing, not a string, or `""` | Reject. Don't trim: `" R1"` ≠ `"R1"`. Numeric ids (`1`) → reject. |
| C4 | Duplicate node `id` (exact, case-sensitive: `R1` and `r1` are distinct and valid) | Reject |
| C5 | `label` missing, not a string, `""`, or whitespace only | Reject |
| C6 | `type` not exactly `"room"`, `"junction"` or `"exit"` (`"Exit"`, `"ROOM"` → reject) | Reject |
| C7 | `x`/`y` missing, `typeof !== "number"`, or `!Number.isFinite` (catches `"10"`, `null`, `true`, `Infinity`) | Reject |
| C8 | Negative, zero, decimal or huge finite coordinates | **Valid** |
| C9 | No room/junction, or no exit | Reject |

### D. Edges
| # | Condition | Action |
|---|---|---|
| D1 | `edges.length < 1` or `> 150` | Reject |
| D2 | Element not an object; `id` missing, not a string, or `""` | Reject |
| D3 | Duplicate edge `id` | Reject |
| D4 | `from`/`to` missing, not a string, or not an existing node id | Reject |
| D5 | `from === to` (self-loop) | Reject |
| D6 | Repeated pair, including the reverse (A-B and B-A); key = `JSON.stringify([a,b].sort())` | Reject |
| D7 | `cost`: not a number, not `Number.isSafeInteger`, or `<= 0` (rejects `"3"`, `0`, `-1`, `2.5`, `null`, `Infinity`, `1e20`) | Reject. Note `2.0` parses to `2` and is accepted. |
| D8 | Edge id equal to a node id | **Allow**: separate namespaces. Keep separate Maps and prefix DOM ids (`n-`/`e-`). |
| D9 | Edge between two exits; a node with no edges | Valid |

### E. `initial_state`
| # | Condition | Action |
|---|---|---|
| E1 | `blocked_nodes` / `blocked_edges` / `closed_exits` missing or not an array | Reject |
| E2 | Entry not a string | Reject |
| E3 | `blocked_nodes` entry unknown, or an **exit** | Reject (exits belong in `closed_exits`) |
| E4 | `closed_exits` entry unknown, or not an exit | Reject |
| E5 | `blocked_edges` entry not an edge id | Reject |
| E6 | Duplicate within one array | **Ambiguous.** Accept and dedupe with a Set (warning) |
| E7 | Empty arrays | Valid |

### F. Implementation traps
- **Use `Map`/`Set`, never plain objects, for id lookups.** Ids like `"constructor"`, `"toString"` and `"__proto__"` break `obj[id]` lookups.
- Render labels and ids with `textContent` or SVG text nodes, never `innerHTML`.
- Validate fully before mutating app state (validate, then swap atomically).

---

## 2. Routing algorithm

### Exclusions
- Remove blocked nodes and every edge incident to them, plus blocked edges.
- Closed exits are neither destinations nor pass-through nodes; remove them entirely.
- Open exits as intermediates **never matter, so treat every exit as terminal (don't expand from it).**
  - Proof: costs are positive integers. Any path S→…→Ea→…→Eb passes open exit Ea at a strictly smaller cost, so it is never the global minimum and never takes part in a tie.
- The start is always a room/junction. Exits must not be selectable as start.
- If the start is blocked, show "Starting location blocked" and don't run Dijkstra. **This check comes before the no-route check.**

### Tie-break chain (the order is mandatory)
1. Minimum total cost.
2. Lexicographically smallest **exit ID**, compared **before** paths. Comparing whole paths across exits is wrong (T3).
3. For that exit, the lexicographically smallest node-ID sequence.

### "Lexicographic" precisely
- **Strings:** compare by UTF-16 code unit: `a < b ? -1 : a > b ? 1 : 0`.
  - **Never use `localeCompare`** (locale and case-folding dependent; usually puts `"e1"` before `"E1"`). No numeric collation either.
  - So `"R10" < "R2"`, `"E10" < "E9"`, `"Z" < "a"` and `"E1" < "e1"`.
- **Sequences:** compare element by element; at the first difference the smaller string wins; if one is a prefix of the other, the shorter wins.
- **Don't compare `path.join("-")`.** Ids containing characters that sort below `-` break it.
- Ambiguity: "lexicographic" could mean natural sort. Code-unit order is the standard reading; confirm with the organizers in T+0..T+15.

### Why naive Dijkstra fails
- **Pred-id tie-break:** with S-A-Z-T and S-B-Y-T at equal cost, "smaller predecessor at T" picks Y (→ S-B-Y-T). The correct answer is S-A-Z-T.
- **`<=` vs `<` on relaxation** makes the result depend on insertion order. The sample's "block C2" case **already has a tie**: R1-C1-C3-C4-E2 = R1-R2-C3-C4-E2 = 11. Strict `<` gets it right by luck; `<=` picks R2, which is wrong.
- **Fewest-hops tie-break** is wrong (T16).
- **Global min over all exits by (cost, path)** is wrong (T3).

### Recommended approach (O(V²), V ≤ 60)
Single-source Dijkstra from the start.
- **State:** `dist[v]`, `path[v]` (an array of ids), `done[v]`.
- **Pop:** linear scan for the unsettled node with minimum `dist`.
- **Skip:** don't expand exits, blocked nodes or closed exits.
- **Relax u→v** (edge not blocked, v usable): `nd = dist[u]+c`, `np = path[u].concat(v)`. Update when `nd < dist[v]` **or** (`nd === dist[v]` and `cmpSeq(np, path[v]) < 0`).
- **Answer:** among open, reachable exits, take min `dist`, then min exit id (`<`). Return `path[exit]` and `dist[exit]`.

Why it is correct:
- **Optimal substructure under (cost, lex).** Take P, the lex-smallest min-cost path s→t, and P', its prefix ending at some v on P.
  - Suppose some min-cost Q to v were lex-smaller than P'. Both end at v and are simple, so neither is a prefix of the other, and they first differ inside both.
  - Then Q+suffix is lex-smaller than P at that same index, with the same cost.
  - If Q+suffix repeated a node, cutting out the cycle would make a strictly cheaper path (costs > 0), which is impossible. So Q+suffix is a simple, min-cost, lex-smaller path, contradicting the choice of P.
  - Therefore every prefix of the optimal path is itself (cost, lex)-optimal.
- **Dijkstra invariant.** With costs > 0, every predecessor on the optimal path has a strictly smaller `dist` and is settled first with its final (cost, path). Relaxing from it installs the optimum on v, and later relaxations can't beat it.

Safety net: a brute-force DFS over simple paths, used only as a dev-time cross-check on small graphs.

---

## 3. Sample checks, verified by hand

Graph: L01 R1-C1 2, L02 C1-C2 3, L03 C2-E1 2, L04 R1-R2 4, L05 R2-C3 2, L06 C3-C4 3, L07 C4-E2 2, L08 C1-C3 4, L09 C2-C4 3.

| Scenario | Computation | Expected |
|---|---|---|
| Select R1 | E1: R1-C1-C2-E1 = 2+3+2 = **7**; best E2 = 10 | R1-C1-C2-E1, 7 |
| R1, block C2 | E1 can only be reached through C2, so it's unreachable. E2: R1-C1-C3-C4-E2 = 11 and R1-R2-C3-C4-E2 = 11. **Tie**; `"C1" < "R2"` | R1-C1-C3-C4-E2, 11 |
| R1, close E1+E2 | No destination | No route available |
| Select R2 | E2: R2-C3-C4-E2 = **7**; best E1 = 10 | R2-C3-C4-E2, 7 |
| R1, then block R1 | Start blocked | Starting location blocked |

### Hidden-style tests
"Sample" means `building.json`. Custom graphs: node type is room unless marked (J) junction or (X) exit.

| # | Purpose | Graph / actions | Expected |
|---|---|---|---|
| T1 | Exit-id tie + R10/R2 trap | S; E2(X), E10(X); S-E2 5, S-E10 5 | **S - E10, 5** |
| T2 | Same exit, predecessor trap | S; A,B,Y,Z (J); T(X). S-B 1, B-Y 1, Y-T 1, S-A 1, A-Z 1, Z-T 1 (B side listed first) | **S - A - Z - T, 3** |
| T3 | Exit id before path lex | S; A,B (J); E1,E2 (X); S-A 1, A-E2 1, S-B 1, B-E1 1 | **S - B - E1, 2** |
| T4 | Cost, not hops or geometry | S; A,B (J); E1,E2 (X); S-E1 10, S-A 1, A-B 1, B-E2 1 | **S - A - B - E2, 3** |
| T5 | Disconnected | S; A (J); E1,E2 (X); S-A 1, E1-E2 1 | **No route available** (file is valid) |
| T6 | Blocked edge vs blocked node | Sample, R1, block edge L03 | **R1 - C1 - C2 - C4 - E2, 10** |
| T7 | Path through a closed exit | S; A (J); E1,E2 (X); S-E1 5, E1-E2 1, S-A 1, A-E2 10; close E1 | **S - A - E2, 11**; then also block A → No route available |
| T8 | Open exit is terminal | T7 graph, nothing closed | **S - E1, 5** |
| T9 | No start selected | Load sample, toggle hazards | No error; "Select a starting location" |
| T10 | Unblock the start | Sample, R1, block R1, then unblock it | Starting location blocked, then **R1-C1-C2-E1, 7** |
| T11 | Reset restores a non-empty original | Sample with `blocked_edges:["L03"]`. R1 → 10; unblock L03 → 7; block C4 → 7; **Reset** | **R1-C1-C2-C4-E2, 10** |
| T12 | Start blocked from the start | Sample with `blocked_nodes:["R1"]`. Select R1, then select R2 | Starting location blocked; then **R2-C3-C4-E2, 7** |
| T13 | All exits closed from the start | Sample with `closed_exits:["E1","E2"]`, R2. Then reopen E1 | No route available → **R2-C3-C4-C2-E1, 10** |
| T14 | Case-sensitive ids + localeCompare trap | s; E1(X), e1(X); edge L1 s-E1 3, edge l1 s-e1 3 | Valid; **s - E1, 3** |
| T15 | Lex trap inside the path | S; R2, R10; E(X); S-R2 1, R2-E 1, S-R10 1, R10-E 1 | **S - R10 - E, 2** |
| T16 | Longer path is lex-smaller | S; A,B,C (J); E(X); S-A 1, A-B 1, B-E 1, S-C 2, C-E 1 | **S - A - B - E, 3** |
| T17 | Junction as start | Sample, start C3 | **C3 - C4 - E2, 5** |
| T18 | Bounds | 60 nodes / 150 edges loads; 61 nodes, 151 edges, 0 edges or 1 node is rejected | Loads fast and stays readable |
| T19 | Load a new file mid-session | Sample, R1, block C2, upload the T1 file | Start cleared; hazards and Reset come from the new file |
| T20 | Coordinates | All nodes at x=y=0; negative coordinates; x up to 1e6 | Renders inside the viewport; no NaN |

### Invalid-input set (each needs a specific rejection message)
- Bad file shape: invalid JSON; empty file; root `[]`.
- Top level: `building:""`; `nodes` missing; only exits; no exits.
- Costs: `0`, `-1`, `2.5`, `"3"`.
- Coordinates: `x:"10"`, `x:null`, `x:1e999`.
- Node fields: `label:""`; `type:"Exit"`; duplicate node id.
- Edges: duplicate edge id; edge to `"Z9"`; self-loop; A-B plus B-A.
- `initial_state` category and reference errors: `blocked_nodes:["E1"]`; `closed_exits:["R1"]`; `blocked_edges:["C1"]`; `blocked_nodes:["X"]`.
- `initial_state` structure: `initial_state` missing; `blocked_edges` missing; `blocked_nodes:"R1"`.

---

## 4. UI and state pitfalls

### Status strings
| State | English (exact) | Bangla |
|---|---|---|
| No start | Select a starting location | একটি শুরুর স্থান নির্বাচন করুন |
| Start blocked (checked first) | `Starting location blocked` | শুরুর স্থান অবরুদ্ধ |
| No exit reachable | `No route available` | কোনো পথ পাওয়া যায়নি |
| Route found | `Route: R1 → C1 → C2 → E1 · Exit: E1 · Cost: 7` | পথ / প্রস্থান / মোট খরচ |
| File error | Invalid file: … | অবৈধ ফাইল: … |

Put each failure string alone in a status element, with no prefix and no trailing period.

### State model
- Keep it pure: `state = {data, original (deep clone), blocked:Set, blockedEdges:Set, closed:Set, start, lang}`. One `recompute()` runs on **every** change.
- Selecting a blocked node as the start: the dropdown disables blocked options. If the current start becomes blocked, keep it selected and show "Starting location blocked". Exits can never be the start.
- Avoid mode conflict: provide a mode toggle (Select start / Toggle hazard), **plus** a start `<select>`, **plus** checkbox lists for nodes, edges and exits.
- Edge clicks need a transparent ~14–16px stroke as the hit area.
- **Reset** rebuilds the Sets from a deep clone of the original `initial_state`, keeps the start, and recomputes.
- **New file** replaces the data and the original, clears the start, and recomputes.

### SVG layout
- Map coordinates manually into a fixed canvas (e.g. 1000×600 with padding): `scale = min(W/(maxX-minX||1), H/(maxY-minY||1))`, then center.
- Handle negative values and zero extent. If every point is identical, center them.
- y points down (the sample uses screen coordinates).
- Labels show the id and label with a white halo (`paint-order: stroke`). Costs sit on pills at edge midpoints.

### Visual states (each needs a color **and** a non-color cue)
- Shapes: room = rounded square; junction = circle; exit = larger green shape.
- Hazards: blocked node = red with an ✕; blocked edge = red dashed line; closed exit = gray with a lock.
- Route: thick highlight. Start: ring. Include a legend.

### Animation
- CSS transitions of 150–300 ms; draw the route with a stroke-dashoffset animation.
- Recompute synchronously and never gate it behind a `setTimeout`.
- No flashing. Respect `prefers-reduced-motion`.

### Loading and deployment
- `fetch("building.json")` must use a **relative** path. `/building.json` breaks on GitHub project pages.
- Under `file://`, module scripts and fetch both fail. Show a message from a classic inline script and tell the user to run `python3 -m http.server`.
- GitHub Pages paths are case-sensitive.
- Provide a "Load sample" button.

### Bangla
- Font: Noto Sans Bengali, falling back to Hind Siliguri, then system fonts.
- Switching language sets `<html lang="bn">` and stores the choice in localStorage.
- Translate every button, legend, status, error, instruction and empty state. Dataset labels stay unchanged.

---

## 5. Rulebook compliance risks

| Rule | Risk / action |
|---|---|
| New public repo `devfest-<reg>`; only README + LICENSE before T+0 (§8.1–8.2) | This mock repo already has PDFs committed before T+0. In the real contest, commit only README/LICENSE during setup. |
| Commit ≥ every 30 min, ≥3 total (§8.3) | Commit at about T+20, T+45, T+70 and T+85. Set a timer. |
| Message = what changed + AI prompt or "Manual edit" (§8.4) | `Add X\n\nPrompt: "<exact prompt>"` on every commit. |
| No history rewrite (§8.5) | No `--force`, no amend after a push, no rebase. |
| README (§9.3) | Name, reg no, HTTPS live link, how to run, main features, bonus features, known issues, AI tools, most useful prompt. |
| LICENSE | MIT; already present. |
| `screenshots/` | `baseline.png` (R1, 7) and `reroute-c2.png` (R1, C2 blocked, 11). |
| No secrets (§5.5, 5.8) | No API keys anywhere, including old commits. |
| Frontend only (§5.1) | Static files only. Routing must not depend on any external API. |
| Deployment matches final commit (§8.6, 10.2) | Enable Pages at the first commit. Verify the live site after the final push. |
| Hard stop at T+90 (§8.6) | Final push by ~T+85. T+90..T+95 is for the form only and costs −10 marks. |
| Questions only T+0..T+15 (§4.3) | Ask about lex order, duplicate `initial_state` entries and numeric-string coordinates. |
| No hard-coding (§4.1) | Judges use unseen graphs. Nothing may depend on the sample's ids. |
