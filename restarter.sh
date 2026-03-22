#!/bin/bash

set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_PORT_CANDIDATES="1337 1338 1339 1340 1341 1342"
PORT_CANDIDATES_RAW="${PORT_CANDIDATES:-$DEFAULT_PORT_CANDIDATES}"
FALLBACK_SEARCH_LIMIT="${FALLBACK_SEARCH_LIMIT:-20}"
AUTO_START_MEILISEARCH="${AUTO_START_MEILISEARCH:-1}"
MEILISEARCH_PORT="${MEILISEARCH_PORT:-7700}"
MEILISEARCH_HOST_DEFAULT="http://127.0.0.1:${MEILISEARCH_PORT}"
MEILISEARCH_HOST_EFFECTIVE="${MEILISEARCH_HOST:-$MEILISEARCH_HOST_DEFAULT}"
MEILISEARCH_CONTAINER_NAME="${MEILISEARCH_CONTAINER_NAME:-samplero-meilisearch-dev}"
MEILISEARCH_IMAGE="${MEILISEARCH_IMAGE:-getmeili/meilisearch:v1.12}"
MEILISEARCH_DATA_DIR="${MEILISEARCH_DATA_DIR:-$WORKSPACE_ROOT/.meilisearch-data}"
SELECTED_PORT=""

PORT_CANDIDATES=()

is_truthy() {
  case "${1:-0}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

append_unique_port() {
  local candidate="$1"
  local existing

  for existing in "${PORT_CANDIDATES[@]:-}"; do
    if [ "$existing" = "$candidate" ]; then
      return 0
    fi
  done

  PORT_CANDIDATES+=("$candidate")
}

get_listener_pid() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n 1
}

port_in_use() {
  [ -n "$(get_listener_pid "$1")" ]
}

wait_for_port() {
  local port="$1"
  local attempt

  for attempt in $(seq 1 40); do
    if port_in_use "$port"; then
      return 0
    fi
    sleep 0.25
  done

  return 1
}

is_local_meilisearch_host() {
  case "$MEILISEARCH_HOST_EFFECTIVE" in
    "http://127.0.0.1:${MEILISEARCH_PORT}"|"http://localhost:${MEILISEARCH_PORT}"|"https://127.0.0.1:${MEILISEARCH_PORT}"|"https://localhost:${MEILISEARCH_PORT}")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

ensure_meilisearch() {
  local docker_args

  if ! is_truthy "$AUTO_START_MEILISEARCH"; then
    echo "AUTO_START_MEILISEARCH=0 → skipping Meilisearch startup"
    return 0
  fi

  if ! is_local_meilisearch_host; then
    echo "MEILISEARCH_HOST points to remote host (${MEILISEARCH_HOST_EFFECTIVE}) → skipping local Meilisearch startup"
    return 0
  fi

  if port_in_use "$MEILISEARCH_PORT"; then
    echo "Meilisearch port ${MEILISEARCH_PORT} is already listening"
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not available, cannot auto-start local Meilisearch on ${MEILISEARCH_HOST_EFFECTIVE}" >&2
    return 0
  fi

  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "DRY_RUN=1 → would start Meilisearch container ${MEILISEARCH_CONTAINER_NAME} on ${MEILISEARCH_HOST_EFFECTIVE}"
    return 0
  fi

  mkdir -p "$MEILISEARCH_DATA_DIR"

  if docker ps -a --format '{{.Names}}' | grep -Fxq "$MEILISEARCH_CONTAINER_NAME"; then
    echo "Starting existing Meilisearch container ${MEILISEARCH_CONTAINER_NAME}"
    docker start "$MEILISEARCH_CONTAINER_NAME" >/dev/null
  else
    echo "Creating Meilisearch container ${MEILISEARCH_CONTAINER_NAME}"
    docker_args=(
      -d
      --name "$MEILISEARCH_CONTAINER_NAME"
      -p "127.0.0.1:${MEILISEARCH_PORT}:7700"
      -v "$MEILISEARCH_DATA_DIR:/meili_data"
      -e MEILI_NO_ANALYTICS=true
    )

    if [ -n "${MEILISEARCH_API_KEY:-}" ]; then
      docker_args+=( -e "MEILI_MASTER_KEY=${MEILISEARCH_API_KEY}" )
    fi

    docker run "${docker_args[@]}" "$MEILISEARCH_IMAGE" >/dev/null
  fi

  if wait_for_port "$MEILISEARCH_PORT"; then
    echo "Meilisearch is available at ${MEILISEARCH_HOST_EFFECTIVE}"
    return 0
  fi

  echo "Meilisearch container started but port ${MEILISEARCH_PORT} did not become ready in time" >&2
}

get_process_command() {
  local pid="$1"
  ps -o command= -p "$pid" 2>/dev/null || true
}

release_workspace_strapi_on_port() {
  local port="$1"
  local pid
  local cmd
  local attempt

  pid="$(get_listener_pid "$port")"
  if [ -z "$pid" ]; then
    return 1
  fi

  cmd="$(get_process_command "$pid")"

  case "$cmd" in
    *"$WORKSPACE_ROOT"*strapi*|*"$WORKSPACE_ROOT"*bun*develop*)
      echo "Port $port is occupied by workspace Strapi process $pid — restarting it cleanly"
      kill "$pid" 2>/dev/null || true

      for _ in $(seq 1 20); do
        sleep 0.25
        if ! port_in_use "$port"; then
          return 0
        fi
      done

      echo "Process $pid did not exit in time, forcing shutdown"
      kill -9 "$pid" 2>/dev/null || true
      sleep 0.5
      ! port_in_use "$port"
      return
      ;;
    *)
      return 1
      ;;
  esac
}

pick_port() {
  local candidate
  local base_port
  local upper_bound

  if [ -n "${PORT:-}" ]; then
    append_unique_port "$PORT"
  fi

  for candidate in ${PORT_CANDIDATES_RAW//,/ }; do
    append_unique_port "$candidate"
  done

  for candidate in "${PORT_CANDIDATES[@]}"; do
    if ! port_in_use "$candidate"; then
      SELECTED_PORT="$candidate"
      return 0
    fi

    if release_workspace_strapi_on_port "$candidate"; then
      SELECTED_PORT="$candidate"
      return 0
    fi

    echo "Port $candidate is busy with another process, trying next compatible port"
  done

  base_port="${PORT_CANDIDATES[0]}"
  upper_bound=$((base_port + FALLBACK_SEARCH_LIMIT))

  for candidate in $(seq $((base_port + 1)) "$upper_bound"); do
    if ! port_in_use "$candidate"; then
      SELECTED_PORT="$candidate"
      return 0
    fi
  done

  echo "Could not find a free compatible port in range ${base_port}-${upper_bound}" >&2
  exit 1
}

pick_port

ensure_meilisearch

echo "Selected Strapi port: $SELECTED_PORT"
echo "Strapi URL: http://localhost:$SELECTED_PORT"
echo "Customer app base URL: http://127.0.0.1:$SELECTED_PORT"
echo "Meilisearch URL: ${MEILISEARCH_HOST_EFFECTIVE}"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 → not starting Strapi"
  exit 0
fi

echo "Starting Strapi development server on port $SELECTED_PORT..."
exec env PORT="$SELECTED_PORT" MEILISEARCH_HOST="$MEILISEARCH_HOST_EFFECTIVE" bun run develop
