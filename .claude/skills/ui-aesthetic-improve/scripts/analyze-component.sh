#!/usr/bin/env bash
# analyze-component.sh — Analyze a component file to identify what's safe to change (visual)
# vs what must be protected (logic).
#
# Usage: ./scripts/analyze-component.sh <file_path>
# Output: Structured analysis with visual/protected categories
#
# Example:
#   ./scripts/analyze-component.sh src/components/Header.tsx

set -euo pipefail

FILE="${1:?Usage: analyze-component.sh <file_path>}"

if [[ ! -f "$FILE" ]]; then
  echo "ERROR: File not found: $FILE" >&2
  exit 1
fi

EXT="${FILE##*.}"

# Framework detection
case "$EXT" in
  tsx) FRAMEWORK="react-tsx" ;;
  jsx) FRAMEWORK="react-jsx" ;;
  vue) FRAMEWORK="vue" ;;
  svelte) FRAMEWORK="svelte" ;;
  html|css|scss|less) FRAMEWORK="html-css" ;;
  *) FRAMEWORK="html-css" ;;
esac

TOTAL_LINES=$(wc -l < "$FILE")
FILE_CONTENT=$(cat "$FILE")

# Count protected patterns
EVENT_HANDLERS=$(grep -cE '(onClick|onSubmit|onChange|onKeyDown|onKeyUp|onFocus|onBlur|onMouse|onTouch|onScroll|onDrag|onInput|onLoad)' "$FILE" 2>/dev/null || true)
EVENT_HANDLERS=${EVENT_HANDLERS:-0}
EVENT_HANDLERS=$(echo "$EVENT_HANDLERS" | tr -d '[:space:]')

STATE_HOOKS=$(grep -cE '(useState|useEffect|useReducer|useContext|useMemo|useCallback|useRef|useLayoutEffect)' "$FILE" 2>/dev/null || true)
STATE_HOOKS=${STATE_HOOKS:-0}
STATE_HOOKS=$(echo "$STATE_HOOKS" | tr -d '[:space:]')

IMPORTS=$(grep -cE '^(import |export )' "$FILE" 2>/dev/null || true)
IMPORTS=${IMPORTS:-0}
IMPORTS=$(echo "$IMPORTS" | tr -d '[:space:]')

TYPES_INTERFACES=$(grep -cE '(interface |type .* = |extends |implements )' "$FILE" 2>/dev/null || true)
TYPES_INTERFACES=${TYPES_INTERFACES:-0}
TYPES_INTERFACES=$(echo "$TYPES_INTERFACES" | tr -d '[:space:]')

API_CALLS=$(grep -cE '(fetch\(|axios\.|useQuery|useMutation|useSWR|\.get\(|\.post\()' "$FILE" 2>/dev/null || true)
API_CALLS=${API_CALLS:-0}
API_CALLS=$(echo "$API_CALLS" | tr -d '[:space:]')

CONDITIONAL_RENDER=$(grep -cE '(\? .*:|&&|\|\||\.map\(|\.filter\(|\.reduce\()' "$FILE" 2>/dev/null || true)
CONDITIONAL_RENDER=${CONDITIONAL_RENDER:-0}
CONDITIONAL_RENDER=$(echo "$CONDITIONAL_RENDER" | tr -d '[:space:]')

# Count visual patterns
INLINE_STYLES=$(grep -cE 'style="' "$FILE" 2>/dev/null || true)
INLINE_STYLES=${INLINE_STYLES:-0}
INLINE_STYLES=$(echo "$INLINE_STYLES" | tr -d '[:space:]')

CLASSNAMES=$(grep -cE 'className=' "$FILE" 2>/dev/null || true)
CLASSNAMES=${CLASSNAMES:-0}
CLASSNAMES=$(echo "$CLASSNAMES" | tr -d '[:space:]')

CSS_IMPORTS=$(grep -cE "(from ['\"].*\.(css|scss|less))" "$FILE" 2>/dev/null || true)
CSS_IMPORTS=${CSS_IMPORTS:-0}
CSS_IMPORTS=$(echo "$CSS_IMPORTS" | tr -d '[:space:]')

THREE_PARTY_STYLES=$(grep -cE '(styled\.|css=`|tw=`|@apply)' "$FILE" 2>/dev/null || true)
THREE_PARTY_STYLES=${THREE_PARTY_STYLES:-0}
THREE_PARTY_STYLES=$(echo "$THREE_PARTY_STYLES" | tr -d '[:space:]')

# Output structured analysis
cat <<EOF
=== Component Analysis: $FILE ===
Framework: $FRAMEWORK
Total lines: $TOTAL_LINES

--- PROTECTED (DO NOT MODIFY) ---
Event handlers: $EVENT_HANDLERS occurrences
State hooks:     $STATE_HOOKS occurrences
Imports/Exports: $IMPORTS lines
Types/Interfaces: $TYPES_INTERFACES definitions
API/Data calls:  $API_CALLS occurrences
Conditional render: $CONDITIONAL_RENDER patterns

--- VISUAL (SAFE TO CHANGE) ---
Inline styles:   $INLINE_STYLES instances
ClassNames:      $CLASSNAMES instances
CSS imports:     $CSS_IMPORTS files
Styled-components: $THREE_PARTY_STYLES usages

--- RECOMMENDATION ---
EOF

# Determine if file is safe to improve
if [[ "$EVENT_HANDLERS" -gt 0 || "$STATE_HOOKS" -gt 0 ]]; then
  echo "⚠️  This component has logic. Be careful to only change visual aspects."
  echo "   Protect: event handlers, state, imports, types"
  echo "   Change: className, style, layout, colors, spacing, typography"
else
  echo "✓  This appears to be a pure visual component. Safe to modify freely."
fi

# List specific protected lines
if [[ "$EVENT_HANDLERS" -gt 0 ]]; then
  echo ""
  echo "Protected event handler lines:"
  grep -nE '(onClick|onSubmit|onChange|onKeyDown|onFocus|onBlur)' "$FILE" | head -10
fi

if [[ "$STATE_HOOKS" -gt 0 ]]; then
  echo ""
  echo "Protected state hook lines:"
  grep -nE '(useState|useEffect|useReducer|useContext)' "$FILE" | head -10
fi

echo ""
echo "--- PROMPT CONSTRUCTION ---"
echo "When calling improve_ui, include this constraint:"
echo ""
echo "PROTECTED ZONE — DO NOT MODIFY:"
[[ "$EVENT_HANDLERS" -gt 0 ]] && echo "- Event handlers (found $EVENT_HANDLERS occurrences)"
[[ "$STATE_HOOKS" -gt 0 ]] && echo "- State management hooks (found $STATE_HOOKS occurrences)"
[[ "$IMPORTS" -gt 0 ]] && echo "- Imports/exports ($IMPORTS lines)"
[[ "$TYPES_INTERFACES" -gt 0 ]] && echo "- TypeScript types/interfaces ($TYPES_INTERFACES definitions)"
[[ "$API_CALLS" -gt 0 ]] && echo "- API/data calls ($API_CALLS occurrences)"
echo ""
echo "ONLY MODIFY:"
echo "- className attributes ($CLASSNAMES instances)"
echo "- style attributes ($INLINE_STYLES instances)"
echo "- Layout structure (divs, spans, flex/grid containers)"
echo "- Colors, spacing, typography, shadows, borders"
echo "- Hover/focus/active states"
echo "- Responsive breakpoints"
