#!/usr/bin/env bash
# Claude Code UserPromptSubmit hook: append each prompt to PROMPT.md (rulebook §8.4)
# and save the raw prompt to .claude/last-prompt.txt for scripts/commit.sh.
# Must never fail the hook and must print nothing to stdout.
{
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  ROOT="${CLAUDE_PROJECT_DIR:-}"
  if [ -z "$ROOT" ] || [ ! -d "$ROOT" ]; then ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)"; fi

  JQ="$(command -v jq 2>/dev/null)"
  [ -z "$JQ" ] && [ -x /opt/homebrew/bin/jq ] && JQ=/opt/homebrew/bin/jq
  [ -z "$JQ" ] && exit 0

  INPUT="$(cat)"
  PROMPT="$(printf '%s' "$INPUT" | "$JQ" -r '.prompt // empty' 2>/dev/null)"
  # Skip empty / whitespace-only prompts
  [ -z "$(printf '%s' "$PROMPT" | tr -d '[:space:]')" ] && exit 0
  # Skip messages injected by subagents / background tasks (not typed by the user)
  case "$PROMPT" in
    "<agent-message"*|"<task-notification"*|*"[SYSTEM NOTIFICATION"*) exit 0 ;;
  esac

  STAMP="$(date '+%Y-%m-%d %H:%M')"
  printf '\n## %s\n\n%s\n' "$STAMP" "$PROMPT" >> "$ROOT/PROMPT.md"
  mkdir -p "$ROOT/.claude" && printf '%s' "$PROMPT" > "$ROOT/.claude/last-prompt.txt"
} >/dev/null 2>&1
exit 0
