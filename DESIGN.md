# Liner Notes design system

Liner Notes is an editorial music search tool: expressive when helping someone
remember a song, quiet and dense when helping them choose a result.

## Layout

- Use the shared `--shell` width (1200px) and `--gutter` for all useful content.
- Keep prose and forms within `--reading` (720px) unless a result list needs the
  full shell.
- Decorative artwork may exceed the shell; text, controls, and navigation may not.

## Type

- `Newsreader` is for display titles, song titles, and editorial story text.
- `DM Sans` is for navigation, search controls, metadata, and body copy.
- Oversized display type belongs on the homepage and song detail pages only.
- Body copy is at least 16px; utility labels are uppercase, high-contrast, and
  never the only means of communicating hierarchy.

## Color and surfaces

- Paper: `--paper`; ink: `--ink`; accent: `--blue`; signal: `--coral`.
- Use one-pixel `--line` borders for grouping. Avoid decorative shadows and cards.
- `--blue` is reserved for emphasis and focus, not broad background fills.

## Interaction

- Search is the primary action. Results appear before research tools.
- Buttons and touch targets have a minimum 44px height.
- Focus states are always visible. Disclosure is preferred to persistent secondary
  panels when it competes with a primary task.

## Responsive behavior

- 480px: compact mobile layout.
- 820px: single-column content and results.
- 1200px: full shell with decorative hero art.
