#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${TAURI_DEV_PORT:-1420}"
DRY_RUN="${DRY_RUN:-0}"
FORCE_KILL_FOREIGN="${FORCE_KILL_FOREIGN:-0}"
EXTRA_CARGO_CLEAN="${CARGO_CLEAN:-0}"

log() {
  printf '[restarter] %s\n' "$*"
}

is_truthy() {
  case "${1:-0}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

choose_runner() {
  if command -v bun >/dev/null 2>&1; then
    RUN_CMD=(bun run tauri dev)
  else
    RUN_CMD=(npm run tauri dev)
  fi
}

is_safe_workspace_process() {
  local command="$1"
  [[ "$command" == *"$APP_DIR"* ]] && return 0
  [[ "$command" == *"customer-tauri"* ]] && return 0
  [[ "$command" == *"node_modules/.bin/vite"* ]] && return 0
  [[ "$command" == *"npm run dev"* ]] && return 0
  [[ "$command" == *"tauri dev"* ]] && return 0
  [[ "$command" == *"cargo run --no-default-features"* ]] && return 0
  return 1
}

collect_port_pids() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk '!seen[$0]++'
}

stop_pid() {
  local pid="$1"
  local signal="${2:-TERM}"

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  if is_truthy "$DRY_RUN"; then
    log "DRY_RUN: would send SIG${signal} to pid ${pid}"
    return 0
  fi

  kill -"$signal" "$pid" 2>/dev/null || true
}

stop_port_conflicts() {
  local -a pids=()
  local pid command ppid parent_command

  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(collect_port_pids)

  if [[ ${#pids[@]} -eq 0 ]]; then
    log "Port ${PORT} is already free"
    return 0
  fi

  local -a safe_pids=()
  local -a foreign=()

  for pid in "${pids[@]}"; do
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if is_safe_workspace_process "$command"; then
      safe_pids+=("$pid")
    else
      foreign+=("${pid}:${command:-unknown}")
    fi

    ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    if [[ -n "$ppid" && "$ppid" != "1" ]]; then
      parent_command="$(ps -p "$ppid" -o command= 2>/dev/null || true)"
      if is_safe_workspace_process "$parent_command"; then
        safe_pids+=("$ppid")
      fi
    fi
  done

  if [[ ${#foreign[@]} -gt 0 ]] && ! is_truthy "$FORCE_KILL_FOREIGN"; then
    log "Port ${PORT} is occupied by a process that does not look like this workspace:"
    printf '  - %s\n' "${foreign[@]}"
    log "Refusing to kill it automatically. Re-run with FORCE_KILL_FOREIGN=1 if you really want that."
    exit 1
  fi

  if [[ ${#foreign[@]} -gt 0 ]] && is_truthy "$FORCE_KILL_FOREIGN"; then
    for pid in "${foreign[@]}"; do
      safe_pids+=("${pid%%:*}")
    done
  fi

  local -a unique_safe_pids=()
  for pid in "${safe_pids[@]}"; do
    [[ -n "$pid" ]] || continue
    case " ${unique_safe_pids[*]} " in
      *" ${pid} "*) ;;
      *)
      unique_safe_pids+=("$pid")
      ;;
    esac
  done

  if [[ ${#unique_safe_pids[@]} -eq 0 ]]; then
    log "Port ${PORT} is busy but there was nothing safe to stop automatically"
    exit 1
  fi

  log "Stopping stale Tauri/Vite processes on port ${PORT}: ${unique_safe_pids[*]}"
  for pid in "${unique_safe_pids[@]}"; do
    stop_pid "$pid" TERM
  done

  if is_truthy "$DRY_RUN"; then
    return 0
  fi

  sleep 2
  for pid in "${unique_safe_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      log "PID ${pid} survived SIGTERM; escalating to SIGKILL"
      stop_pid "$pid" KILL
    fi
  done

  local tries=10
  while [[ $tries -gt 0 ]]; do
    if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      log "Port ${PORT} is free"
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done

  log "Port ${PORT} is still busy after cleanup"
  exit 1
}

main() {
  cd "$APP_DIR"

  if [[ ! -d node_modules ]]; then
    log "Missing node_modules in ${APP_DIR}. Run 'bun install' first."
    exit 1
  fi

  choose_runner
  stop_port_conflicts

  if is_truthy "$EXTRA_CARGO_CLEAN"; then
    log "Running cargo clean before restart"
    if ! is_truthy "$DRY_RUN"; then
      (cd src-tauri && cargo clean)
    fi
  fi

  log "App dir: ${APP_DIR}"
  log "Dev URL: http://localhost:${PORT}"
  log "Command: ${RUN_CMD[*]}"

  if is_truthy "$DRY_RUN"; then
    log "DRY_RUN: done"
    exit 0
  fi

  exec "${RUN_CMD[@]}"
}

main "$@"