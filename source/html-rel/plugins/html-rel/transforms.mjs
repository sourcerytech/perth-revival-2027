import { cloneIr, IR_VERSION, validateIrDocument } from "./ir.mjs";

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function pathKey(path) {
  return JSON.stringify(path);
}

function normalizePathSelector(selector) {
  if (Array.isArray(selector)) return selector.map(value => Number(value));
  if (typeof selector !== "string") return null;
  const trimmed = selector.trim();
  const match = /^path\((.*)\)$/u.exec(trimmed);
  if (!match) return null;
  const body = match[1].trim();
  if (!body) return [];
  return body.split(".").map(part => {
    if (!/^\d+$/u.test(part)) throw new Error(`Invalid IR path selector: ${selector}`);
    return Number(part);
  });
}

function parseAttributeSelector(body, selector) {
  const attrMatch = /^([A-Za-z_:][-A-Za-z0-9_:.]*)(?:=(['"])(.*?)\2)?$/u.exec(body.trim());
  if (!attrMatch) throw new Error(`Unsupported attribute selector syntax: ${selector}`);
  return {
    name: attrMatch[1],
    value: attrMatch[3],
  };
}

function parseSimpleSelector(selector) {
  const trimmed = selector.trim();
  if (!trimmed) throw new Error("IR selector cannot be empty.");
  const explicitPath = normalizePathSelector(trimmed);
  if (explicitPath) return { type: "path", path: explicitPath };
  if (/\s/u.test(trimmed)) {
    throw new Error(`Unsupported selector combinator in ${JSON.stringify(selector)}.`);
  }

  let cursor = 0;
  let tag = null;
  const tagMatch = /^[A-Za-z][A-Za-z0-9:_-]*/u.exec(trimmed);
  if (tagMatch) {
    tag = tagMatch[0].toLowerCase();
    cursor = tag.length;
  }

  const classes = [];
  const attrs = [];
  let id = null;
  while (cursor < trimmed.length) {
    const char = trimmed[cursor];
    if (char === "#") {
      const match = /^#([A-Za-z0-9:_-]+)/u.exec(trimmed.slice(cursor));
      if (!match) throw new Error(`Invalid id selector syntax: ${selector}`);
      id = match[1];
      cursor += match[0].length;
      continue;
    }
    if (char === ".") {
      const match = /^\.([A-Za-z0-9:_-]+)/u.exec(trimmed.slice(cursor));
      if (!match) throw new Error(`Invalid class selector syntax: ${selector}`);
      classes.push(match[1]);
      cursor += match[0].length;
      continue;
    }
    if (char === "[") {
      const end = trimmed.indexOf("]", cursor + 1);
      if (end === -1) throw new Error(`Unterminated attribute selector: ${selector}`);
      attrs.push(parseAttributeSelector(trimmed.slice(cursor + 1, end), selector));
      cursor = end + 1;
      continue;
    }
    throw new Error(`Unsupported selector syntax near ${JSON.stringify(trimmed.slice(cursor))}.`);
  }

  return {
    type: "simple",
    tag,
    id,
    classes,
    attrs,
  };
}

export function parseIrSelector(selector) {
  return parseSimpleSelector(selector);
}

function getAttribute(node, name) {
  return node.attributes.find(attr => attr.name === name) || null;
}

function classNames(node) {
  const classAttr = getAttribute(node, "class");
  if (!classAttr?.value) return [];
  return classAttr.value.split(/\s+/u).filter(Boolean);
}

function matchesSelector(node, selector) {
  if (selector.type === "path") return pathKey(node.path) === pathKey(selector.path);
  if (node.kind !== "element") return false;
  if (selector.tag && node.tagName !== selector.tag) return false;
  if (selector.id) {
    const idAttr = getAttribute(node, "id");
    if (idAttr?.value !== selector.id) return false;
  }
  if (selector.classes.length) {
    const names = new Set(classNames(node));
    if (selector.classes.some(name => !names.has(name))) return false;
  }
  if (selector.attrs.length) {
    for (const expected of selector.attrs) {
      const attr = getAttribute(node, expected.name);
      if (!attr) return false;
      if (expected.value !== undefined && attr.value !== expected.value) return false;
    }
  }
  return true;
}

export function matchesIrSelector(node, selector) {
  const parsed = typeof selector === "string" ? parseSimpleSelector(selector) : selector;
  return matchesSelector(node, parsed);
}

function walkNodes(nodes, visit, parent = null) {
  for (const node of nodes) {
    visit(node, parent);
    if (node.kind === "element") walkNodes(node.children, visit, node);
  }
}

export function walkIrSubtree(node, visit, parent = null) {
  if (!node) return;
  visit(node, parent);
  if (node.kind === "element") walkNodes(node.children, visit, node);
}

function repathNode(node, path) {
  const next = {
    ...cloneValue(node),
    path,
  };
  if (next.kind === "element") {
    next.children = next.children.map((child, index) => repathNode(child, [...path, index]));
  }
  return next;
}

export function regenerateIrPaths(ir) {
  const next = {
    version: IR_VERSION,
    kind: "document",
    doctype: cloneValue(ir.doctype ?? null),
    children: (ir.children || []).map((child, index) => repathNode(child, [index])),
    source: cloneValue(ir.source ?? null),
  };
  return validateIrDocument(next);
}

export function cloneIrSubtree(node) {
  return cloneValue(node);
}

export function getIrChildren(node) {
  return node?.kind === "element" ? [...node.children] : [];
}

export function getIrParent(ir, selector) {
  const node = selectOneIr(ir, selector);
  if (!node || !node.path.length) return null;
  return findNodeByPath(ir, node.path.slice(0, -1));
}

export function queryIr(ir, selector) {
  validateIrDocument(ir);
  const parsed = parseSimpleSelector(selector);
  const matches = [];
  walkNodes(ir.children, node => {
    if (matchesSelector(node, parsed)) matches.push(node);
  });
  return matches;
}

export function queryIrSubtree(root, selector, options = {}) {
  const parsed = parseSimpleSelector(selector);
  const matches = [];
  const includeRoot = options.includeRoot !== false;
  if (root?.kind === "document") {
    validateIrDocument(root);
    walkNodes(root.children, node => {
      if (matchesSelector(node, parsed)) matches.push(node);
    });
    return matches;
  }
  if (!root || typeof root !== "object") return matches;
  if (includeRoot) {
    walkIrSubtree(root, node => {
      if (matchesSelector(node, parsed)) matches.push(node);
    });
    return matches;
  }
  if (root.kind === "element") {
    walkNodes(root.children, node => {
      if (matchesSelector(node, parsed)) matches.push(node);
    }, root);
  }
  return matches;
}

export function selectOneIr(ir, selector) {
  return queryIr(ir, selector)[0] || null;
}

export function findNodeById(ir, id) {
  return selectOneIr(ir, `#${id}`);
}

export function findNodeByPath(ir, path) {
  return selectOneIr(ir, path);
}

function fragmentDocumentFromNode(node) {
  return regenerateIrPaths({
    version: IR_VERSION,
    kind: "document",
    doctype: null,
    children: [cloneIrSubtree(node)],
    source: null,
  });
}

export function isolateFragmentById(ir, id) {
  const node = findNodeById(ir, id);
  if (!node) throw new Error(`No IR element found with id ${JSON.stringify(id)}.`);
  return fragmentDocumentFromNode(node);
}

export function isolateFragmentByPath(ir, path) {
  const node = findNodeByPath(ir, path);
  if (!node) throw new Error(`No IR node found at path ${JSON.stringify(path)}.`);
  return fragmentDocumentFromNode(node);
}

function collapseWhitespace(value) {
  return value.replace(/\s+/gu, " ").trim();
}

export function normalizeIrWhitespace(ir, options = {}) {
  const mode = options.mode || "trim";
  const dropEmpty = options.dropEmpty === true;
  const next = cloneIr(ir);
  walkNodes(next.children, node => {
    if (node.kind !== "text") return;
    node.value = mode === "collapse" ? collapseWhitespace(node.value) : node.value.trim();
  });
  if (!dropEmpty) return next;
  return regenerateIrPaths({
    ...next,
    children: pruneNodes(next.children, child => child.kind === "text" && child.value === ""),
  });
}

function pruneNodes(nodes, predicate) {
  const kept = [];
  for (const node of nodes) {
    if (predicate(node)) continue;
    if (node.kind === "element") {
      kept.push({
        ...node,
        children: pruneNodes(node.children, predicate),
      });
      continue;
    }
    kept.push(node);
  }
  return kept;
}

function matchedPathKeys(ir, selector) {
  return new Set(queryIr(ir, selector).map(node => pathKey(node.path)));
}

function normalizeReplacementNodes(replacement, originalNode) {
  const resolved = typeof replacement === "function" ? replacement(cloneIrSubtree(originalNode)) : replacement;
  if (resolved == null) return [];
  return (Array.isArray(resolved) ? resolved : [resolved]).map(node => cloneIrSubtree(node));
}

function rewriteNodes(nodes, matcher, rewrite) {
  const next = [];
  for (const node of nodes) {
    if (matcher(node)) {
      next.push(...rewrite(node));
      continue;
    }
    if (node.kind === "element") {
      next.push({
        ...cloneIrSubtree(node),
        children: rewriteNodes(node.children, matcher, rewrite),
      });
      continue;
    }
    next.push(cloneIrSubtree(node));
  }
  return next;
}

export function replaceIrNode(ir, selector, replacement) {
  const keys = matchedPathKeys(ir, selector);
  const next = rewriteNodes(ir.children, node => keys.has(pathKey(node.path)), node => normalizeReplacementNodes(replacement, node));
  return regenerateIrPaths({ ...ir, children: next });
}

export function removeIrNode(ir, selector) {
  return replaceIrNode(ir, selector, []);
}

export function wrapIrNode(ir, selector, wrapper) {
  return replaceIrNode(ir, selector, node => {
    const normalizedWrapper = typeof wrapper === "function"
      ? wrapper(cloneIrSubtree(node))
      : {
          kind: "element",
          tagName: wrapper.tagName,
          attributes: cloneValue(wrapper.attributes || []),
          children: [],
          path: [],
          source: null,
        };
    if (!normalizedWrapper || normalizedWrapper.kind !== "element") {
      throw new Error("wrapIrNode requires an element wrapper.");
    }
    normalizedWrapper.children = [...(normalizedWrapper.children || []), cloneIrSubtree(node)];
    normalizedWrapper.path = [];
    return normalizedWrapper;
  });
}

export function insertIrChild(ir, selector, child, options = {}) {
  const keys = matchedPathKeys(ir, selector);
  const indexMode = options.position || "append";
  const childrenToInsert = (Array.isArray(child) ? child : [child]).map(entry => cloneIrSubtree(entry));
  const visit = node => {
    const nextNode = cloneIrSubtree(node);
    if (nextNode.kind === "element") {
      nextNode.children = nextNode.children.map(visit);
      if (keys.has(pathKey(nextNode.path))) {
        const before = [...nextNode.children];
        let insertAt = before.length;
        if (indexMode === "prepend") insertAt = 0;
        else if (typeof indexMode === "number") insertAt = Math.max(0, Math.min(before.length, indexMode));
        nextNode.children = [
          ...before.slice(0, insertAt),
          ...childrenToInsert.map(entry => cloneIrSubtree(entry)),
          ...before.slice(insertAt),
        ];
      }
    }
    return nextNode;
  };
  const next = ir.children.map(visit);
  return regenerateIrPaths({ ...ir, children: next });
}

function collectNodePaths(ir, selector) {
  return queryIr(ir, selector).map(node => node.path);
}

function diagnostic(pass, code, message, extra = {}) {
  return {
    severity: "info",
    pass,
    code,
    message,
    ...extra,
  };
}

function dropCommentsPass(ir) {
  let removed = 0;
  const children = pruneNodes(ir.children, node => {
    if (node.kind !== "comment") return false;
    removed += 1;
    return true;
  });
  return {
    ir: regenerateIrPaths({ ...ir, children }),
    diagnostics: [diagnostic("dropComments", "ir-comments-dropped", `Dropped ${removed} comment node(s).`, { count: removed })],
  };
}

function extractFragmentPass(ir, passOptions = {}) {
  const selector = passOptions.selector ?? passOptions.path;
  if (!selector) throw new Error("extractFragment pass requires selector or path.");
  const node = selectOneIr(ir, selector);
  if (!node) {
    return {
      ir,
      diagnostics: [diagnostic("extractFragment", "ir-fragment-miss", `No node matched selector ${JSON.stringify(selector)}.`, { selector })],
    };
  }
  return {
    ir: fragmentDocumentFromNode(node),
    diagnostics: [diagnostic("extractFragment", "ir-fragment-extracted", `Extracted fragment for selector ${JSON.stringify(selector)}.`, { selector, nodePath: node.path })],
  };
}

function normalizeWhitespacePass(ir, passOptions = {}) {
  const normalized = normalizeIrWhitespace(ir, passOptions);
  return {
    ir: regenerateIrPaths(normalized),
    diagnostics: [diagnostic("normalizeWhitespace", "ir-whitespace-normalized", `Normalized text whitespace in ${passOptions.mode || "trim"} mode.`, {
      mode: passOptions.mode || "trim",
    })],
  };
}

function rewriteAttributesPass(ir, passOptions = {}) {
  const selector = passOptions.selector || "*";
  const rename = passOptions.rename || {};
  const remove = new Set(passOptions.remove || []);
  const setValues = passOptions.set || {};
  const targets = selector === "*" ? null : matchedPathKeys(ir, selector);
  let updates = 0;
  const next = cloneIr(ir);
  walkNodes(next.children, node => {
    if (node.kind !== "element") return;
    if (targets && !targets.has(pathKey(node.path))) return;
    let attrs = node.attributes.map(attr => {
      const renamedName = rename[attr.name] || attr.name;
      if (remove.has(renamedName)) {
        updates += 1;
        return null;
      }
      if (renamedName !== attr.name) updates += 1;
      return {
        ...attr,
        name: renamedName,
      };
    }).filter(Boolean);
    for (const [name, value] of Object.entries(setValues)) {
      const existing = attrs.find(attr => attr.name === name);
      if (existing) {
        if (existing.value !== value) {
          existing.value = value;
          existing.valueKind = "string";
          existing.quote = "\"";
          updates += 1;
        }
      } else {
        attrs.push({
          name,
          value,
          quote: "\"",
          valueKind: "string",
          source: null,
        });
        updates += 1;
      }
    }
    node.attributes = attrs;
  });
  return {
    ir: regenerateIrPaths(next),
    diagnostics: [diagnostic("rewriteAttributes", "ir-attributes-rewritten", `Rewrote ${updates} attribute change(s).`, {
      count: updates,
      selector,
    })],
  };
}

function splitDocumentShellPass(ir) {
  const htmlNode = ir.children.find(node => node.kind === "element" && node.tagName === "html");
  const bodyNode = htmlNode?.children.find(node => node.kind === "element" && node.tagName === "body") || null;
  if (!bodyNode) {
    return {
      ir,
      diagnostics: [diagnostic("splitDocumentShell", "ir-shell-skip", "No <html><body> shell was available to split.", {
        nodePath: htmlNode?.path || null,
      })],
    };
  }
  return {
    ir: regenerateIrPaths({
      ...ir,
      doctype: null,
      children: bodyNode.children.map(child => cloneIrSubtree(child)),
    }),
    diagnostics: [diagnostic("splitDocumentShell", "ir-shell-split", "Split the outer document shell and promoted <body> children to the document root.", {
      nodePath: bodyNode.path,
    })],
  };
}

function retargetElementTag(ir, fromTag, passName, passOptions = {}) {
  const selector = passOptions.selector || fromTag;
  const targetTag = passOptions.targetTag || "div";
  const attrName = passOptions.attrName || "data-retargeted-from";
  const keys = matchedPathKeys(ir, selector);
  let count = 0;
  const next = cloneIr(ir);
  walkNodes(next.children, node => {
    if (node.kind !== "element" || !keys.has(pathKey(node.path))) return;
    node.tagName = targetTag;
    if (!node.attributes.some(attr => attr.name === attrName)) {
      node.attributes.push({
        name: attrName,
        value: fromTag,
        quote: "\"",
        valueKind: "string",
        source: null,
      });
    }
    count += 1;
  });
  return {
    ir: regenerateIrPaths(next),
    diagnostics: [diagnostic(passName, `ir-${fromTag}-retargeted`, `Retargeted ${count} <${fromTag}> node(s) to <${targetTag}>.`, {
      count,
      selector,
      targetTag,
    })],
  };
}

function applyNamedPass(ir, pass) {
  const spec = typeof pass === "string" ? { name: pass } : pass;
  switch (spec.name) {
    case "dropComments":
      return dropCommentsPass(ir, spec);
    case "extractFragment":
      return extractFragmentPass(ir, spec);
    case "normalizeWhitespace":
      return normalizeWhitespacePass(ir, spec);
    case "rewriteAttributes":
      return rewriteAttributesPass(ir, spec);
    case "splitDocumentShell":
      return splitDocumentShellPass(ir, spec);
    case "retargetCanvas":
      return retargetElementTag(ir, "canvas", "retargetCanvas", spec);
    case "retargetSvg":
      return retargetElementTag(ir, "svg", "retargetSvg", spec);
    default:
      throw new Error(`Unknown IR transform pass: ${spec.name}`);
  }
}

export function transformIr(ir, passes, options = {}) {
  const sequence = Array.isArray(passes) ? passes : [passes];
  let current = cloneIr(ir);
  const diagnostics = [];
  for (const pass of sequence) {
    if (typeof pass === "function") {
      const result = pass(current, options);
      current = regenerateIrPaths(result.ir);
      diagnostics.push(...(result.diagnostics || []));
      continue;
    }
    const result = applyNamedPass(current, pass);
    current = result.ir;
    diagnostics.push(...result.diagnostics);
  }
  return {
    ir: current,
    diagnostics,
  };
}

export function collectQueryPaths(ir, selector) {
  return collectNodePaths(ir, selector);
}
