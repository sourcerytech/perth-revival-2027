import { facts, parseRel } from "../../runtime/fact-query.mjs";
import { regenerateIrPaths } from "./transforms.mjs";

const REL_AUTHORED_VERSION = "rel-authored-dom/v1";
const ROOT_NODE_TYPES = new Set(["DomNode", "DomCanvas", "DomText", "DomComment"]);
const STRUCTURAL_TYPES = new Set(["DomNode", "DomCanvas", "DomText", "DomComment"]);
const REF_PREDICATES = new Set([
  "root",
  "textExpr",
  "when",
  "repeat",
  "surfaceView",
  "mountDocument",
  "valueExpr",
  "command",
  "action",
  "left",
  "right",
  "condition",
  "then",
  "else",
  "expr",
  "value",
  "node",
  "parent",
  "child",
  "event",
]);

function diag(severity, code, message, extra = {}) {
  return {
    severity,
    code,
    message,
    ...extra,
  };
}

function firstFactIndexMap(facts) {
  const indexes = new Map();
  facts.forEach((fact, index) => {
    if (!indexes.has(fact.s)) indexes.set(fact.s, index);
  });
  return indexes;
}

function activeFactsForSubject(store, subject) {
  return store.factsForSubject(subject).filter(fact => fact.pol !== "is-not");
}

function propsForSubject(store, subject) {
  const props = {};
  for (const fact of activeFactsForSubject(store, subject)) {
    if (fact.p === "isa") continue;
    (props[fact.p] ||= []).push(fact.o);
  }
  return props;
}

function parseOrder(subject, rawOrder, diagnostics, firstFact) {
  if (rawOrder == null) {
    diagnostics.push(diag("error", "rel-ir-missing-order", `DomChild ${subject} is missing order.`, {
      subject,
      predicate: "order",
      source: firstFact || null,
    }));
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Number.parseInt(rawOrder, 10);
  if (!Number.isInteger(parsed)) {
    diagnostics.push(diag("error", "rel-ir-invalid-order", `DomChild ${subject} has invalid order ${JSON.stringify(rawOrder)}.`, {
      subject,
      predicate: "order",
      source: firstFact || null,
      value: rawOrder,
    }));
    return Number.POSITIVE_INFINITY;
  }
  return parsed;
}

function selectDocumentSubject(store, options, diagnostics) {
  const documents = [...store.distinctSubjects("isa", "DomDocument")];
  if (options.documentSubject) {
    if (!documents.includes(options.documentSubject)) {
      diagnostics.push(diag("error", "rel-ir-unknown-document", `Unknown DomDocument subject ${JSON.stringify(options.documentSubject)}.`, {
        subject: options.documentSubject,
        candidates: documents,
      }));
      return null;
    }
    return options.documentSubject;
  }
  if (!documents.length) {
    diagnostics.push(diag("error", "rel-ir-missing-document", "REL source has no DomDocument subject."));
    return null;
  }
  if (documents.length > 1) {
    diagnostics.push(diag("error", "rel-ir-multi-document", `REL source has ${documents.length} DomDocument subjects; choose one explicitly.`, {
      candidates: documents,
    }));
    return null;
  }
  return documents[0];
}

function selectStructuralType(store, subject, diagnostics) {
  const types = [...store.activeTypes(subject)].filter(type => STRUCTURAL_TYPES.has(type));
  if (!types.length) {
    diagnostics.push(diag("error", "rel-ir-unknown-structural-subject", `Subject ${subject} is not a supported structural DOM subject.`, {
      subject,
      types: [...store.activeTypes(subject)],
    }));
    return null;
  }
  if (types.length > 1) {
    diagnostics.push(diag("error", "rel-ir-ambiguous-structural-subject", `Subject ${subject} declares multiple structural DOM types: ${types.join(", ")}.`, {
      subject,
      types,
    }));
    return null;
  }
  return types[0];
}

function buildAttribute(store, subject, ownerSubject, ownerPath, diagnostics) {
  const firstFact = store.factsForSubject(subject)[0] || null;
  if (!store.activeTypes(subject).includes("DomAttr")) return null;
  const boundNode = store.one(subject, "node");
  if (boundNode !== ownerSubject) return null;
  const name = store.one(subject, "name");
  if (!name) {
    diagnostics.push(diag("error", "rel-ir-missing-attr-name", `DomAttr ${subject} is missing name.`, {
      subject,
      predicate: "name",
      source: firstFact,
    }));
    return null;
  }
  const value = store.one(subject, "value");
  const valueExpr = store.one(subject, "valueExpr");
  const renderMode = store.one(subject, "renderMode");
  if (value == null && valueExpr == null) {
    diagnostics.push(diag("error", "rel-ir-missing-attr-value", `DomAttr ${subject} must define value or valueExpr.`, {
      subject,
      predicate: "value",
      source: firstFact,
    }));
    return null;
  }
  if (value != null && valueExpr != null) {
    diagnostics.push(diag("warning", "rel-ir-attr-literal-and-expr", `DomAttr ${subject} defines both value and valueExpr; using literal value structurally and preserving valueExpr in authoredRel.`, {
      subject,
      source: firstFact,
    }));
  }
  if (valueExpr != null && value == null) {
    diagnostics.push(diag("info", "rel-ir-preserved-attr-expr", `DomAttr ${subject} uses valueExpr and cannot be represented faithfully in canonical HTML.`, {
      subject,
      predicate: "valueExpr",
      source: firstFact,
    }));
  }
  const attributeValue = value != null
    ? value
    : renderMode === "booleanPresence"
      ? null
      : "";
  return {
    subject,
    ownerSubject,
    ownerPath,
    attribute: {
      name,
      value: attributeValue,
      quote: attributeValue == null ? null : "\"",
      valueKind: renderMode === "booleanPresence" ? "boolean" : "string",
      source: null,
    },
  };
}

function buildLeafNode(kind, store, subject, diagnostics) {
  const value = store.one(subject, "text");
  const firstFact = store.factsForSubject(subject)[0] || null;
  if (value == null) {
    diagnostics.push(diag("error", "rel-ir-missing-text", `${kind === "text" ? "DomText" : "DomComment"} ${subject} is missing text.`, {
      subject,
      predicate: "text",
      source: firstFact,
    }));
    return null;
  }
  return {
    kind,
    value,
    path: [],
    source: null,
  };
}

function structuralChildEdges(store, parentSubject, firstIndex) {
  return [...store.distinctSubjects("parent", parentSubject)]
    .filter(subject => store.activeTypes(subject).includes("DomChild"))
    .sort((left, right) => (firstIndex.get(left) || 0) - (firstIndex.get(right) || 0));
}

function attrsForNode(store, nodeSubject, firstIndex) {
  return [...store.distinctSubjects("node", nodeSubject)]
    .filter(subject => store.activeTypes(subject).includes("DomAttr"))
    .sort((left, right) => (firstIndex.get(left) || 0) - (firstIndex.get(right) || 0));
}

function buildStructuralNode(store, subject, context) {
  const { diagnostics, firstIndex, visiting } = context;
  const firstFact = store.factsForSubject(subject)[0] || null;
  if (visiting.has(subject)) {
    diagnostics.push(diag("error", "rel-ir-child-cycle", `REL DOM child graph contains a cycle at ${subject}.`, {
      subject,
      source: firstFact,
    }));
    return null;
  }
  const structuralType = selectStructuralType(store, subject, diagnostics);
  if (!structuralType) return null;
  if (structuralType === "DomText") return buildLeafNode("text", store, subject, diagnostics);
  if (structuralType === "DomComment") return buildLeafNode("comment", store, subject, diagnostics);

  visiting.add(subject);
  const tagName = structuralType === "DomCanvas" ? "canvas" : store.one(subject, "tag");
  if (!tagName) {
    diagnostics.push(diag("error", "rel-ir-missing-tag", `${structuralType} ${subject} is missing tag.`, {
      subject,
      predicate: "tag",
      source: firstFact,
    }));
    visiting.delete(subject);
    return null;
  }

  const attributeRecords = attrsForNode(store, subject, firstIndex)
    .map(attrSubject => buildAttribute(store, attrSubject, subject, [], diagnostics))
    .filter(Boolean);
  const children = [];
  const edges = structuralChildEdges(store, subject, firstIndex);
  const seenOrders = new Map();
  for (const edgeSubject of edges) {
    const order = parseOrder(edgeSubject, store.one(edgeSubject, "order"), diagnostics, store.factsForSubject(edgeSubject)[0] || null);
    const childSubject = store.one(edgeSubject, "child");
    if (!childSubject) {
      diagnostics.push(diag("error", "rel-ir-missing-child-ref", `DomChild ${edgeSubject} is missing child.`, {
        subject: edgeSubject,
        predicate: "child",
        source: store.factsForSubject(edgeSubject)[0] || null,
      }));
      continue;
    }
    if (seenOrders.has(order)) {
      diagnostics.push(diag("warning", "rel-ir-duplicate-child-order", `Parent ${subject} has multiple DomChild edges with order ${order}.`, {
        subject,
        edgeSubject,
        previousEdgeSubject: seenOrders.get(order),
        order,
      }));
    } else {
      seenOrders.set(order, edgeSubject);
    }
    const childNode = buildStructuralNode(store, childSubject, context);
    if (!childNode) continue;
    children.push({
      edgeSubject,
      order,
      childSubject,
      node: childNode,
    });
  }

  const literalText = store.one(subject, "text");
  const textExpr = store.one(subject, "textExpr");
  if (literalText != null) {
    if (children.length) {
      diagnostics.push(diag("warning", "rel-ir-node-text-conflict", `DomNode ${subject} has literal text plus ordered children; omitting literal text from structural IR and preserving it in authoredRel.`, {
        subject,
        predicate: "text",
        source: firstFact,
      }));
    } else {
      children.push({
        edgeSubject: null,
        order: 0,
        childSubject: null,
        node: {
          kind: "text",
          value: literalText,
          path: [],
          source: null,
        },
      });
    }
  }
  if (textExpr != null) {
    diagnostics.push(diag("info", "rel-ir-preserved-text-expr", `DomNode ${subject} uses textExpr and cannot be emitted faithfully as canonical HTML.`, {
      subject,
      predicate: "textExpr",
      source: firstFact,
    }));
  }
  if (store.one(subject, "when") != null) {
    diagnostics.push(diag("info", "rel-ir-preserved-when", `DomNode ${subject} uses when and cannot be represented faithfully in canonical HTML.`, {
      subject,
      predicate: "when",
      source: firstFact,
    }));
  }
  if (store.one(subject, "repeat") != null) {
    diagnostics.push(diag("info", "rel-ir-preserved-repeat", `DomNode ${subject} uses repeat and cannot be represented faithfully in canonical HTML.`, {
      subject,
      predicate: "repeat",
      source: firstFact,
    }));
  }
  if (store.one(subject, "surfaceView") != null) {
    diagnostics.push(diag("info", "rel-ir-preserved-surface-view", `DomNode ${subject} uses surfaceView and cannot be represented faithfully in canonical HTML.`, {
      subject,
      predicate: "surfaceView",
      source: firstFact,
    }));
  }
  if (structuralType === "DomCanvas" && (store.one(subject, "mountKind") != null || store.one(subject, "mountDocument") != null)) {
    diagnostics.push(diag("info", "rel-ir-preserved-canvas-mount", `DomCanvas ${subject} carries mount metadata preserved only in authoredRel.`, {
      subject,
      source: firstFact,
    }));
  }

  children.sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    return (left.edgeSubject ? firstIndex.get(left.edgeSubject) || 0 : -1) - (right.edgeSubject ? firstIndex.get(right.edgeSubject) || 0 : -1);
  });

  const built = {
    kind: "element",
    tagName,
    attributes: attributeRecords.map(entry => entry.attribute),
    children: children.map(entry => entry.node),
    path: [],
    source: null,
  };
  visiting.delete(subject);
  return built;
}

function collectReachableSubjects(store, documentSubject, rootSubject) {
  const queue = [documentSubject, rootSubject];
  const seen = new Set();
  while (queue.length) {
    const subject = queue.shift();
    if (!subject || seen.has(subject)) continue;
    seen.add(subject);
    const types = store.activeTypes(subject);
    for (const fact of activeFactsForSubject(store, subject)) {
      if (REF_PREDICATES.has(fact.p)) queue.push(fact.o);
    }
    if (types.includes("DomNode") || types.includes("DomCanvas")) {
      for (const related of store.distinctSubjects("node", subject)) queue.push(related);
      for (const edge of store.distinctSubjects("parent", subject)) queue.push(edge);
    }
    if (types.includes("DomEvent")) {
      for (const arg of store.distinctSubjects("event", subject)) queue.push(arg);
    }
    if (types.includes("DomExpr")) {
      for (const arg of store.distinctSubjects("expr", subject)) queue.push(arg);
    }
  }
  return [...seen];
}

function attachNodePaths(ir, store, documentSubject, rootSubject, firstIndex) {
  const subjects = {};
  const queue = collectReachableSubjects(store, documentSubject, rootSubject);
  for (const subject of queue) {
    const isa = [...store.activeTypes(subject)];
    const props = propsForSubject(store, subject);
    const entry = {
      structuralKind: isa[0] || "",
      isa,
      props,
    };
    if (isa.includes("DomAttr")) {
      entry.ownerSubject = store.one(subject, "node") || "";
    }
    if (isa.includes("DomChild")) {
      entry.parentSubject = store.one(subject, "parent") || "";
      entry.childSubject = store.one(subject, "child") || "";
      const order = Number.parseInt(store.one(subject, "order") || "", 10);
      if (Number.isInteger(order)) entry.order = order;
    }
    if (isa.includes("DomEventArg")) {
      const order = Number.parseInt(store.one(subject, "order") || "", 10);
      if (Number.isInteger(order)) entry.order = order;
    }
    subjects[subject] = entry;
  }

  function walk(node, path, structuralSubject) {
    if (subjects[structuralSubject]) subjects[structuralSubject].nodePath = [...path];
    if (node.kind !== "element") return;
    for (const attrSubject of attrsForNode(store, structuralSubject, firstIndex)) {
      if (!subjects[attrSubject]) continue;
      subjects[attrSubject].ownerPath = [...path];
    }
    const childEdges = structuralChildEdges(store, structuralSubject, firstIndex)
      .map(edgeSubject => ({
        edgeSubject,
        order: Number.parseInt(store.one(edgeSubject, "order") || "", 10),
        childSubject: store.one(edgeSubject, "child") || "",
      }))
      .filter(entry => Number.isInteger(entry.order))
      .sort((left, right) => left.order - right.order || ((firstIndex.get(left.edgeSubject) || 0) - (firstIndex.get(right.edgeSubject) || 0)));

    let childIndex = 0;
    const literalText = store.one(structuralSubject, "text");
    const useLiteralText = literalText != null && !childEdges.length;
    if (useLiteralText && node.children[0]) {
      childIndex = 1;
    }
    childEdges.forEach(entry => {
      const childNode = node.children[childIndex];
      if (!childNode) return;
      const childPath = [...path, childIndex];
      if (subjects[entry.edgeSubject]) {
        subjects[entry.edgeSubject].parentPath = [...path];
        subjects[entry.edgeSubject].childPath = [...childPath];
      }
      walk(childNode, childPath, entry.childSubject);
      childIndex += 1;
    });
  }

  if (ir.children[0]) walk(ir.children[0], [0], rootSubject);
  return {
    version: REL_AUTHORED_VERSION,
    documentSubject,
    rootSubject,
    subjects,
  };
}

export function projectRelFactsToIr(source, options = {}) {
  const store = facts(source);
  const diagnostics = [];
  const documentSubject = selectDocumentSubject(store, options, diagnostics);
  if (!documentSubject) return { ir: null, diagnostics };
  const rootSubject = store.one(documentSubject, "root");
  if (!rootSubject) {
    diagnostics.push(diag("error", "rel-ir-missing-root", `DomDocument ${documentSubject} is missing root.`, {
      subject: documentSubject,
      predicate: "root",
      source: store.factsForSubject(documentSubject)[0] || null,
    }));
    return { ir: null, diagnostics };
  }
  const rootType = selectStructuralType(store, rootSubject, diagnostics);
  if (!rootType || !ROOT_NODE_TYPES.has(rootType)) return { ir: null, diagnostics };

  const firstIndex = firstFactIndexMap(store.toArray());
  const root = buildStructuralNode(store, rootSubject, {
    diagnostics,
    firstIndex,
    visiting: new Set(),
  });
  if (!root || diagnostics.some(entry => entry.severity === "error")) return { ir: null, diagnostics };

  const ir = regenerateIrPaths({
    version: "html-ir/v1",
    kind: "document",
    doctype: null,
    children: [root],
    source: { file: options.file || "" },
  });
  ir.authoredRel = attachNodePaths(ir, store, documentSubject, rootSubject, firstIndex);
  return { ir, diagnostics };
}

export function projectRelToIr(source, options = {}) {
  return projectRelFactsToIr(parseRel(String(source || ""), { file: options.file || "" }), options);
}
