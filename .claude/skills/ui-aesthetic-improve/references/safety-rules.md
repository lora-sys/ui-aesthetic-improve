# Safety Rules — Protected Patterns

When delegating UI improvements to Gemini via `ui-aesthetics-mcp`, these patterns MUST NEVER be modified.

## Protected (DO NOT MODIFY)

### Event Handlers
Any handler prop or callback:
```
onClick, onSubmit, onChange, onKeyDown, onKeyUp, onKeyPress
onFocus, onBlur, onMouseEnter, onMouseLeave, onMouseDown, onMouseUp
onTouchStart, onTouchEnd, onTouchMove
onScroll, onDrag, onDrop, onPaste, onCut
onLoad, onError, onResize
```

### State Management
```
useState, useEffect, useReducer, useContext
useMemo, useCallback, useRef, useLayoutEffect
useState, setState, dispatch, action
```

### Imports / Exports
```
import ... from ...
export default ...
export const ...
export function ...
export interface ...
export type ...
```

### TypeScript Types
```
interface ..., type ..., extends ..., implements ...
Props interface, Component props, type definitions
```

### API / Data Calls
```
fetch(...), axios.get/post, useQuery, useMutation, useSWR
localStorage, sessionStorage, cookies
```

### Conditional Rendering
```
&&, ||, ternary (? :)
.map(), .filter(), .reduce(), .find()
if/else blocks controlling what renders
```

### Component Structure
```
Component name / export name
Prop interface / PropTypes
Parent-child relationships
Render tree structure (which components render where)
```

## Safe to Modify (VISUAL ONLY)

- `className` attribute values
- `style` attribute values (inline styles)
- CSS classes, CSS variables, CSS custom properties
- Layout structure within reason (div → section, padding/margin values)
- Colors, spacing, typography, shadows, borders, gradients
- Hover, focus, active, disabled visual states
- Responsive breakpoints and media queries
- Animation duration, easing, transform values
- Visual text content (copy, headings, labels — NOT logic-dependent text)
- Accessibility attributes that affect visuals (aria-label for screen readers is fine)

## Golden Rule

If it affects **behavior, data flow, or component API** → PROTECTED.
If it affects **appearance only** → SAFE TO MODIFY.

When in doubt, ask the user before changing anything that isn't purely visual.
