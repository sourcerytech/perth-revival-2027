// which tags we accept on import. Extend it (in sync with DOM_TAGS/SVG_TAGS in
// dom-authored-core.mjs) as real pages need more tags.
export const REL_SUPPORTED_TAGS = new Set([
  // structure
  "html", "head", "body", "title", "meta", "link", "style", "script",
  
  // text & inline
  "a", "p", "span", "div", "code", "pre", "em", "strong", "b", "i", "s", "u", "small", "sub",
  
  // headings
  "h1", "h2", "h3", "h4", "h5", "h6",
  
  // sectioning
  "main", "section", "header", "footer", "aside", "nav", "article", "details", "summary",
  
  // lists
  "ul", "li",
  
  // forms
  "form", "label", "input", "button", "textarea", "select", "option", "optgroup", "fieldset", "legend",
  
  // media
  "img", "br", "canvas",
  
  // svg
  "svg", "circle", "clippath", "defs", "g", "line", "path", "polygon", "polyline", "rect", "text",
]);

export const REL_SUPPORTED_ATTRIBUTES = new Set(["alt", "autocomplete", "charset", "checked", "class", "for", "href", "id", "lang", "name", "placeholder", "rel", "role", "src", "style", "target", "type"]);
export const REL_SUPPORTED_EVENTS = new Set(["click", "change", "submit"]);
export const REL_TO_IR_TARGET_CONTRACT = Object.freeze({
  document: "DomDocument",
  element: "DomNode",
  canvas: "DomCanvas",
  text: "DomText",
  comment: "DomComment",
  attribute: "DomAttr",
  childEdge: "DomChild",
  orderedChildPredicate: "order",
});
const RAW_TEXT_TAGS = new Set(["script", "style", "title"]);

function diag(severity, code, message, node, extra = {}) {
  return {
    severity,
    code,
    message,
    nodePath: node?.path || null,
    source: node?.source || null,
    ...extra,
  };
}

function quote(value) {
  return JSON.stringify(String(value));
}

function fact(subject, predicate, object) {
  return `(${quote(subject)}, ${quote(predicate)}, ${quote(object)})`;
}

function appendLine(lines, subject, predicate, object) {
  lines.push(fact(subject, predicate, object));
}

function subjectFor(prefix, path) {
  return `${prefix}.${path.length ? path.join("_") : "root"}`;
}

function childSummary(children) {
  return {
    textChildren: children.filter(child => child.kind === "text"),
    elementChildren: children.filter(child => child.kind === "element"),
    commentChildren: children.filter(child => child.kind === "comment"),
    unsupportedChildren: children.filter(child => child.kind !== "text" && child.kind !== "element" && child.kind !== "comment"),
  };
}

function isWhitespaceOnly(textNodes) {
  return textNodes.every(node => /^\s*$/.test(node.value));
}

function isIgnorableRootNode(node) {
  return node?.kind === "text" && /^\s*$/.test(node.value);
}

function displayPath(path) {
  if (!Array.isArray(path) || !path.length) return "root";
  return path.join(".");
}

function buildDiagContext(node, options = {}, extra = {}) {
  const file = options.file || options.ir?.source?.file || "";
  return {
    file,
    pathText: displayPath(node?.path || null),
    ...extra,
  };
}

function collectIssuesForNode(node, diagnostics, options = {}) {
  if (node.kind !== "element") {
    diagnostics.push(diag("error", "rel-root-non-element", `REL lowering requires element roots; found ${node.kind}.`, node, buildDiagContext(node, options, {
      nodeKind: node.kind,
    })));
    return false;
  }
  let ok = true;
  if (!REL_SUPPORTED_TAGS.has(node.tagName)) {
    diagnostics.push(diag("error", "rel-unsupported-tag", `Unsupported REL DOM tag <${node.tagName}>.`, node, buildDiagContext(node, options, {
      tagName: node.tagName,
    })));
    ok = false;
  }
  for (const attr of node.attributes) {
    // Arbitrary literal attributes are allowed for provenance-preserving import.
    void attr;
  }
  const summary = childSummary(node.children);
  const allowedRawText = RAW_TEXT_TAGS.has(node.tagName);
  for (const child of summary.unsupportedChildren) {
    if (allowedRawText && child.kind === "raw") continue;
    diagnostics.push(diag("error", "rel-unsupported-child", `Unsupported child node kind ${child.kind} under <${node.tagName}>.`, child, buildDiagContext(child, options, {
      parentTagName: node.tagName,
      nodeKind: child.kind,
    })));
    ok = false;
  }
  for (const child of summary.elementChildren) {
    if (!collectIssuesForNode(child, diagnostics, options)) ok = false;
  }
  return ok;
}

function emitNode(node, lines, options) {
  if (node.tagName === "canvas") {
    return emitCanvas(node, lines, options);
  }
  const subject = subjectFor(options.nodePrefix, node.path);
  appendLine(lines, subject, "isa", "DomNode");
  appendLine(lines, subject, "tag", node.tagName);

  node.attributes.forEach((attr, index) => {
    const attrSubject = `${subjectFor(options.attrPrefix, node.path)}.${index}`;
    appendLine(lines, attrSubject, "isa", "DomAttr");
    appendLine(lines, attrSubject, "node", subject);
    appendLine(lines, attrSubject, "name", attr.name);
    if (attr.name === "checked" && attr.value == null) {
      appendLine(lines, attrSubject, "renderMode", "booleanPresence");
      appendLine(lines, attrSubject, "value", "true");
      return;
    }
    appendLine(lines, attrSubject, "value", attr.value == null ? "true" : attr.value);
  });

  node.children.forEach((child, index) => {
    let childSubject = "";
    if (child.kind === "text") {
      childSubject = `${subjectFor(options.textPrefix, child.path)}.${index}`;
      appendLine(lines, childSubject, "isa", "DomText");
      appendLine(lines, childSubject, "text", child.value);
    } else if (child.kind === "comment") {
      childSubject = `${subjectFor(options.commentPrefix, child.path)}.${index}`;
      appendLine(lines, childSubject, "isa", "DomComment");
      appendLine(lines, childSubject, "text", child.value);
    } else if (child.kind === "raw" && RAW_TEXT_TAGS.has(node.tagName)) {
      childSubject = `${subjectFor(options.textPrefix, child.path)}.${index}`;
      appendLine(lines, childSubject, "isa", "DomText");
      appendLine(lines, childSubject, "text", child.value);
    } else if (child.kind === "element") {
      emitNode(child, lines, options);
      childSubject = child.tagName === "canvas"
        ? subjectFor(options.canvasPrefix, child.path)
        : subjectFor(options.nodePrefix, child.path);
    } else {
      return;
    }
    const edgeSubject = `${subjectFor(options.edgePrefix, child.path)}.${index}`;
    appendLine(lines, edgeSubject, "isa", "DomChild");
    appendLine(lines, edgeSubject, "parent", subject);
    appendLine(lines, edgeSubject, "child", childSubject);
    appendLine(lines, edgeSubject, "order", String(index + 1));
  });
}

function emitCanvas(node, lines, options) {
  const subject = subjectFor(options.canvasPrefix, node.path);
  appendLine(lines, subject, "isa", "DomCanvas");

  node.attributes.forEach((attr, index) => {
    const attrSubject = `${subjectFor(options.attrPrefix, node.path)}.${index}`;
    appendLine(lines, attrSubject, "isa", "DomAttr");
    appendLine(lines, attrSubject, "node", subject);
    appendLine(lines, attrSubject, "name", attr.name);
    appendLine(lines, attrSubject, "value", attr.value == null ? "true" : attr.value);
  });

  node.children.forEach((child, index) => {
    let childSubject = "";
    if (child.kind === "text") {
      childSubject = `${subjectFor(options.textPrefix, child.path)}.${index}`;
      appendLine(lines, childSubject, "isa", "DomText");
      appendLine(lines, childSubject, "text", child.value);
    } else if (child.kind === "comment") {
      childSubject = `${subjectFor(options.commentPrefix, child.path)}.${index}`;
      appendLine(lines, childSubject, "isa", "DomComment");
      appendLine(lines, childSubject, "text", child.value);
    } else if (child.kind === "element") {
      emitNode(child, lines, options);
      childSubject = child.tagName === "canvas"
        ? subjectFor(options.canvasPrefix, child.path)
        : subjectFor(options.nodePrefix, child.path);
    } else {
      return;
    }
    const edgeSubject = `${subjectFor(options.edgePrefix, child.path)}.${index}`;
    appendLine(lines, edgeSubject, "isa", "DomChild");
    appendLine(lines, edgeSubject, "parent", subject);
    appendLine(lines, edgeSubject, "child", childSubject);
    appendLine(lines, edgeSubject, "order", String(index + 1));
  });
}

export function collectIrDiagnostics(ir, options = {}) {
  const diagnostics = [];
  const rootChildren = ir.children.filter(child => !isIgnorableRootNode(child));
  if (!rootChildren.length) {
    diagnostics.push({
      severity: "error",
      code: "rel-empty-document",
      message: "IR document has no children to lower.",
      nodePath: null,
      source: null,
      file: options.file || ir.source?.file || "",
    });
    return diagnostics;
  }
  if (rootChildren.length !== 1) {
    diagnostics.push({
      severity: "error",
      code: "rel-multi-root-document",
      message: `REL lowering requires exactly one root child; found ${rootChildren.length}.`,
      nodePath: null,
      source: ir.source || null,
      file: options.file || ir.source?.file || "",
    });
  }
  rootChildren.forEach(child => collectIssuesForNode(child, diagnostics, { ...options, ir }));
  return diagnostics;
}

export function summarizeRelCompatibilityDiagnostics(diagnostics) {
  const summary = {
    total: diagnostics.length,
    byCode: {},
    unsupportedTags: {},
    unsupportedAttributes: {},
    files: {},
  };
  for (const entry of diagnostics) {
    summary.byCode[entry.code] = (summary.byCode[entry.code] || 0) + 1;
    if (entry.tagName && entry.code === "rel-unsupported-tag") {
      summary.unsupportedTags[entry.tagName] = (summary.unsupportedTags[entry.tagName] || 0) + 1;
    }
    if (entry.attribute && entry.code === "rel-unsupported-attr") {
      summary.unsupportedAttributes[entry.attribute] = (summary.unsupportedAttributes[entry.attribute] || 0) + 1;
    }
    const file = entry.file || "";
    if (!summary.files[file]) summary.files[file] = 0;
    summary.files[file] += 1;
  }
  return summary;
}

export function auditIrForRelCompatibility(ir, options = {}) {
  const diagnostics = collectIrDiagnostics(ir, options);
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    summary: summarizeRelCompatibilityDiagnostics(diagnostics),
  };
}

export function lowerIrToRel(ir, options = {}) {
  const diagnostics = collectIrDiagnostics(ir, options);
  const lines = [];
  if (diagnostics.some(entry => entry.severity === "error")) {
    return {
      rel: "",
      diagnostics,
    };
  }
  const documentSubject = options.documentSubject || "doc.htmlImported";
  const root = ir.children.find(child => !isIgnorableRootNode(child));
  appendLine(lines, documentSubject, "isa", "DomDocument");
  appendLine(lines, documentSubject, "root", root.tagName === "canvas"
    ? subjectFor(options.canvasPrefix || "canvas.htmlImported", root.path)
    : subjectFor(options.nodePrefix || "node.htmlImported", root.path));
  emitNode(root, lines, {
    nodePrefix: options.nodePrefix || "node.htmlImported",
    canvasPrefix: options.canvasPrefix || "canvas.htmlImported",
    attrPrefix: options.attrPrefix || "attr.htmlImported",
    textPrefix: options.textPrefix || "text.htmlImported",
    commentPrefix: options.commentPrefix || "comment.htmlImported",
    edgePrefix: options.edgePrefix || "edge.htmlImported",
  });
  return {
    rel: `${lines.join("\n")}\n`,
    diagnostics,
  };
}
