# Smart Escape

Frontend-only evacuation route simulator (AI DevFest vibe-coding contest). Loads a building graph from JSON, lets you pick a start, toggle hazards, and shows the deterministic least-cost route to an open exit, in English and Bangla.

> Educational simulation only — not for real emergency use.

## Participant
- **Name:** TODO
- **Registration number:** TODO

## Live link
TODO: https://<user>.github.io/devfest-<reg>/

## How to run
- **Live:** open the link above (no login needed).
- **Locally:** `npm run serve` (or `python3 -m http.server 8000`), then open http://localhost:8000. Do not open `index.html` via `file://` — the sample auto-load needs a web server (upload still works).
- **Tests:** `npm test` (Node 18+, zero dependencies, `node:test`).

## Main features
- TODO: JSON validation with clear, path-specific errors (upload / drag-drop; `building.json` is the default)
- TODO: SVG map with node types, corridor costs, start selection
- TODO: Hazard toggles (block rooms/junctions/corridors, close exits) + Reset
- TODO: Deterministic routing (cost → exit ID → node-ID sequence)
- TODO: English / Bangla switch, route animation

## Bonus features
- TODO

## Known issues / assumptions
- TODO

## AI tools used
- Claude Code (Anthropic). Every prompt is logged in [`PROMPT.md`](PROMPT.md).

## Most useful prompt
TODO

## Screenshots
- `screenshots/baseline.png` — start R1, route R1 - C1 - C2 - E1, cost 7
- `screenshots/reroute-c2.png` — start R1, C2 blocked, route R1 - C1 - C3 - C4 - E2, cost 11

## License
MIT — see [`LICENSE`](LICENSE).
