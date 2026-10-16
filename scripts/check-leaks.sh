#!/usr/bin/env bash
# Fails if any file contains something that shouldn't be public.
#
# Usage:
#   scripts/check-leaks.sh           # staged files (pre-commit hook)
#   scripts/check-leaks.sh --all     # every tracked file (CI)
#
# Generic patterns live here. Private patterns, such as employer names, live in
# .leak-patterns (gitignored), one extended regex per line, so the list itself
# never gets published.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

patterns=(
  '/(Users|home)/[A-Za-z0-9._-]+/'                                 # absolute home paths
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'                 # email addresses
  '(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})' # tokens and keys
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
allowed='users\.noreply\.github\.com|noreply@|example\.(com|org)'

if [[ -f .leak-patterns ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    patterns+=("$line")
  done < .leak-patterns
fi

if [[ "${1:-}" == "--all" ]]; then
  files=$(git ls-files)
  read_file() { cat -- "$1"; }
else
  files=$(git diff --cached --name-only --diff-filter=ACMR)
  read_file() { git show ":$1"; }
fi

status=0
for file in $files; do
  [[ "$file" == scripts/check-leaks.sh ]] && continue
  for pattern in "${patterns[@]}"; do
    hits=$(read_file "$file" | grep -nEi -e "$pattern" | grep -vEi -e "$allowed" || true)
    if [[ -n "$hits" ]]; then
      echo "Possible leak in $file (pattern: $pattern):"
      echo "$hits" | sed 's/^/  /'
      status=1
    fi
  done
done

if [[ $status -ne 0 ]]; then
  echo
  echo "Remove the matches above before committing. If one is a false positive, generalize the text rather than bypassing the check."
fi
exit $status
