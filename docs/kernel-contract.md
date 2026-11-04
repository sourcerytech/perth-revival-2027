# Temple kernel and bootstrap contract

Status: executable Encounter v1 profile, selected by
`bootstrap/kernel-profile.json`. This settles the bounded slice's execution ABI;
it does not certify full Sourcery compatibility or freeze future profiles.

## Purpose and source of requirements

Encounter establishes a fresh, reproducible vertical slice. Sourcery's ongoing
semantic decomposition supplies reusable modules when their contracts are ready.
The existing website is a behavior reference, not an instruction to preserve
every implementation decision. The first readable meta-language slice owns
shared Encounter chrome and lowers into REL through an algebra-authored compiler.
Broader process syntax remains an extension of the same semantic authority.

The wider compatibility basis is the local platform reconstitution, especially
the [integrated baseline report](../../tooling/maintenance/integrated-platform-baseline-2026-11-04/README.md).
Its retained tests are evidence of
scoped contracts, not a blanket completion certificate.

## Ownership and execution

1. The seed owns bounded evaluation, binding/reference mechanics and structural
   process control. It has no ambient filesystem, network, browser or credentials.
2. Algebra modules own derived operators, lowering, indexing, projections,
   application decisions and assurance. New domain behavior belongs here.
3. REL owns authored relations, content, configuration and projection grammar.
   An index is derived from an identified snapshot; history and active state
   remain distinct contracts.
4. Hosts own actual observations and mutations. Ports receive explicit grants;
   declaring an effect does not authorize it. Pure native value mechanisms are
   still part of the trusted closure and must not conceal domain semantics.
5. Outputs are disposable projections. A generated file cannot silently become
   a second editable authority. A change is made at its owner and rebuilt.
6. Loaded modules have explicit identities and named entrypoints. Duplicate
   programme names refuse. Successful compilation does not confer publication,
   actor, scientific or deployment authority.

## Bootstrap stages and evidence

The current entrypoint is `bootstrap/run.cjs`:

1. Read the manifest, verify the declared native closure and select host grants.
2. Load named process modules and reject duplicate programmes.
3. Run the algebra-defined lowerer over authored operator definitions and modules;
   admit the complete model's shapes and the entrypoint's reachable effects.
4. Compile declared language sources into REL with source maps, decode declared
   REL, refuse competing relation-cell owners, then construct immutable indexes.
5. Execute the selected entrypoint and assurance under the declared budget.
6. Record source/artifact hashes, selected profiles and measured execution usage.

The lowerer is already expressed in core algebra. That does not establish a
complete self-hosting compiler or remove trust in the seed, codecs, adapters and
host. The isolated proof removes the old MJS tree and ambient package resolution;
it does not demonstrate freedom from Node itself.

## Signposts, corrections and diagnostics

Diagnostics should supply a stable identifier, what failed, the responsible
boundary, a correction and the check that should be rerun. Include source path,
query, statement/expression location and observed versus expected values when
those are actually available. Preserve the original cause. Never fabricate a
source location or expose credentials through diagnostic context.

Algebra admission and assurance use ordinary Error messages with authored
identifiers and correction guidance. The language compiler returns structured
diagnostics with file, line, UTF-16 column, correction and rerun command. Failed
compilation emits no partial REL or source map. Successful compilation maps each
emitted fact to its source span and pins source, compiler and REL hashes. This is
fact-level provenance; per-expression runtime stacks and per-DOM source maps are
not part of v1. Existing host faults retain their existing handling.

Recovery is a suggestion, not an automatic action. A diagnostic must not grant
permissions, retry external effects, increase budgets, choose missing facts,
silence a failed check or rewrite a source contract. An unknown failure remains
unknown. Correct the owning source, then rerun the relevant check and isolated
proof. The agent entry guide in `AGENTS.md` provides the same route into the repo.

## Settled v1 execution decisions

`bootstrap/language.test.cjs` and the isolated build suite qualify these choices.
The raw seed executes trusted admitted IR; it is not a validating sandbox. The
build admits complete models and each browser/worker entrypoint before bundling.
Admission checks structural types and arities; it is not a static type system for
dynamic host observations or a guarantee that every future effect will succeed.

| Contract | Executable v1 decision |
| --- | --- |
| Values and equality | Finite own-data JSON source values. `eq` preserves ordered JSON observation: differing record key order compares unequal; -0 equals 0. `includes`/`distinct` retain identity membership for composite values. `add`, truthiness and concatenation retain the existing coercing ABI. This is explicitly not a canonical mathematical equality. |
| Absence and transport | Own-field `at` returns undefined for absence; absence differs from null. Strict references refuse missing, inherited and accessor fields. Internal absence cannot cross the strict JSON codec. Undefined, nonfinite numbers, cycles, holes, accessors, symbols, hidden fields and nonplain objects refuse transport instead of losing information. |
| Binding and shape | Lexical expression lets and loop frames isolate bindings; statement calls share their invocation environment. `model` is reserved against rebinding so authored code cannot replace the admitted call registry. Admission checks exact statement fields, safe bindings, core arities (variadic maximum 63), references and closed call names, including dead branches, before application effects. Dynamic value errors remain runtime faults. |
| Failures | Uncaught host Error objects preserve identity. Explicit `try` intentionally projects name/message only; host ports must reject with Error-like objects. Kernel budget exhaustion has code TEMPLE-K001, bypasses that kernel's catch and cannot become recovery authority. Typed domain results remain authored data. |
| Effects and async | Ports run sequentially and are awaited once. No automatic retry, rollback, cancellation or concurrency is implied. These require explicit authored protocols and host capabilities; they cannot be inferred from a successful call. |
| Budgets | Positive safe-integer limit. Indexing and application execution share the unchanged 20m counter; lowering, admission and language passes have separate bounded counters, reported where applicable. A step budget does not bound native-port duration or memory; the host owns those limits. |
| Identity and provenance | Hashed source/artifact closure plus language fact spans and hashed REL/map artifacts. One file owns a subject/predicate cell; ordered multiple values and retractions within that owner are supported. No inferred cross-source override. |
| Host security | Source reads and output-directory setup precede admission; application writes/effects follow it. Build and each runtime entrypoint must fit explicit grants. Each adapter independently enforces containment and credentials. Native ports are trusted boundaries, not a proof of host isolation. |

These choices preserve the existing ABI while preventing silent transport loss
and making admission executable. A stronger equality, catch contract or effect
model needs an explicit new profile, caller migration and differential evidence.
Generic interpreter mechanics and the JSON codec remain native trusted code;
domain policy, grammar, admission and lowering remain authored algebra.

```powershell
node --test bootstrap/bootstrap.test.cjs bootstrap/language.test.cjs
node bootstrap/run.cjs
```

The suite compares language-generated REL with a retained reference fixture,
builds both paths in isolation and requires all public artifacts to match. It
also changes one navigation label and requires the change across all eight pages.
Full platform cases below remain compatibility challenges, not passed v1 gates.

## Compatibility challenges

Use these as bounded language-design cases, without importing the platform's
entire implementation or claiming all its historical migrations have passed:

| Case | Required boundary evidence |
| --- | --- |
| Encounter build | Semantic source through projection; shared navigation; deterministic isolated build; rejected drift. |
| Authorized semantic edit | Cardinality, retractions, actor scope and stale basis; denial produces no unauthorized mutation. |
| Temple persistence | Journal identity, writer ownership, restart, backup/fork and secret references; storage through explicit ports. |
| Interactive projection | State, events, DOM/canvas observations and cleanup ownership; rendering does not silently persist data. |
| Recoverable installation | Exact plan, separate authorization, observed result and rollback evidence; false success and widened authority refuse. |

For each case, trace readable source to its IR, port requirements and observable
result. Keep missing contracts visible. A frontend is useful when it makes these
boundaries easier to author and inspect while preserving the same semantics.
