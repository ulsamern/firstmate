#!/usr/bin/env bash
# run-only.sh <suite> <call>...: run selected top-level test calls of a suite.
suite=$1; shift
dir=$(dirname "$suite"); tmp="$dir/.tmp-only-$(basename "$suite")"
grep -Ev '^test_[A-Za-z0-9_]+( .*)?$' "$suite" | grep -v '^exit 0$' > "$tmp"
for c in "$@"; do printf '%s\n' "$c" >> "$tmp"; done
bash "$tmp"; rc=$?
rm -f "$tmp"; exit $rc
