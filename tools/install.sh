#!/bin/sh

set -eu

PRLENSE_HOME="${PRLENSE_HOME:-$HOME/.prlense-cli}"
PRLENSE_REPO_URL="${PRLENSE_REPO_URL:-https://github.com/anvk/prlense.git}"
PRLENSE_BRANCH="${PRLENSE_BRANCH:-main}"

say() {
  printf "%s\n" "$1"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    say "Error: required command '$1' is not installed."
    exit 1
  fi
}

need_cmd git
need_cmd node
need_cmd npm

if [ -d "$PRLENSE_HOME/.git" ]; then
  say "Updating existing prlense checkout in $PRLENSE_HOME"
  # This checkout is managed: it is moved to whatever the branch points at, the same way
  # self-update does. Only edits made by hand are a reason to stop.
  if [ -n "$(git -C "$PRLENSE_HOME" status --porcelain --untracked-files=no)" ]; then
    say "Error: $PRLENSE_HOME has uncommitted changes."
    say "Commit or discard them (git -C $PRLENSE_HOME status), then rerun the installer."
    exit 1
  fi
  if ! git -C "$PRLENSE_HOME" fetch --depth 1 origin "$PRLENSE_BRANCH"; then
    say "Error: failed to fetch updates from $PRLENSE_REPO_URL"
    exit 1
  fi
  if ! git -C "$PRLENSE_HOME" checkout -q -B "$PRLENSE_BRANCH" FETCH_HEAD; then
    say "Error: failed to move the checkout to '$PRLENSE_BRANCH'."
    exit 1
  fi
elif [ -e "$PRLENSE_HOME" ]; then
  say "Error: $PRLENSE_HOME exists but is not a git repository."
  say "Move or remove it, then rerun installer."
  exit 1
else
  say "Cloning prlense into $PRLENSE_HOME"
  if ! git clone --depth 1 --branch "$PRLENSE_BRANCH" "$PRLENSE_REPO_URL" "$PRLENSE_HOME"; then
    say "Error: failed to clone $PRLENSE_REPO_URL"
    exit 1
  fi
fi

cd "$PRLENSE_HOME"
say "Installing dependencies"
# npm ci installs exactly the lockfile and never rewrites it, so the checkout stays clean
# and self-update can keep moving it.
npm ci

say "Building prlense"
npm run build

say "Linking prlense globally"
npm link

# Record where prlense actually lives, so it can tell a managed install from a developer's
# own npm-linked checkout without depending on PRLENSE_HOME being exported.
PRLENSE_STATE_DIR="$HOME/.prlense"
mkdir -p "$PRLENSE_STATE_DIR"
printf '{\n  "installDir": "%s"\n}\n' "$PRLENSE_HOME" > "$PRLENSE_STATE_DIR/install.json"

say ""
say "Done. Verify with: prlense doctor"
say "Installed at: $PRLENSE_HOME"
say ""
say "Without a config, prlense runs the model through your Claude Code login (claude -p)."
say "To use another model or provider, see Engines in https://github.com/anvk/prlense#engines"
