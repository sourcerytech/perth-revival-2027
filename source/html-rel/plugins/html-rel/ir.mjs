export const IR_VERSION = "html-ir/v1";

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function validatePath(value, path) {
  if (!Array.isArray(value)) fail(`${path} must be an array.`);
  value.forEach((entry, index) => {
    if (!Number.isInteger(entry) || entry < 0) fail(`${path}[${index}] must be a non-negative integer.`);
  });
}

function validateAttribute(attr, path) {
  if (!isPlainObject(attr)) fail(`${path} must be an object.`);
  if (typeof attr.name !== "string" || !attr.name) fail(`${path}.name must be a non-empty string.`);
  if (attr.value != null && typeof attr.value !== "string") fail(`${path}.value must be a string or null.`);
  if (attr.quote !== null && attr.quote !== "\"" && attr.quote !== "'") fail(`${path}.quote must be null, '\"', or \"'\".`);
  if (typeof attr.valueKind !== "string") fail(`${path}.valueKind must be a string.`);
}

function validateNode(node, path) {
  if (!isPlainObject(node)) fail(`${path} must be an object.`);
  if (typeof node.kind !== "string") fail(`${path}.kind must be a string.`);
  validatePath(node.path, `${path}.path`);
  switch (node.kind) {
    case "element":
      if (typeof node.tagName !== "string" || !node.tagName) fail(`${path}.tagName must be a non-empty string.`);
      if (!Array.isArray(node.attributes)) fail(`${path}.attributes must be an array.`);
      node.attributes.forEach((attr, index) => validateAttribute(attr, `${path}.attributes[${index}]`));
      if (!Array.isArray(node.children)) fail(`${path}.children must be an array.`);
      node.children.forEach((child, index) => validateNode(child, `${path}.children[${index}]`));
      return;
    case "text":
    case "comment":
    case "raw":
      if (typeof node.value !== "string") fail(`${path}.value must be a string.`);
      if (node.kind === "raw" && typeof node.mode !== "string") fail(`${path}.mode must be a string.`);
      return;
    default:
      fail(`${path}.kind ${JSON.stringify(node.kind)} is unsupported.`);
  }
}

function validateAuthoredRelSubject(subject, path) {
  if (!isPlainObject(subject)) fail(`${path} must be an object.`);
  if (subject.isa != null) {
    if (!Array.isArray(subject.isa)) fail(`${path}.isa must be an array when present.`);
    subject.isa.forEach((entry, index) => {
      if (typeof entry !== "string") fail(`${path}.isa[${index}] must be a string.`);
    });
  }
  if (subject.props != null) {
    if (!isPlainObject(subject.props)) fail(`${path}.props must be an object when present.`);
    for (const [predicate, values] of Object.entries(subject.props)) {
      if (!predicate) fail(`${path}.props keys must be non-empty.`);
      if (!Array.isArray(values)) fail(`${path}.props.${predicate} must be an array.`);
      values.forEach((value, index) => {
        if (typeof value !== "string") fail(`${path}.props.${predicate}[${index}] must be a string.`);
      });
    }
  }
  if (subject.nodePath != null) validatePath(subject.nodePath, `${path}.nodePath`);
  if (subject.ownerPath != null) validatePath(subject.ownerPath, `${path}.ownerPath`);
  if (subject.parentPath != null) validatePath(subject.parentPath, `${path}.parentPath`);
  if (subject.childPath != null) validatePath(subject.childPath, `${path}.childPath`);
  for (const key of ["ownerSubject", "parentSubject", "childSubject", "structuralKind"]) {
    if (subject[key] != null && typeof subject[key] !== "string") fail(`${path}.${key} must be a string when present.`);
  }
  if (subject.order != null && (!Number.isInteger(subject.order) || subject.order < 0)) {
    fail(`${path}.order must be a non-negative integer when present.`);
  }
}

function validateAuthoredRel(authoredRel) {
  if (!isPlainObject(authoredRel)) fail("IR authoredRel must be an object.");
  if (authoredRel.version != null && typeof authoredRel.version !== "string") fail("IR authoredRel.version must be a string when present.");
  if (typeof authoredRel.documentSubject !== "string" || !authoredRel.documentSubject) fail("IR authoredRel.documentSubject must be a non-empty string.");
  if (typeof authoredRel.rootSubject !== "string" || !authoredRel.rootSubject) fail("IR authoredRel.rootSubject must be a non-empty string.");
  if (!isPlainObject(authoredRel.subjects)) fail("IR authoredRel.subjects must be an object.");
  for (const [subject, value] of Object.entries(authoredRel.subjects)) {
    if (!subject) fail("IR authoredRel.subjects keys must be non-empty.");
    validateAuthoredRelSubject(value, `ir.authoredRel.subjects.${JSON.stringify(subject)}`);
  }
}

function validateMaterializedRepeatScope(entry, path) {
  if (!isPlainObject(entry)) fail(`${path} must be an object.`);
  for (const key of ["alias", "subject", "surface"]) {
    if (typeof entry[key] !== "string") fail(`${path}.${key} must be a string.`);
  }
}

function validateMaterializedEventArg(arg, path) {
  if (!isPlainObject(arg)) fail(`${path} must be an object.`);
  if (typeof arg.kind !== "string") fail(`${path}.kind must be a string.`);
  if (typeof arg.subject !== "string") fail(`${path}.subject must be a string.`);
  if (arg.kind === "value") return;
  if (arg.kind === "selectorValue") {
    if (typeof arg.selector !== "string") fail(`${path}.selector must be a string.`);
    if (typeof arg.property !== "string") fail(`${path}.property must be a string.`);
  }
}

function validateMaterializedEventBinding(binding, path) {
  if (!isPlainObject(binding)) fail(`${path} must be an object.`);
  if (typeof binding.subject !== "string") fail(`${path}.subject must be a string.`);
  if (typeof binding.type !== "string") fail(`${path}.type must be a string.`);
  if (typeof binding.command !== "string") fail(`${path}.command must be a string.`);
  if (typeof binding.action !== "string") fail(`${path}.action must be a string.`);
  if (binding.localAction !== null && !isPlainObject(binding.localAction)) fail(`${path}.localAction must be an object or null.`);
  if (!Array.isArray(binding.args)) fail(`${path}.args must be an array.`);
  binding.args.forEach((arg, index) => validateMaterializedEventArg(arg, `${path}.args[${index}]`));
}

function validateMaterializedNode(node, path) {
  if (!isPlainObject(node)) fail(`${path} must be an object.`);
  validatePath(node.path, `${path}.path`);
  if (typeof node.hydrationAddress !== "string") fail(`${path}.hydrationAddress must be a string.`);
  if (typeof node.tagName !== "string" || !node.tagName) fail(`${path}.tagName must be a non-empty string.`);
  if (typeof node.authoredNode !== "string") fail(`${path}.authoredNode must be a string.`);
  if (typeof node.namespace !== "string") fail(`${path}.namespace must be a string.`);
  if (!Array.isArray(node.repeatScope)) fail(`${path}.repeatScope must be an array.`);
  node.repeatScope.forEach((entry, index) => validateMaterializedRepeatScope(entry, `${path}.repeatScope[${index}]`));
  if (!isPlainObject(node.propModes)) fail(`${path}.propModes must be an object.`);
  for (const value of Object.values(node.propModes)) {
    if (typeof value !== "string") fail(`${path}.propModes values must be strings.`);
  }
  if (!Array.isArray(node.eventBindings)) fail(`${path}.eventBindings must be an array.`);
  node.eventBindings.forEach((binding, index) => validateMaterializedEventBinding(binding, `${path}.eventBindings[${index}]`));
  if (node.canvasMount !== null) {
    if (!isPlainObject(node.canvasMount)) fail(`${path}.canvasMount must be an object or null.`);
    if (typeof node.canvasMount.mountKind !== "string") fail(`${path}.canvasMount.mountKind must be a string.`);
    if (typeof node.canvasMount.mountDocument !== "string") fail(`${path}.canvasMount.mountDocument must be a string.`);
  }
  if (node.surfaceView !== null) {
    if (!isPlainObject(node.surfaceView)) fail(`${path}.surfaceView must be an object or null.`);
    if (typeof node.surfaceView.subject !== "string") fail(`${path}.surfaceView.subject must be a string.`);
  }
}

function validateMaterializedRel(materializedRel) {
  if (!isPlainObject(materializedRel)) fail("IR materializedRel must be an object.");
  if (materializedRel.version != null && typeof materializedRel.version !== "string") fail("IR materializedRel.version must be a string when present.");
  if (typeof materializedRel.documentSubject !== "string" || !materializedRel.documentSubject) fail("IR materializedRel.documentSubject must be a non-empty string.");
  if (typeof materializedRel.rootSubject !== "string" || !materializedRel.rootSubject) fail("IR materializedRel.rootSubject must be a non-empty string.");
  if (!Array.isArray(materializedRel.nodes)) fail("IR materializedRel.nodes must be an array.");
  materializedRel.nodes.forEach((node, index) => validateMaterializedNode(node, `ir.materializedRel.nodes[${index}]`));
}

export function validateIrDocument(ir) {
  if (!isPlainObject(ir)) fail("IR document must be an object.");
  if (ir.version !== IR_VERSION) fail(`IR version must be ${IR_VERSION}.`);
  if (ir.kind !== "document") fail("IR root kind must be \"document\".");
  if (!Array.isArray(ir.children)) fail("IR document children must be an array.");
  if (ir.doctype != null) {
    if (!isPlainObject(ir.doctype)) fail("IR doctype must be an object or null.");
    if (typeof ir.doctype.name !== "string") fail("IR doctype.name must be a string.");
    if (typeof ir.doctype.publicId !== "string") fail("IR doctype.publicId must be a string.");
    if (typeof ir.doctype.systemId !== "string") fail("IR doctype.systemId must be a string.");
  }
  if (ir.authoredRel != null) validateAuthoredRel(ir.authoredRel);
  if (ir.materializedRel != null) validateMaterializedRel(ir.materializedRel);
  ir.children.forEach((child, index) => validateNode(child, `ir.children[${index}]`));
  return ir;
}

export function cloneIr(ir) {
  return deserializeIr(serializeIr(ir));
}

export function serializeIr(ir, options = {}) {
  validateIrDocument(ir);
  const space = options.pretty ? 2 : 0;
  return JSON.stringify(ir, null, space);
}

export function deserializeIr(serialized) {
  const ir = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
  return validateIrDocument(ir);
}
