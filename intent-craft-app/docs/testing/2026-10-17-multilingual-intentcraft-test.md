# IntentCraft multilingual messy-input test — 2026-10-17

## Scope

Ran three rounds in each input language (Turkish, French, English): nine controlled, messy descriptions of a privacy-preserving, offline-first city emergency coordination system. Checked generated point types, terminology, preserved requirements, and source quotes in the browser at `http://127.0.0.1:4173/`. The final extraction displayed local engine `gemma4-12b`; no paid API was observed. Per-run engine labels were not captured for every test. No product code was changed.

## Results

- All nine extraction runs completed and produced between 5 and 10 cards.
- Cards retained excerpts from the corresponding source text. Turkish and French inputs produced English cards because the app interface was set to English.
- Core requirements generally survived: offline capture and later sync, provenance/time/confidence, unverified status, volunteer location privacy, language/district filters, accessibility, and resistance to visibility manipulation.
- One Turkish output mistranslated `kaynak ve eminlik` (source and confidence) as “resources and security status,” and added a location requirement. This loses the core provenance/confidence terminology.
- One French output interpreted `sans manipulation` (without manipulation/tampering) as “requires no complex manipulation.”
- One French output rendered `garder source heure confiance` (preserve source, time, confidence) as “maintain a source of trust based on the time.”
- One English output added an offline constraint that repeated the offline-mesh idea. Some concept duplication remains.
- The UI language selector exposes English and Turkish only. French input was processed, but French UI/output localization was not available to test.

## Test integrity

An initial rapid batch submitted each input immediately after filling the field. Delayed suggestion calls raced with subsequent inputs, so those intermediate results were not counted. The reported nine runs used per-input waits; source quotes matched each current input. A separate short English probe confirmed the same behavior. The page was left on the final English result.

## Follow-up

Improve multilingual meaning preservation for Turkish/French ambiguity and technical terms; prevent unsupported concepts such as “location” from appearing when the input only asks for source/time/confidence. Add French interface support only if it is within the product’s intended language scope. Consider a deduplication check for repeated constraints. Full Questions and Task steps were not exercised in this test because their model pre-check can fall through to a subscription-backed Claude CLI.
