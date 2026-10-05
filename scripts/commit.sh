#!/usr/bin/env bash
# Commit + push with a rulebook-compliant message (§8.4).
# Usage:
#   scripts/commit.sh "summary"                 # body: Prompt: "<.claude/last-prompt.txt>"
#   scripts/commit.sh -m "summary"              # body: Manual edit
#   scripts/commit.sh -p "custom prompt" "summary"
#   add --no-test to skip npm test
# Never uses --force or --amend.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MANUAL=0; CUSTOM=""; RUN_TESTS=1; SUMMARY=""
while [ $# -gt 0 ]; do
  case "$1" in
    -m) MANUAL=1; shift; [ $# -gt 0 ] && { SUMMARY="$1"; shift; } ;;
    -p) shift; [ $# -gt 0 ] || { echo "error: -p needs a prompt" >&2; exit 1; }; CUSTOM="$1"; shift ;;
    --no-test) RUN_TESTS=0; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) SUMMARY="$1"; shift ;;
  esac
done

if [ -z "$(printf '%s' "$SUMMARY" | tr -d '[:space:]')" ]; then
  echo "error: commit summary is empty. Usage: scripts/commit.sh [-m] [-p \"prompt\"] [--no-test] \"summary\"" >&2
  exit 1
fi

if [ "$MANUAL" -eq 1 ]; then
  BODY="Manual edit"
else
  if [ -n "$CUSTOM" ]; then
    PROMPT="$CUSTOM"
  elif [ -s .claude/last-prompt.txt ]; then
    PROMPT="$(cat .claude/last-prompt.txt)"
  else
    echo "error: no .claude/last-prompt.txt; use -p \"prompt\" or -m for Manual edit" >&2
    exit 1
  fi
  PROMPT="${PROMPT//\"/\\\"}"
  BODY="Prompt: \"$PROMPT\""
fi

if [ "$RUN_TESTS" -eq 1 ] && [ -f js/router.js ]; then
  echo "Running npm test..."
  if ! npm test; then
    echo "error: tests failed; commit aborted (use --no-test to override)" >&2
    exit 1
  fi
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit." >&2
  exit 1
fi
git commit -m "$SUMMARY" -m "$BODY"
git push || git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
echo "Committed $(git rev-parse --short HEAD)"
