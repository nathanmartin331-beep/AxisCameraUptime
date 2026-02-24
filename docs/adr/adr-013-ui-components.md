# ADR-013: UI Component Library — shadcn/ui (Radix + Tailwind)

## Status
Accepted

## Date
2025-01-01

## Context
The dashboard requires a rich set of accessible UI primitives: dialogs, dropdowns, tooltips, tabs, data tables, form inputs, and more. Building these from scratch is expensive; adopting a heavyweight library (Material UI, Ant Design) ships a large runtime bundle and enforces opinionated design systems that are hard to customise. A middle path is needed that provides accessible, unstyled primitives with full ownership of the styling layer.

The application also requires a customisable dashboard layout where users can reposition and resize widget cards, and a consistent dark-mode experience driven by the operating system or user preference.

## Decision
- Use **shadcn/ui** as the component system. shadcn/ui is not a runtime npm package; it copies component source files directly into the codebase (under `client/src/components/ui/`), giving full ownership.
- Depend on **23 Radix UI packages** as the accessible primitive layer underlying shadcn components.
- Use **Tailwind CSS v3** as the sole styling mechanism. No CSS modules, no Styled Components.
- Use **lucide-react** for iconography (consistent stroke-weight SVG icons, tree-shakeable).
- Implement dark mode via Tailwind's **class-based strategy** (`darkMode: 'class'` in `tailwind.config.ts`). Toggle is applied to the `<html>` element.
- Define all design tokens as **CSS custom properties using HSL values** in `globals.css`, referenced by Tailwind utilities via `hsl(var(--token))` syntax. This enables runtime theme switching without a rebuild.
- Use **react-grid-layout** for the customisable dashboard widget grid, enabling drag-to-reposition and resize handles.

```css
/* Example token definition in globals.css */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
}
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
}
```

```typescript
// tailwind.config.ts excerpt
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
      },
    },
  },
};
```

## Consequences

### Positive
- shadcn/ui components are owned source code; they can be modified freely without waiting for upstream releases or fighting override specificity battles.
- Radix UI primitives provide WCAG-compliant keyboard navigation and ARIA attributes out of the box.
- Tailwind utility classes eliminate context-switching between JS and CSS files; colocation of styles with markup reduces cognitive load.
- HSL CSS custom properties allow real-time theme switching (light/dark, brand colours) with zero JavaScript overhead.
- lucide-react icons are individually tree-shaken, adding only used icon SVGs to the bundle.
- react-grid-layout persisted layout state enables a truly personalised dashboard experience per user.

### Negative
- 23 Radix UI packages as direct dependencies increase `node_modules` size and require individual version management.
- Tailwind's JIT output can be verbose and hard to audit in DevTools; long class strings on elements reduce HTML readability.
- shadcn/ui components diverge from upstream over time as they are modified locally; upstream bug fixes must be manually applied.
- react-grid-layout adds drag-and-drop complexity; its CSS must be imported separately, and layout serialisation must be wired into user preferences storage.

### Neutral
- Tailwind CSS v3 requires a PostCSS pipeline; this is already handled by the Vite build (see ADR-014).
- The class-based dark mode strategy requires the `dark` class to be toggled on `<html>` by JavaScript, which introduces a brief flash-of-unstyled-content on hard reloads if the preference is stored only in `localStorage`. A server-rendered cookie approach would eliminate this but is out of scope for this project.
- All shadcn/ui component files live at `client/src/components/ui/` and are tracked in git as first-party code.

## Technical Debt
- The 23 Radix UI packages will need coordinated upgrades; a dependency automation tool (Renovate, Dependabot) is recommended to prevent version drift across the `@radix-ui/*` namespace.
- If the design system needs to be shared across multiple applications in future, the locally-owned shadcn components would need to be extracted into a shared package — a non-trivial refactor.

## Related
- [ADR-012: Client Framework](adr-012-client-framework.md)
- [ADR-014: Build Tooling](adr-014-build-tooling.md)
- [ADR-021: Monorepo Structure](adr-021-monorepo-structure.md)
