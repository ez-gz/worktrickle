#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://codeload.github.com/ez-gz/worktrickle/tar.gz/refs/heads/main"
INSTALL_BASE="${HOME}/.claude/skills"
INSTALL_DIR="${INSTALL_BASE}/worktrickle"
SKILL_FILE="worktrickle/SKILL.md"

# Determine the directory this script lives in (works when sourced or piped)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)" || SCRIPT_DIR=""

# -------------------------------------------------------------------
# Helper: back up an existing install so re-running is always safe
# -------------------------------------------------------------------
backup_existing() {
    if [ -e "${INSTALL_DIR}" ] || [ -L "${INSTALL_DIR}" ]; then
        n=0
        while [ -e "${INSTALL_BASE}/worktrickle.bak.${n}" ] || [ -L "${INSTALL_BASE}/worktrickle.bak.${n}" ]; do
            n=$((n + 1))
        done
        mv "${INSTALL_DIR}" "${INSTALL_BASE}/worktrickle.bak.${n}"
        echo "worktrickle: backed up existing install to worktrickle.bak.${n}"
    fi
}

# -------------------------------------------------------------------
# Path A: running from a checkout that already has worktrickle/SKILL.md
# -------------------------------------------------------------------
if [ -n "${SCRIPT_DIR}" ] && [ -f "${SCRIPT_DIR}/worktrickle/SKILL.md" ]; then
    echo "worktrickle: local checkout detected — copying ${SCRIPT_DIR}/worktrickle"
    mkdir -p "${INSTALL_BASE}"
    backup_existing
    cp -r "${SCRIPT_DIR}/worktrickle" "${INSTALL_DIR}"
    echo "worktrickle: installed to ${INSTALL_DIR}"
    exit 0
fi

# -------------------------------------------------------------------
# Path B: curl-pipe install — download tarball and extract
# -------------------------------------------------------------------
echo "worktrickle: no local checkout found — downloading from GitHub"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

TARBALL="${TMP_DIR}/worktrickle.tar.gz"
echo "worktrickle: fetching ${REPO_URL}"
curl -fsSL "${REPO_URL}" -o "${TARBALL}"

echo "worktrickle: extracting"
tar -xzf "${TARBALL}" -C "${TMP_DIR}"

# The tarball root is ez-gz-worktrickle-<sha>/ or worktrickle-main/
EXTRACTED="$(find "${TMP_DIR}" -maxdepth 1 -mindepth 1 -type d | head -1)"
if [ -z "${EXTRACTED}" ]; then
    echo "worktrickle: ERROR — could not find extracted directory in ${TMP_DIR}" >&2
    exit 1
fi

if [ ! -f "${EXTRACTED}/worktrickle/SKILL.md" ]; then
    echo "worktrickle: ERROR — SKILL.md not found in extracted archive at ${EXTRACTED}/worktrickle/SKILL.md" >&2
    exit 1
fi

mkdir -p "${INSTALL_BASE}"
backup_existing
cp -r "${EXTRACTED}/worktrickle" "${INSTALL_DIR}"
echo "worktrickle: installed to ${INSTALL_DIR}"
