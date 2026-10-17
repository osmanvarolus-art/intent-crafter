---
target: "http://localhost:4173/ (IntentCraft)"
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/omarchi-os/Projects/intent-crafter/intent-craft-app/src/App.tsx"
target_fingerprint: "sha256:9dba502c65ab740c3cc77b0f2cf89598c35f0412e09857b86fa12c6049c02d10"
target_path: /home/omarchi-os/Projects/intent-crafter/intent-craft-app/src/App.tsx
timestamp: 2026-10-17T19-38-33Z
slug: intent-craft-app-src-app-tsx
closed: true
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score: 24/40 (Acceptable)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Step notes work; loading has no expectation |
| 2 | Match real world | 2 | Model names, "Markdown", systemctl in UI; agent says "siz", UI says "sen" |
| 3 | User control | 3 | Undo everywhere, New idea archive |
| 4 | Consistency | 2 | Up to 4 primary buttons; right title "Kontrol et" during Tell |
| 5 | Error prevention | 2 | "Devam: Görev" primary while questions open; Keep all silently skips options |
| 6 | Recognition | 3 | Steps always visible; quote highlight in own text |
| 7 | Flexibility | 2 | No keyboard flow for Keep/Drop |
| 8 | Minimalist | 3 | Calm, but permanent voice notice and monospace package wall |
| 9 | Error recovery | 2 | Raw error strings ("HTTP 500") |
| 10 | Help | 2 | Type help only in a hover tooltip |

## Priority issues
- [P1] Duplicate/statement-worded agent questions; user's own question rewritten as a statement, then asked again by the pre-check; "siz" vs "sen"; up to 7 open questions at once.
- [P1] Weak hand-off: raw markdown dump with ids/offsets, prepare stays primary, US date in Turkish UI, no plain summary.
- [P1] Keep all silently leaves option points undecided.
- [P2] Too many primary buttons; next-task primary while questions are open; Tell step shows the Check title.
- [P2] Jargon (engine names, systemctl, Markdown) and raw error strings.
- Detector: 3 decorative 3px side stripes (.interim-preview, .point.is-confirmed, .point.is-stale); current step loses its focus ring; buttons 31.8px tall; 11.8px "Hazır" badge; long lines on desktop. Craft floor: emoji glyphs as icons; eyebrow label; web fonts loaded from Google on an offline-first tool.

## Persona red flags
- First-timer: three amber buttons, "Ajan", "Markdown", model names.
- Power user: no Keep/Drop keys, package not editable.
- Phone: results land ~800px below the fold after splitting.
