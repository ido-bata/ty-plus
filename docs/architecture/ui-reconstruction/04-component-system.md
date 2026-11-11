# 04 Component System

## Design Direction

The UI is a compact After Effects production tool. It should feel quiet,
precise, and repeatable. Prefer dense controls, clear affordances, small
typography, restrained contrast, and immediate access to work surfaces.

Avoid marketing layouts, nested cards, oversized hero text, decorative imagery,
single-hue themes, and explanatory in-app copy.

## Tailwind And Tokens

Use Tailwind classes for layout and component composition. Use CSS custom
properties for theme values. The canonical CSS entry is
`src/cep-shell/styles/app.css`.

Token owners:

- `src/cep-shell/styles/theme.css`: actual CSS variables.
- `src/cep-shell/src/design/design-tokens.ts`: semantic token names.
- `src/cep-shell/theme/*`: theme persistence and merge utilities.
- `src/cep-shell/src/inject-cep-styles.ts`: runtime style injection.

Components should use semantic variables such as:

- `--color-surface-panel`
- `--color-surface-widget`
- `--color-surface-dialog`
- `--color-text-primary`
- `--color-text-muted`
- `--color-border-subtle`
- `--color-interactive-hover`
- `--color-interactive-active`

Do not hard-code one-off colors in feature components unless creating a new
documented token.

## Primitive Components

Use `@ty-plus/ui` as the base primitive library:

- `Button`
- `IconButton`
- `Input`
- `Textarea`
- `Select`
- `Checkbox`
- `Switch`
- `RangeInput`
- `NumericInput`
- `SegmentedControl`
- `ColorField`
- `PathField`
- `Badge`
- `Separator`

`src/cep-shell/src/components/shared` may wrap primitives for CEP-specific
behavior, icons, tooltips, shell editors, and widget rendering.

## Interaction Rules

- Use icon buttons for compact commands.
- Use menus for command groups.
- Use segmented controls for mutually exclusive modes.
- Use toggles or checkboxes for binary state.
- Use sliders, steppers, or numeric inputs for numeric values.
- Use tabs only for peer-level views, not as layout decoration.
- Every unfamiliar icon needs a tooltip or title.
- Disabled host-only actions must explain unavailability through status text or
  inline affordance, not through a thrown error.

## Component File Shape

Each feature component file should export one primary component. Split helpers
when a file exceeds a readable size or when the directory approaches 8 files.

Recommended feature structure:

```text
components/dialogs/settings/
  SettingsDialog.tsx
  SettingsSections.tsx
  ThemePanel.tsx
  WorkspacePanel.tsx
  DirectoryPanel.tsx
  index.ts
```

No component should duplicate `DialogShell`, `WidgetShell`, status buttons,
path fields, or editor chrome.

