export const SEMANTIC_PAGE_CONTRACT_PROTOCOL = "claimipedia-semantic-page-contract/1";

const grammar = (purpose, regions, options = {}) => Object.freeze({
  purpose,
  regions: Object.freeze(regions),
  minimumSections: options.minimumSections ?? 1,
  requiresCollection: options.requiresCollection ?? false,
  requiresControls: options.requiresControls ?? false,
  requiresEvidenceLanguage: options.requiresEvidenceLanguage ?? false,
});

export const EDITORIAL_GRAMMARS = Object.freeze({
  gateway: grammar("Orient a reader and offer bounded onward choices.", ["orientation", "choices", "continuation"], { requiresCollection: true }),
  index: grammar("Make a named collection findable and traversable.", ["orientation", "controls", "collection", "continuation"], { requiresCollection: true }),
  catalogue: grammar("Describe and enumerate a governed collection.", ["orientation", "collection", "provenance"], { requiresCollection: true }),
  map: grammar("Expose relationships without replacing their underlying records.", ["orientation", "legend", "map", "continuation"], { requiresCollection: true }),
  atlas: grammar("Compare a family of related objects through stable dimensions.", ["orientation", "dimensions", "collection", "limits"], { requiresCollection: true }),
  article: grammar("Explain one bounded subject in a readable sequence.", ["orientation", "body", "sources", "continuation"]),
  dossier: grammar("Present a subject, its warrant, limits, and provenance.", ["orientation", "context", "evidence", "limitations", "provenance"], { requiresEvidenceLanguage: true }),
  debate: grammar("Keep positions, reasons, and unresolved contention distinguishable.", ["question", "positions", "evidence", "contentions", "continuation"], { requiresCollection: true, requiresEvidenceLanguage: true }),
  "literature-review": grammar("Synthesize sources while preserving source boundaries.", ["question", "method", "sources", "synthesis", "limitations"], { requiresEvidenceLanguage: true }),
  synthesis: grammar("Join multiple warranted records without hiding uncertainty.", ["question", "inputs", "synthesis", "limitations", "continuation"], { requiresEvidenceLanguage: true }),
  programme: grammar("State a governed objective and the work that advances it.", ["objective", "state", "work", "evidence", "next-decision"], { requiresCollection: true, requiresEvidenceLanguage: true }),
  report: grammar("Record question, method, result, interpretation, and limits.", ["question", "method", "findings", "interpretation", "limitations", "provenance"], { requiresEvidenceLanguage: true }),
  protocol: grammar("Specify repeatable inputs, procedure, outputs, and failure conditions.", ["purpose", "inputs", "procedure", "outputs", "failure-conditions"], { requiresCollection: true }),
  notebook: grammar("Retain observations and their chronology without promoting them to conclusions.", ["scope", "entries", "observations", "limits"], { requiresCollection: true }),
  workbench: grammar("Support a bounded action while keeping state and consequences visible.", ["purpose", "state", "controls", "result", "audit-trail"], { requiresControls: true }),
  journey: grammar("Lead through an ordered path with an explicit beginning and continuation.", ["orientation", "steps", "continuation"], { requiresCollection: true }),
  "learning-path": grammar("Teach through ordered material and a visible completion condition.", ["objective", "lessons", "practice", "continuation"], { requiresCollection: true }),
  documentation: grammar("Explain an interface, procedure, or boundary for practical use.", ["purpose", "instructions", "examples", "limits"], { requiresCollection: true }),
  dashboard: grammar("Summarize state and expose the actions and records behind it.", ["purpose", "state", "controls", "records"], { requiresCollection: true }),
});

export const UNIVERSAL_PAGE_REGIONS = Object.freeze([
  "site-header",
  "primary-navigation",
  "breadcrumb",
  "page-header",
  "page-body",
  "continuation",
]);

export const SEMANTIC_DOCUMENT_GRAMMAR = Object.freeze({
  protocol: "claimipedia-semantic-document-grammar/1",
  productions: Object.freeze({
    Document: Object.freeze(["SkipLink?", "SiteHeader", "Main", "SiteFooter?"]),
    SiteHeader: Object.freeze(["Brand", "PrimaryNavigation"]),
    Main: Object.freeze(["Breadcrumb", "PageHeader", "PageBody", "Continuation?"]),
    PageHeader: Object.freeze(["Kicker?", "H1", "Lede?"]),
    PageBody: Object.freeze(["NamedRegion+"]),
    NamedRegion: Object.freeze(["Heading?", "Prose|Collection|Controls|Evidence|Figure"]),
    Continuation: Object.freeze(["NamedNavigation|NextAction"]),
  }),
  invariants: Object.freeze([
    "one main landmark",
    "one site header",
    "one primary navigation",
    "one breadcrumb",
    "one h1",
    "no skipped heading level",
    "no duplicate element id",
    "no presentational nodes",
    "no redundant visual ordinals inside ordered lists",
    "no unnamed interactive control",
  ]),
});

// A family is only auditable when one durable, public member is retained as its
// representative. These are examples of the route grammar, not canonical
// substitutes for every member of the family.
export const SEMANTIC_ROUTE_FAMILY_EXAMPLES = Object.freeze({
  "surface.sourcery.assurance.record": "/sourcery/assurances/secure.application.abuse-resistance",
  "surface.claim.claim.id": "/claim/frohlich-mechanism-regimes",
  "surface.topic.topic.id": "/topic/frohlich-condensation",
  "surface.domain.domain.id": "/domain/the-world-we-find",
  "surface.person.person.id": "/person/herbert-frohlich",
  "surface.comparison.comparison.id": "/comparison/frohlich-material-analogues",
  "surface.seam.seam.id": "/seam/frohlich-mechanism-to-evidence",
  "surface.programme.programme.id": "/programme/frohlich-research",
  "surface.research.strategy.strategy.id": "/research-strategy/frohlich-next-move",
  "surface.journey.journey.id": "/#/journey/capability-atlas",
  "surface.learn.lesson.id": "/#/learn/proof",
  "surface.claimipedia.seam.record": "/seams/records/seam.missing-content-surface-projection.account.c39e2f553e74",
});

export function semanticPageContract(surface) {
  if (!surface) return null;
  const editorialGrammar = EDITORIAL_GRAMMARS[surface.editorialForm];
  if (!editorialGrammar) return null;
  return Object.freeze({
    protocol: SEMANTIC_PAGE_CONTRACT_PROTOCOL,
    surfaceId: surface.id,
    canonicalPath: surface.canonicalPath,
    semanticKind: surface.semanticKind,
    editorialForm: surface.editorialForm,
    epistemicFunction: surface.epistemicFunction,
    epistemicPosture: surface.epistemicPosture,
    lifecycle: surface.lifecycle,
    universalRegions: UNIVERSAL_PAGE_REGIONS,
    documentGrammar: SEMANTIC_DOCUMENT_GRAMMAR,
    grammar: editorialGrammar,
  });
}

const visible = element => {
  if (!element) return false;
  const style = globalThis.getComputedStyle?.(element);
  if (!style) return true;
  const box = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
};

const headingLevel = element => Number(element.tagName.slice(1));

const redundantOrdinalElements = main => main ? [...main.querySelectorAll("ol > li")].flatMap((item, index) => {
  const expected = index + 1;
  const candidate = [...item.querySelectorAll("span,small,b,strong")].find(element => {
    const text = element.textContent?.trim() || "";
    return /^\d{1,3}$/u.test(text) && Number(text) === expected && (item.textContent?.trim() || "").startsWith(text);
  });
  return candidate ? [candidate] : [];
}) : [];

export function auditSemanticDocument(document, surface) {
  const contract = semanticPageContract(surface);
  const mains = [...document.querySelectorAll("main")].filter(visible);
  const main = mains[0] || null;
  const headings = main ? [...main.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible) : [];
  const h1s = headings.filter(element => element.tagName === "H1");
  const headingSkips = [];
  for (let index = 1; index < headings.length; index += 1) {
    const previous = headingLevel(headings[index - 1]);
    const current = headingLevel(headings[index]);
    if (current > previous + 1) headingSkips.push({ from: previous, to: current, text: headings[index].textContent?.trim().slice(0, 80) || "" });
  }
  const breadcrumbs = [...document.querySelectorAll('nav[aria-label*="breadcrumb" i], .breadcrumbs, .breadcrumb')].filter(visible);
  const primaryNavigation = [...document.querySelectorAll('nav[aria-label="Primary" i], nav.primary-nav')].filter(visible);
  const siteHeaders = [...document.querySelectorAll('header[data-semantic-site-header], body > header, header.topbar')].filter(visible);
  const misplacedBreadcrumbs = breadcrumbs.filter(element => !element.closest("main"));
  const misplacedPrimaryNavigation = primaryNavigation.filter(element => !siteHeaders.some(header => header.contains(element)));
  const misplacedSiteHeaders = siteHeaders.filter(element => element.closest("main"));
  const sections = main ? [...main.querySelectorAll("section,article,fieldset,[role=region]")].filter(visible) : [];
  const unnamedRegions = main ? [...main.querySelectorAll("section,nav,aside")].filter(visible).filter(element => !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby") && !element.querySelector(":scope > h2, :scope > h3, :scope > header h2, :scope > header h3")) : [];
  const repeatedCollections = main ? [...main.querySelectorAll("div,section,nav")].filter(container => {
    const children = [...container.children].filter(child => visible(child) && child.matches("a,article,details,label,li,tr"));
    return children.length >= 2;
  }).length : 0;
  const collectionCount = main ? main.querySelectorAll('ol,ul,table,dl,fieldset,[role=list],[class*="grid"],[class*="list"],[class*="catalog"],[class*="collection"]') .length + repeatedCollections + (sections.length > 1 ? 1 : 0) : 0;
  const controlCount = main ? main.querySelectorAll("form,button,input,select,textarea,[role=button],a[href]").length : 0;
  const stylesheetCount = document.querySelectorAll('link[rel~="stylesheet"]').length;
  const styleElementCount = document.querySelectorAll("style").length;
  const inlineStyleCount = document.querySelectorAll("[style]").length;
  const hiddenPresentationCount = document.querySelectorAll('[aria-hidden="true"]').length;
  const redundantOrdinalCount = redundantOrdinalElements(main).length;
  const ids = [...document.querySelectorAll("[id]")].map(element => element.id).filter(Boolean);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const unnamedControls = main ? [...main.querySelectorAll("button,input,select,textarea,summary")].filter(visible).filter(element => {
    if (element.matches('input[type="hidden"]')) return false;
    const labelled = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim();
    if (labelled) return false;
    if (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) return false;
    return !element.closest("label");
  }) : [];
  const text = (main?.textContent || "").toLowerCase();
  const evidenceMatch = text.match(/\b(evidence|source|method|provenance|warrant|limit(?:ation|ed|ing|s)?|uncertain(?:ty)?|confidence|boundary|validation|reproduction|artifact|receipt|assurance|finding|result|data|failure|falsif(?:y|iable|ication)|authority|unavailable|withheld|absent|scope|firewall|gate|forbid)\b/u);
  const evidenceLanguage = Boolean(evidenceMatch);
  const failures = [];
  if (!surface) failures.push("unregistered-surface");
  if (!contract) failures.push("missing-editorial-grammar");
  if (mains.length !== 1) failures.push("main-landmark-count");
  if (h1s.length !== 1) failures.push("h1-count");
  if (headingSkips.length) failures.push("heading-level-skip");
  if (breadcrumbs.length > 1) failures.push("duplicate-breadcrumb");
  if (primaryNavigation.length > 1) failures.push("duplicate-primary-navigation");
  if (siteHeaders.length !== 1) failures.push("site-header-count");
  if (breadcrumbs.length !== 1) failures.push("breadcrumb-count");
  if (primaryNavigation.length !== 1) failures.push("primary-navigation-count");
  if (misplacedSiteHeaders.length) failures.push("site-header-placement");
  if (misplacedPrimaryNavigation.length) failures.push("primary-navigation-placement");
  if (misplacedBreadcrumbs.length) failures.push("breadcrumb-placement");
  if (contract && sections.length < contract.grammar.minimumSections) failures.push("insufficient-semantic-regions");
  if (contract?.grammar.requiresCollection && collectionCount === 0) failures.push("missing-collection-structure");
  if (contract?.grammar.requiresControls && controlCount === 0) failures.push("missing-workbench-controls");
  if (contract?.grammar.requiresEvidenceLanguage && !evidenceLanguage) failures.push("missing-evidence-or-limits-language");
  if (stylesheetCount || styleElementCount || inlineStyleCount) failures.push("presentation-layer-present");
  if (hiddenPresentationCount) failures.push("presentational-node-present");
  if (redundantOrdinalCount) failures.push("redundant-visual-ordinal");
  if (duplicateIds.length) failures.push("duplicate-element-id");
  if (unnamedControls.length) failures.push("unnamed-control");
  return Object.freeze({
    protocol: SEMANTIC_PAGE_CONTRACT_PROTOCOL,
    surfaceId: surface?.id || null,
    editorialForm: surface?.editorialForm || null,
    counts: Object.freeze({ main: mains.length, h1: h1s.length, siteHeader: siteHeaders.length, breadcrumb: breadcrumbs.length, primaryNavigation: primaryNavigation.length, misplacedSiteHeaders: misplacedSiteHeaders.length, misplacedPrimaryNavigation: misplacedPrimaryNavigation.length, misplacedBreadcrumbs: misplacedBreadcrumbs.length, sections: sections.length, collections: collectionCount, controls: controlCount, unnamedRegions: unnamedRegions.length, stylesheets: stylesheetCount, styleElements: styleElementCount, inlineStyles: inlineStyleCount, presentationalNodes: hiddenPresentationCount, redundantOrdinals: redundantOrdinalCount, duplicateIds: duplicateIds.length, unnamedControls: unnamedControls.length }),
    signals: Object.freeze({ evidenceOrLimitsTerm: evidenceMatch?.[0] || null }),
    diagnostics: Object.freeze({
      duplicateIds: Object.freeze(duplicateIds),
      unnamedControls: Object.freeze(unnamedControls.map(element => ({ tag: element.tagName.toLowerCase(), type: element.getAttribute("type"), id: element.id || null, text: element.textContent?.trim().slice(0, 80) || null }))),
    }),
    headingSkips: Object.freeze(headingSkips),
    failures: Object.freeze(failures),
    level: failures.length ? 1 : 2,
    status: failures.length ? "needs-remediation" : "semantic-contract-passed",
    themeEligible: false,
    nonEntailment: "A semantic contract pass does not establish factual truth, accessibility conformance, responsive quality, or human visual approval.",
  });
}

export function semanticRegistryAssurance(surfaces) {
  const missingGrammars = surfaces.filter(surface => !EDITORIAL_GRAMMARS[surface.editorialForm]).map(surface => surface.id);
  const provisional = surfaces.filter(surface => surface.classificationConfidence === "provisional").map(surface => ({ id: surface.id, path: surface.canonicalPath, note: surface.classificationNote || null }));
  const routeFamilies = surfaces.filter(surface => surface.routeType === "family" && surface.visibility === "public");
  const missingRouteFamilyExamples = routeFamilies.filter(surface => !SEMANTIC_ROUTE_FAMILY_EXAMPLES[surface.id]).map(surface => surface.id);
  return Object.freeze({
    protocol: SEMANTIC_PAGE_CONTRACT_PROTOCOL,
    surfaceCount: surfaces.length,
    grammarCount: Object.keys(EDITORIAL_GRAMMARS).length,
    missingGrammars,
    provisional,
    routeFamilyExamples: Object.freeze(routeFamilies.map(surface => Object.freeze({ id: surface.id, template: surface.canonicalPath, example: SEMANTIC_ROUTE_FAMILY_EXAMPLES[surface.id] || null }))),
    missingRouteFamilyExamples,
    status: missingGrammars.length || provisional.length || missingRouteFamilyExamples.length ? "needs-remediation" : "passed",
  });
}
