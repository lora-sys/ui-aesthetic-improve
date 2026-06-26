#!/usr/bin/env bash
# review-diff.sh — Validate that improved code hasn't broken logic
#
# Usage: ./scripts/review-diff.sh <original_file> <improved_file>
# Exit 0 = safe to merge, Exit 1 = problems found
#
# Checks:
#   1. All imports/exports preserved
#   2. All function signatures unchanged
#   3. All event handlers preserved
#   4. All state hooks preserved
#   5. No new dependencies added
#   6. No TypeScript type changes

set -euo pipefail

ORIGINAL="${1:?Usage: review-diff.sh <original_file> <improved_file>}"
IMPROVED="${2:?Usage: review-diff.sh <original_file> <improved_file>}"

if [[ ! -f "$ORIGINAL" ]]; then
  echo "ERROR: Original file not found: $ORIGINAL" >&2
  exit 1
fi

if [[ ! -f "$IMPROVED" ]]; then
  echo "ERROR: Improved file not found: $IMPROVED" >&2
  exit 1
fi

ERRORS=0
WARNINGS=0

echo "=== Diff Review: $(basename "$ORIGINAL") ==="
echo ""

# 1. Compare imports
echo "1. Checking imports/exports..."
ORIG_IMPORTS=$(grep -E '^(import |export )' "$ORIGINAL" 2>/dev/null | sort || true)
IMP_IMPORTS=$(grep -E '^(import |export )' "$IMPROVED" 2>/dev/null | sort || true)

if [[ "$ORIG_IMPORTS" != "$IMP_IMPORTS" ]]; then
  echo "   ⚠️  IMPORTS CHANGED"
  DIFF_IMPORTS=$(diff <(echo "$ORIG_IMPORTS") <(echo "$IMP_IMPORTS") 2>/dev/null || true)
  if [[ -n "$DIFF_IMPORTS" ]]; then
    echo "   $DIFF_IMPORTS"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "   ✓ Imports unchanged"
fi

# 2. Check function signatures
echo "2. Checking function signatures..."
ORIG_FUNCS=$(grep -oE '(function [a-zA-Z_][a-zA-Z0-9_]*|const [a-zA-Z_][a-zA-Z0-9_]* = |export (default )?function|export const [a-zA-Z_][a-zA-Z0-9_]*)' "$ORIGINAL" 2>/dev/null | sort || true)
IMP_FUNCS=$(grep -oE '(function [a-zA-Z_][a-zA-Z0-9_]*|const [a-zA-Z_][a-zA-Z0-9_]* = |export (default )?function|export const [a-zA-Z_][a-zA-Z0-9_]*)' "$IMPROVED" 2>/dev/null | sort || true)

if [[ "$ORIG_FUNCS" != "$IMP_FUNCS" ]]; then
  echo "   ⚠️  FUNCTION SIGNATURES CHANGED"
  DIFF_FUNCS=$(diff <(echo "$ORIG_FUNCS") <(echo "$IMP_FUNCS") 2>/dev/null || true)
  if [[ -n "$DIFF_FUNCS" ]]; then
    echo "   $DIFF_FUNCS"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "   ✓ Function signatures unchanged"
fi

# 3. Check event handlers
echo "3. Checking event handlers..."
ORIG_EVENTS=$(grep -oE '(on[A-Z][a-zA-Z]+)' "$ORIGINAL" 2>/dev/null | sort -u || true)
IMP_EVENTS=$(grep -oE '(on[A-Z][a-zA-Z]+)' "$IMPROVED" 2>/dev/null | sort -u || true)

if [[ "$ORIG_EVENTS" != "$IMP_EVENTS" ]]; then
  echo "   ⚠️  EVENT HANDLERS CHANGED"
  # Show what was added/removed
  REMOVED_EVENTS=$(comm -23 <(echo "$ORIG_EVENTS") <(echo "$IMP_EVENTS") 2>/dev/null || true)
  ADDED_EVENTS=$(comm -13 <(echo "$ORIG_EVENTS") <(echo "$IMP_EVENTS") 2>/dev/null || true)
  if [[ -n "$REMOVED_EVENTS" ]]; then
    echo "   Removed: $REMOVED_EVENTS"
    ERRORS=$((ERRORS + 1))
  fi
  if [[ -n "$ADDED_EVENTS" ]]; then
    echo "   Added: $ADDED_EVENTS (warning, not necessarily an error)"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "   ✓ Event handlers preserved"
fi

# 4. Check state hooks
echo "4. Checking state hooks..."
ORIG_STATE=$(grep -oE '(useState|useEffect|useReducer|useContext|useMemo|useCallback|useRef)' "$ORIGINAL" 2>/dev/null | sort || true)
IMP_STATE=$(grep -oE '(useState|useEffect|useReducer|useContext|useMemo|useCallback|useRef)' "$IMPROVED" 2>/dev/null | sort || true)

if [[ "$ORIG_STATE" != "$IMP_STATE" ]]; then
  echo "   ⚠️  STATE HOOKS CHANGED"
  ERRORS=$((ERRORS + 1))
else
  echo "   ✓ State hooks preserved"
fi

# 5. Check TypeScript types
echo "5. Checking TypeScript types..."
ORIG_TYPES=$(grep -E '(interface |type .* = |extends |implements )' "$ORIGINAL" 2>/dev/null | sort || true)
IMP_TYPES=$(grep -E '(interface |type .* = |extends |implements )' "$IMPROVED" 2>/dev/null | sort || true)

if [[ "$ORIG_TYPES" != "$IMP_TYPES" ]]; then
  echo "   ⚠️  TYPES/INTERFACES CHANGED"
  ERRORS=$((ERRORS + 1))
else
  echo "   ✓ Types unchanged"
fi

# 6. Line count delta
echo "6. Line count delta..."
ORIG_LINES=$(wc -l < "$ORIGINAL")
IMP_LINES=$(wc -l < "$IMPROVED")
DELTA=$((IMP_LINES - ORIG_LINES))
if [[ $DELTA -gt 0 ]]; then
  echo "   +$DELTA lines (mostly visual additions)"
elif [[ $DELTA -lt 0 ]]; then
  echo "   $DELTA lines (some visual code removed)"
else
  echo "   No line count change"
fi

# Summary
echo ""
echo "=== Review Result ==="
if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
  echo "✅ SAFE TO MERGE — No logic changes detected"
  exit 0
elif [[ $ERRORS -gt 0 ]]; then
  echo "❌ REJECT — $ERRORS logic change(s) detected"
  echo "   Review the changes above and do NOT apply them."
  exit 1
else
  echo "⚠️  ACCEPT WITH WARNINGS — $WARNINGS non-critical change(s)"
  echo "   No logic broken, but some additions were made."
  exit 0
fi
