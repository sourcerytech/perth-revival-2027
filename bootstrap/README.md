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

The seed contains only the pure evaluator and REL reader. It imports no Node
builtins and has no filesystem, browser, HTTP or environment access. The
verification suite executes it without those globals. The Node entry point
is run.cjs; it injects explicit native ports from the adapters below. No MJS
implementation module is imported or compiled into it. Page construction,
CSS assembly, browser behaviour, worker
request policy and publication assertions are executable process definitions
in algebra/.

The evaluator implements the bounded surface-process subset already used by
Claimipedia/Sourcery: records, explicit lists, lexical references, active fact
queries, map/filter/some/every, scalar expressions, let/assert/when/each/fold,
named process queries and explicit asynchronous ports. Try/catch follows the
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

## Native port boundary

| File | Responsibility |
| --- | --- |
| temple-seed.cjs | Pure evaluation and REL parsing; supplied ports only |
| run.cjs | Generic Node bootstrap and dependency injection |
| ports/node.cjs | Files, paths, hashes and URL observation |
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
former native functions; the complete build has a 20-million-step limit.
Browser and worker event invocations retain the smaller default limit.
