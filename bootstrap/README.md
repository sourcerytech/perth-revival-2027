# Temple bootstrap

Build with Node 22 or newer:

    node bootstrap/temple-seed.cjs

Prove the build without the MJS module tree:

    node --test bootstrap/bootstrap.test.cjs

The proof creates a fresh temporary directory. Its input allowlist is the
single seed, bootstrap manifest, executable algebra modules, declared REL
sources and required assets. It contains no .mjs files, scripts directory,
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

The seed is a single CommonJS host executable requiring only Node builtins.
Node remains the host runtime. No MJS implementation module is imported or
compiled into it. Page construction, CSS assembly, browser behaviour, worker
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

The seed supplies generic host mechanisms: file I/O, URL resolution, escaped
HTML serialization and tree observation, browser DOM/network observations,
HTTP responses and mail transport. The programmes own the page layouts,
CSS declarations, endpoint, recipient, validation pattern, messages,
request decisions and publication assertions.

bootstrap/site.json selects data modules that the seed executes:

| Module | Executed responsibility |
| --- | --- |
| dom.process.json | Semantic facts and projection grammar to document trees |
| css.process.json | Design tokens and ordered presentation facts to CSS |
| browser.process.json | Menu, signup submission and success/failure actions |
| worker.process.json | HTTP, origin, decoding, consent and delivery decisions |
| assurance.process.json | Landmarks, controls, navigation, anchors and links |
| build.process.json | Module composition and artifact publication |

view.rel holds event copy and interface labels. Existing semantic REL files
remain inputs. The seed's HTML host port serializes the tree produced by the
DOM algebra. Browser/worker output embeds the same generic evaluator,
explicit host ports and selected executable process definitions.

Secrets remain runtime parameters supplied to the worker. Tests use dummy
credentials and mocked mail transport; they send no email. Publishing static
output does not redeploy the external Cloudflare worker.

## Existing algebra qualification

The retained reference implementation is:

    ../applications/pyramid-material-history/vendor/sourcery/process/surface-process-engine.mjs

Run its original evaluator as a differential oracle:

    node bootstrap/qualify-reference.cjs ../applications/pyramid-material-history/vendor/sourcery/process/surface-process-engine.mjs

This separate qualification compares 19 value/fact expressions, all eight
complete page trees and the CSS folds with the existing implementation.
It records the reference and seed hashes in
generated/bootstrap-conformance.json. The reference is used only for this
qualification, never by the bootstrap build or isolated proof.

Older MJS build files remain available for comparison and concurrent work.
GitHub Pages uses the bootstrap. Those files do not enter its executable
closure.
