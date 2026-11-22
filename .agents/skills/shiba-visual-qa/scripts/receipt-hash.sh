#!/usr/bin/env bash
# receipt-hash.sh — lightweight content-hash receipts for visual QA & code review.
# Prevents re-reviewing unchanged files and flags screenshots made stale by later edits.
#
# Usage:
#   bash .agents/skills/shiba-visual-qa/scripts/receipt-hash.sh hash <file>...
#   bash .agents/skills/shiba-visual-qa/scripts/receipt-hash.sh check <receipt-file> [<file>...]

set -u
export LC_ALL=C

hash_file() {
  if command -v git >/dev/null 2>&1; then
    git hash-object -- "$1" 2>/dev/null && return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 1 < "$1" 2>/dev/null | awk '{print $1}' && return 0
  fi
  if command -v sha1sum >/dev/null 2>&1; then
    sha1sum < "$1" 2>/dev/null | awk '{print $1}' && return 0
  fi
  return 1
}

norm_path() {
  printf '%s' "$1" | sed 's|\\|/|g; s|^\./||'
}

mode="${1:-}"
case "$mode" in
  hash)
    shift
    [ $# -ge 1 ] || { echo "receipt-hash: hash needs at least one file" >&2; exit 2; }
    rc=0
    for f in "$@"; do
      if [ ! -f "$f" ]; then
        echo "receipt-hash: missing file: $f" >&2
        rc=2
        continue
      fi
      h=$(hash_file "$f") || { echo "receipt-hash: cannot hash: $f" >&2; rc=2; continue; }
      printf 'Content-Hash: %s %s\n' "$(norm_path "$f")" "$h"
    done
    exit "$rc"
    ;;

  check)
    shift
    receipt="${1:-}"
    shift 2>/dev/null || true
    [ -n "$receipt" ] || { echo "receipt-hash: check needs a receipt file" >&2; exit 2; }
    if [ ! -s "$receipt" ]; then
      echo "RECEIPT: NONE"
      for f in "$@"; do
        [ -f "$f" ] && printf 'NEW: %s\n' "$(norm_path "$f")"
      done
      exit 0
    fi

    echo "RECEIPT: $(norm_path "$receipt")"
    compare_one() {
      local file="$1"
      local p
      p=$(norm_path "$file")
      local stored
      stored=$(grep -F "Content-Hash: $p " "$receipt" 2>/dev/null | tail -1 | awk '{ sub(/\r$/, ""); print $NF }')
      if [ ! -f "$file" ]; then
        [ -n "$stored" ] && printf 'GONE: %s\n' "$p"
        return
      fi
      if [ -z "$stored" ]; then
        printf 'NEW: %s\n' "$p"
        return
      fi
      local cur
      cur=$(hash_file "$file")
      if [ -n "$cur" ] && [ "$cur" = "$stored" ]; then
        printf 'UNCHANGED: %s\n' "$p"
      else
        printf 'CHANGED: %s\n' "$p"
      fi
    }

    seen=""
    if [ $# -gt 0 ]; then
      for f in "$@"; do
        p=$(norm_path "$f")
        case "$seen" in *"|$p|"*) continue ;; esac
        seen="$seen|$p|"
        compare_one "$f"
      done
    fi
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      case "$seen" in *"|$p|"*) continue ;; esac
      seen="$seen|$p|"
      compare_one "$p"
    done < <(sed -n 's/^Content-Hash: \(.*\) [^ ]*$/\1/p' "$receipt" | awk '!s[$0]++')
    exit 0
    ;;

  -h|--help|"")
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "receipt-hash: unknown mode '$mode' (use hash or check)" >&2
    exit 2
    ;;
esac
