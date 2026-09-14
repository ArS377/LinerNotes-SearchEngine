# Liner Notes design system

Liner Notes is a music search and discovery tool for curious listeners. Search
comes first; actual recordings, artwork, previews and credits give it personality.

## Direction

Use a record-shop shelf, not a promotional landing page. The signature is a row of
real covers with titles, artists, years and immediate preview/save/compare actions.
Avoid giant slogans, serif display text, ornamental record diagrams and empty space.

## Tokens

- Ink: #242321
- Page: #fafafa; white surfaces: #ffffff
- Coral: #ff765f for primary actions; #a53b2a for accessible accent text and focus
- Muted text: #67635f; borders: #dedbd7
- Retain the existing #f2f0e9 only in the compact search area.
- Barlow Condensed 600/700: wordmark, restrained page titles and section headings
- Barlow 400/500/600/700: search, body, navigation and recording information
- Body: 16px; secondary text: 14px; compact recording metadata: 12px

## Layout

Use a centered 1280px maximum content width with a shared responsive gutter.
Navigation stays horizontal; mobile navigation can scroll without wrapping labels.
The shelf uses six columns on wide screens, three on tablets and two on phones.
Results use compact artwork rows. Detail pages pair cover art with recording
information. Mobile comparisons scroll horizontally to preserve side-by-side context.

## Interaction

Keep buttons simple, with at most 8px radii. Use borders and spacing for hierarchy,
without gradients, floating card shadows, uppercase eyebrows or hover transforms.
The slash key focuses search. Lyrics mode submits a quoted lyric query. Era filters
apply to the shelf; source, genre and sort controls apply to search results.
Every cover opens a real recording. Show previews only when the playback API provides
one; audio starts only after a listener action. Keep a single player across navigation.
Artwork comes from the existing playback endpoint, with a labeled fallback on failure.

Use visible focus, semantic labels, live error messages and reduced-motion support.
Bookmarks and comparisons use the existing browser profile. Do not label selected
records as trending, personalized, or currently playing without data supporting it.
