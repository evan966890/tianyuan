#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
TARGET_ROOT="$OPENCLAW_HOME/skills"

mkdir -p "$TARGET_ROOT"

install_dir() {
  local source_dir="$1"
  local target_name
  target_name="$(basename "$source_dir")"
  local target_dir="$TARGET_ROOT/$target_name"
  rm -rf "$target_dir"
  mkdir -p "$target_dir"
  cp -R "$source_dir"/. "$target_dir"/
  echo "installed: $target_name -> $target_dir"
}

install_dir "$REPO_ROOT/templates/skills/executive-profile-onboarding"

for skill_dir in "$REPO_ROOT"/skills/*; do
  if [ -d "$skill_dir" ]; then
    install_dir "$skill_dir"
  fi
done

for extra_dir in "$@"; do
  if [ -d "$extra_dir" ]; then
    install_dir "$extra_dir"
  else
    echo "skip: $extra_dir (not a directory)"
  fi
done

echo "done"
