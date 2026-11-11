# First Vertical Slice: EasingWidget Apply Flow

## Slice Selection

**Chosen workflow:** EasingWidget → `easing:apply` command → AE keyframe easing

**Rationale:**
- Crosses the complete runtime stack: React UI → use case → CEP transport → ExtendScript → After Effects
- Core product-spine feature (temporal easing on animation keyframes)
- Small enough to verify in a real AE smoke test
- Exposes the architectural pattern all widget→host commands must follow

## Workflow Path

### Canonical path

```
EasingWidget (React)
  └── useWidget().executor  ← executor provided by WidgetProvider, not created inline
        ↓
  executor("easing:apply", { easingCurve: {...} })
        ↓
  AE host bridge → evalScript → After Effects
```

The canonical pattern keeps executor creation out of widget components. Widgets receive
an executor via context and use it to dispatch typed commands.

### Legacy path (archived — pre-architecture-recovery)

```
EasingWidget (React)  ← EasingWidget.tsx inline executor creation
  └── useMemo(() => createCepHostExecutor(window, "after-effects"), [hostCode, isCep])
        ↓
  executor("easing:apply", { easingCurve: {...} })
        ↓
  createCepHostExecutor (host bridge)
        ↓
  evalScript via CSInterface
        ↓
  After Effects
```

**Problems with the legacy path:**
- EasingWidget imported `createCepHostExecutor` directly — violated boundary rules
- Widget created executor inline in `useMemo` instead of receiving it from context
- Duplicate executor instances per widget render cycle

## Layer Ownership

| Layer | Owner | Responsibility |
|---|---|---|
| React UI (EasingWidget) | `src/function/widget/` | Render curve editor, surface apply/copy/reverse actions, handle user gestures |
| Use case | `src/function/widget/` | Transform curve data into command payload, handle loading/success/error state |
| Host command client | `src/management/ae/` | Wrap command in JSON, call evalScript, parse result |
| CEP transport | CSInterface + evalScript | Execute ExtendScript string in AE process |
| AE command handler | `src/management/ae/jsx/` | Execute AE API calls, return structured result |
| After Effects | AE runtime | Apply temporal ease to selected keyframes |

## Contract: `easing:apply`

**Input:**
```typescript
{
  easingCurve: {
    x1: number,      // control point 1 x (0..1)
    y1: number,      // control point 1 y (can exceed 0..1 for overshoot)
    x2: number,      // control point 2 x (0..1)
    y2: number,      // control point 2 y
    applyMode: "single" | "multiple",
    labelColor: number | null
  }
}
```

**Output:**
```typescript
{ ok: true, value: { updated: number } }
```

**Errors:**
- `INVALID_INPUT`: No active comp, no property selected, fewer than 2 keyframes selected
- `AE_EVAL_FAILED`: AE scripting error during apply

## What Future Features Must Imitate

1. **Command identity** is defined in one place — not in widget code, not in multiple places
2. **Result shape** is always `{ok: true, value: T}` or `{ok: false, error: {message, code}}`
3. **Widget uses executor** (HostCommandExecutor) to send commands, not raw evalScript
4. **Error classification** uses error codes: `INVALID_INPUT`, `AE_EVAL_FAILED`, etc.

## Boundary Rules (First Slice)

These patterns are prohibited:

1. Widget components must not import host-executor directly — use the widget context or a use-case hook
2. WidgetContext must not expose raw evalScript to widgets — evalScript must be wrapped in a use-case layer
3. Active source must not import legacy/ archive — archive is historical reference, not active code
4. AE bridge code must not import React or Supabase — runs in ExtendScript environment

## Verification Evidence

- [x] typecheck passes
- [ ] production CEP build runs
- [ ] real AE smoke test (requires AE environment)

## Debt Observed During Slice

1. **Inline executor creation in EasingWidget** — executor now provided via WidgetContext
2. **alert() calls for debugging** — removed from onApply path
3. **WidgetContext exposing raw evalScript** — known debt; boundary check baseline recorded

