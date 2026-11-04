# Perth Encounter — 7/7/27

A static site for Perth Encounter, a proposed kenotic gathering in Perth on Wednesday 7 July 2027. The current public frame is direct: one night given to God, with the event’s practical architecture kept open, humane and accountable.

## Concept

The site frames revival as prayer, worship, lament, reconciliation and practical mercy. It uses the actual Claimipedia process-algebra module as a public boundary discipline and stages a full symmetry break:

1. **Jordan admission and composition:** what can coexist in a safe, truthful and consent-based gathering.
2. **Living carrier:** Perth in place — the river, city, people, histories and local services.
3. **Locally invariant carrier:** dignity, protection and non-domination remain comparable across perspectives.
4. **Lie transport:** stories, prayer, music and encounter move through the admitted space.
5. **Holonomy, dynamics and selection:** the 7:07 kenotic moment selects responsibility over spectacle.
6. **Detector, reversal and record:** public fruit is checked after the event, including adverse evidence.

This is explanatory order, not a claim that one mathematical layer mechanically manufactures the next. The event is a theological and civic reading of the grammar, not a physical derivation.

## Source posture

Content is grounded in the local Claimipedia capture and repository corpus, especially:

- `../corpus/GLOSSARY.md`
- `../corpus/EXPLANATORY_STANDARD.md`
- `../corpus/syntheses/kenotic_governance_tri_omni_theism_and_a_lawful_world.md`
- `../corpus/syntheses/admissibility_optional_endpoints_mythic_and_theological_readings.md`

The Claimipedia capture is treated as a read-only interpretive source, not as proof of a religious event or a live public service. The site specifically references:

- `../integrations/sourcery/mcp-admission/scientific-derivation-composer/scientific-derivation-process.json` — `scientific-derivation-composition/common-algebra-2`.
- `../sourcery-source/sourcery-applications/applications/claimipedia/symmetry-breaking-atlas-data.json` — retained Claimipedia symmetry-breaking source.
- `../corpus/READING_CONTRACT.md` — admission → carrier → invariant carrier → transport → selection → records.

## Preview and public service

Open `index.html` directly, or serve this directory with any static server. The public site is deployed at:

`https://perth-encounter-2027.musicalsunbird.chatgpt.site`

The GitHub repository is the source mirror and development record; the public deployment is generated and hosted outside GitHub.

The interest form is connected to a consent-aware Cloudflare Worker and Mailgun sender. It validates consent, sends notifications to the gathering team, and provides a manual unsubscribe route through `hello@sourcerytech.com.au`. The Worker deployment, Mailgun delivery and signup flows have been confirmed separately from this static repository.

## Algebra-first build

The public pages are generated from authored semantic REL; there are no committed HTML or CSS source files in the repository root or runtime source. The minimal Temple kernel registry lives in `source/semantic/temple-kernel.rel` and hydrates replaceable DOM, CSS, runtime and assurance modules. The event and page meanings live in `source/semantic/perth-encounter.rel`, the site contract (routes, navigation, assets, accessibility and signup protocol) lives in `source/semantic/site-contract.rel`, the Claimipedia document production and page-to-DOM projection grammar lives in `source/semantic/projection-grammar.rel`, and the complete presentation grammar—tokens, roles, selectors, declarations and responsive contexts—lives in `source/semantic/presentation.rel`. The build derives page metadata and navigation from REL, checks page and asset obligations, resolves templates and region mappings from projection REL, derives authored DOM REL through the hydrated DOM module, and derives `dist/styles.css` exclusively from presentation REL before using the pinned Sourcery `html-rel` projection and emitter under `source/html-rel/`. The old `htmlImported.*` lowering output is not part of the source model. The browser runtime materialization contains behaviour only. The exact deployment record lives at `launch/perth-encounter-launch-receipt.json`.

Run `node scripts/generate-site-manifest.mjs` to run the semantic-REL → Claimipedia grammar → DOM-REL → HTML-IR → HTML pipeline plus the presentation-REL → CSS projection, or `node scripts/build-site.mjs` to produce the publishable `dist/` package. The build refuses to publish when projection, shared navigation, declared routes, page metadata or declared content anchors drift. `dist/` is output, not source.
