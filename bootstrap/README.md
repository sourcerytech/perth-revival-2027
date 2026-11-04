# Temple bootstrap

Build with Node 22 or newer:

    node bootstrap/run.cjs

Prove the build without the MJS module tree:

    node --test bootstrap/bootstrap.test.cjs

The proof creates a fresh temporary directory. Its input allowlist is the
seed, declared native adapters and manifests, executable algebra modules,
declared REL sources and required assets. It contains no .mjs files, scripts directory,
source/projection, source/html-rel or node_modules. The child process
uses the absolute Node executable with PATH, NODE_PATH and NODE_OPTIONS
empty. It builds and verifies all eight pages and checks byte-for-byte
determinism. Tests also change a DOM algebra rule without changing the seed
and require the output to change. Missing definitions, unknown operators,
missing assets and navigation drift must fail.

generated/bootstrap-proof.json retains the exact source and artifact
digests. These are reproducible engineering checks from this test run.
They do not claim full accessibility conformance or independent visual QA.

## Execution boundary

The seed contains only the pure evaluator. REL decoding is a declared input
codec in ports/rel-codec.cjs. The seed imports no Node
builtins and has no filesystem, browser, HTTP or environment access. The
verification suite executes it without those globals. The Node entry point
is run.cjs; it injects explicit native ports from the adapters below. No MJS
implementation module is imported or compiled into it. Page construction,
CSS assembly, browser behaviour, worker
request policy and publication assertions are executable process definitions
in algebra/.

The source language supports the bounded surface-process subset already used
by Claimipedia/Sourcery. Fifteen native expression primitives supply the
basis; thirteen source operators are derived from algebra definitions. Process
control retains let/assert/when/each/fold, named queries and explicit ports.
Try/catch follows the
existing asynchronous surface-process bridge. Literal nonempty arrays use
list; unrecognized operations refuse. Strict references reject inherited
fields and accessors. Execution and ranges are bounded. This is the executable
subset required by these modules; other expression profiles remain outside
this seed's declared support.

Native adapters supply generic host mechanisms: file I/O, URL resolution, value
reflection and string operations, browser DOM/network observations, HTTP
responses and mail transport. Executable HTML algebra now owns escaping,
tag/attribute validation, serialization, tree traversal and accessible-name
observation. The programmes also own the page layouts,
CSS declarations, endpoint, recipient, validation pattern, messages,
request decisions and publication assertions.

bootstrap/site.json selects data modules that the seed executes:

| Module | Executed responsibility |
| --- | --- |
| html.process.json | HTML serialization, tree traversal and observations |
| dom.process.json | Semantic facts and projection grammar to document trees |
| css.process.json | Design tokens and ordered presentation facts to CSS |
| browser.process.json | Menu, signup submission and success/failure actions |
| worker.process.json | HTTP, origin, decoding, consent and delivery decisions |
| assurance.process.json | Landmarks, controls, navigation, anchors and links |
| build.process.json | Module composition and artifact publication |

view.rel holds event copy and interface labels. Existing semantic REL files
remain inputs. The DOM algebra calls the HTML algebra through named queries;
there are no native html.serialize or html.inspect host ports. Browser/worker
output embeds the same generic evaluator,
explicit host ports and selected executable process definitions.

Secrets remain runtime parameters supplied to the worker. Tests use dummy
credentials and mocked mail transport; they send no email. Publishing static
output does not redeploy the external Cloudflare worker.

## Derived operators and self-hosted lowering

operators.expression.json contains executable lowering laws for `record`,
`not`, `has`, `map`, `filter`, `some`, `every`, `one`, `optional`, `and`, `or`,
`objects` and `subjects`.
They have no native
fallback in the kernel. Kernel primitives include expression-level fold,
lexical let and raise, following the existing value algebra's semantics.

lowering.process.json is a core-only algebra programme. The same kernel runs
it before application execution. It admits the definitions, reserves fresh
bindings against source names, expands templates, refuses cycles and core
shadowing, and lowers all programme expression fields. The native
ports/algebra-lower.cjs bridge merely invokes that programme. It contains no
operator-specific compiler logic.

The source operators retain their existing syntax. Some/every and and keep
their short-circuit behaviour; or evaluates its arguments eagerly before
selecting the first truthy result. Fact cardinality diagnostics remain
unchanged. The derivation profile admits dense JSON arrays, string-valued
REL facts and operator arities from zero through 63. These bounds do not
claim support for arbitrary JavaScript objects or accessor-bearing arrays.

The browser and worker receive only the lowered programme and native core;
the algebra compiler is not needed during an event. Definitions and compiler
programme hashes are included in the build receipt and isolated proof.
Changing a law changes execution without editing the seed. Removing a law
stops the build. Tests verify hygiene, lazy/eager behaviour, refusals and
that the compiler itself invokes only declared core primitives.

The combined derivation and indexing passes reduce native expression
operations from 24 to 15 and leave a 113-line kernel. The full native
dependency size is recorded separately
in generated/bootstrap-conformance.json; source lines alone are not a claim
that all trusted code shrank. The earlier full-scan subjects derivation
exceeded the build budget. The indexed algebra implementation below removes
that obstacle without raising the budget. The previous frontier receipt is
retained as historical evidence.

## Immutable fact snapshots

fact-index.process.json builds both indexes using only core algebra and
generic value ports. It is run once for each snapshot, before query execution.
The objects index maps subject/predicate cells to active values in first-seen
order. Duplicate assertions do not duplicate a value; refutation removes it;
reassertion restores its original position. The subjects index maps
predicate/object cells to the raw ordered subject history, retaining duplicate
and negative rows to preserve the existing subjects operator's semantics.

The index is deeply frozen. The algebra definitions perform own-field
lookups and return independent array copies. No native fact-query handler or
full-scan fallback remains. Generic record.put and value.freeze ports provide
record mechanics only; they contain no fact or polarity semantics.

Index construction and application execution use the same kernel counter.
The limit remains 20 million steps, including the selected-scope indexes
prepared for browser and worker bundles. The receipt records indexSteps,
applicationSteps and totalSteps. Compilation retains its pre-existing
separate bound. Runtime bundles contain the selected immutable snapshot's
index and do not scan raw facts during events.

At each new snapshot the indexes are rebuilt; there is no unkeyed global
cache. Mutating the original input cannot change an existing index. Tests
cover 262 histories, duplicate/refuted/reasserted values, numeric-looking and
prototype-like keys, missing cells, snapshot replacement and query-result
mutation. Qualification checks every indexed corpus cell against the
retained FactStore in addition to page/HTML/CSS equivalence.

## Native port boundary

| File | Responsibility |
| --- | --- |
| temple-seed.cjs | Pure evaluation; supplied ports only |
| run.cjs | Generic Node bootstrap and dependency injection |
| ports/node.cjs | Files, paths, hashes and URL observation |
| ports/rel-codec.cjs | Strict REL input decoding, independent of evaluation |
| ports/algebra-lower.cjs | Invoke the core-only algebra lowering programme |
| ports/fact-index.cjs | Invoke the core-only fact-index programme |
| ports/value.cjs | Value, record, string and regular-expression primitives |
| ports/browser.cjs | Injected document, DOM events and fetch |
| ports/worker.cjs | Injected HTTP, form-data and mail transport |
| ports/register.cjs | Closed registration of explicitly granted names |
| hosts/runtime.cjs | Bundle assembly and per-event host wiring |

ports.json declares separate build, browser and worker grants. The evaluator
can invoke only the functions registered for its profile. Browser and worker
profiles receive no filesystem grants. Removing a grant makes an invocation
fail; naming an unavailable native implementation fails registration.

native.json declares the exact loaded bootstrap source files. The Node host
checks the actual import graph against that declaration and records every
source digest in build-receipt.json. The isolated proof copies that explicit
set, with no MJS modules or node_modules. Extracted CJS files are leaf host
adapters, not application implementation modules; application decisions stay
in executable algebra. This separates the seed from native code rather than
claiming that native code has disappeared.

Filesystem ports restrict reads to the input root and writes to its declared
output subtree. They reject traversal and observed symlinks/junctions before
I/O. These checks are a capability boundary, not an operating-system sandbox.

## Existing algebra qualification

The retained reference implementation is:

    ../applications/pyramid-material-history/vendor/sourcery/process/surface-process-engine.mjs

Run its original evaluator as a differential oracle:

    node bootstrap/qualify-reference.cjs ../applications/pyramid-material-history/vendor/sourcery/process/surface-process-engine.mjs

This separate qualification compares 19 value/fact expressions, all eight
complete page trees and the CSS folds with the existing implementation.
It also compares every page's serialized HTML bytes and inspection result
against the former native seed at commit 9175f17. The recorded seed reduction
uses LF-normalized bytes and lines. The historical seed is loaded only by
this qualification command; it is absent from the build closure.
It records the reference and seed hashes in
generated/bootstrap-conformance.json. The reference is used only for this
qualification, never by the bootstrap build or isolated proof.

The retired MJS projector, build scripts, HTML-REL implementation and obsolete
site manifest have been removed. Their earlier versions remain recoverable
from Git history. The historical launch receipt records the old deployment;
current execution is described by the bootstrap manifest and proof receipts.
The verification suite also rejects any MJS implementation added to the
source or scripts directories.

The build execution budget is explicit in the manifest. Interpreting HTML
traversal and serialization in algebra costs more evaluation steps than the
former native functions; compilation and application execution each retain
the manifest's 20-million-step limit.
Browser and worker event invocations retain the smaller default limit.
