# Encounter relation language v1

The first Temple meta-language slice is `encounter-rel/1`. Its executable grammar
and lowering live in `algebra/language.process.json`, run by the existing seed
after ordinary operator lowering. There is no native language parser, HTML
template, new interpreter or hidden JavaScript policy implementation.

`source/language/encounter.temple` is the sole authoring source for 34 shared
site, navigation and footer facts. For example:

```text
module "encounter.chrome"

entity "site.perthEncounter" {
  name "Perth Encounter"
  navigation "nav.story"
  navigation "nav.night"
}

entity "nav.story" {
  isa "NavigationItem"
  label "The story"
  href "story.html"
}
```

This lowers to ordered REL facts. Existing DOM/CSS and behavior programmes consume
the same indexed relations; the frontend does not select a new rendering path.
The retained `test/fixtures/encounter-chrome.expected.rel` is a comparison oracle,
never a build input or fallback. Editing it cannot change the site.

## Grammar and boundaries

- One `module "identity"` declaration appears before entities.
- `entity "identity" {` opens a block; `}` closes it on its own line.
- Each relation is `predicate "JSON string"` on one line. Repeating a predicate
  with distinct values preserves order. `!predicate "JSON string"` retracts.
- Predicates use ASCII identifiers with dots/hyphens after the first character.
  Identities and values are quoted JSON strings; escapes and literal dollar
  characters are preserved. LF and CRLF are accepted.
- Blank lines and whole-line `#` comments are accepted. Inline comments,
  semicolons, nested blocks, duplicate entity declarations and identical facts
  in one module refuse. Empty module/entity identities refuse.
- Multiple modules cannot own the same subject/predicate cell, including across
  handwritten REL and language sources. New values belong in the owning module.

Values in this profile are strings, including `"true"` and numeric-looking
values. No implicit Boolean/number conversion, defaults, imports, ambient lookup,
native code, effect syntax or function syntax is supported. Generic process
syntax can be added later against the settled kernel profile. This slice tests
readable relational authoring and source provenance, not an entire language.

## Build and diagnostics

```powershell
node bootstrap/run.cjs
node --test bootstrap/language.test.cjs
```

The manifest declares the compiler and language sources. The compiler receives
only the explicit compilation profile: generic reflection, string mechanics and
strict JSON codecs. Regex patterns, syntax decisions, diagnostics and emission
are algebra-authored. It has no filesystem/network/browser write capability.

Compilation returns either ordered facts/REL/origins or a structured diagnostic:

```json
{
  "code": "TEMPLE-M006",
  "phase": "language",
  "boundary": "encounter-rel/1",
  "summary": "Relation appears outside an entity.",
  "correction": "Place the relation inside its owning entity block.",
  "span": {"file": "example.temple", "line": 2, "column": 3, "endColumn": 18},
  "check": "node --test bootstrap/language.test.cjs"
}
```

Lines and columns start at one; columns count UTF-16 code units and endColumn is
exclusive. End-of-file errors identify the final line. Source text is not echoed
into diagnostics. Failure emits no partial IR and stops the build; it cannot
activate a fallback or widen grants.

Successful builds write `dist/language/0.rel` and `0.map.json`. The map pins the
source, compiler and emitted REL hashes, with one span per fact. The build
receipt includes the complete dependency closure and source-to-fact witnesses.
These records support reproducibility; they do not establish actor authority,
scientific truth, publication approval or a complete DOM-level source map.
