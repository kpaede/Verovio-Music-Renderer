# Changelog

## 1.1.5

Patch version bump to fix two ChordPro rendering defects identified in private review:

- Expose chord names such as “Am chord” through readable assistive-technology text, preserving chord-before-lyric order without duplicate announcements.
- Preserve tablature columns with a monospace, nonwrapping layout and keyboard-accessible horizontal scrolling on narrow screens.

Adds browser regression tests and WCAG 2.1 A/AA axe checks for these paths.
