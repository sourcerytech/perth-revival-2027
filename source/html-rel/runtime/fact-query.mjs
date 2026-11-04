import { FactStore, parse, parseBinary, parseS, parseRawFacts, project, serialize, serializeBinary, serializeS } from "../core/rel-core.mjs";

const EMPTY_ARRAY = Object.freeze([]);
const SOURCE = Symbol("temple2.factQuery.source");

function isVariable(term) {
  return typeof term === "string" && term.startsWith("$");
}

function variableName(term) {
  return term.endsWith("?") ? term.slice(1, -1) : term.slice(1);
}

function isOptionalVariable(term) {
  return isVariable(term) && term.endsWith("?");
}

function sourceFacts(source = []) {
  if (source?.[SOURCE]) return source[SOURCE].toArray();
  if (source instanceof FactStore) return source.toArray();
  if (typeof source?.toArray === "function") return source.toArray();
  if (typeof source?.snapshot === "function") return source.snapshot()?.facts || EMPTY_ARRAY;
  if (typeof source?.allFacts === "function") return source.allFacts();
  if (Array.isArray(source?.facts)) return source.facts;
  return source || EMPTY_ARRAY;
}

function storeFrom(source = []) {
  if (source?.[SOURCE]) return source[SOURCE];
  return source instanceof FactStore ? source : FactStore.from(sourceFacts(source));
}

function normalizePattern(pattern) {
  if (Array.isArray(pattern)) {
    const [s, p, o] = pattern;
    return { s, p, o, pol: undefined };
  }
  if (pattern && typeof pattern === "object") {
    return {
      s: pattern.s,
      p: pattern.p,
      o: pattern.o,
      pol: pattern.pol,
    };
  }
  throw new Error("Fact query where clauses must be [subject, predicate, object] patterns or fact-like objects.");
}

function isOptionalPattern(pattern) {
  return [pattern.s, pattern.p, pattern.o].some(isOptionalVariable);
}

function activeFactsFrom(source = []) {
  const state = new Map();
  for (const entry of storeFrom(source)) {
    const key = `${entry.s}\u001f${entry.p}\u001f${entry.o}`;
    state.set(key, entry);
  }
  return [...state.values()].filter(entry => (entry.pol || "is") !== "is-not");
}

function factCandidates(source, mode) {
  return mode === "history" ? storeFrom(source).toArray() : activeFactsFrom(source);
}

function matchTerm(term, value, binding) {
  if (!isVariable(term)) return term === undefined || String(value) === String(term) ? binding : null;
  const name = variableName(term);
  if (Object.hasOwn(binding, name)) return binding[name] === value ? binding : null;
  return { ...binding, [name]: value };
}

function matchPattern(pattern, candidate, binding) {
  let next = matchTerm(pattern.s, candidate.s, binding);
  if (!next) return null;
  next = matchTerm(pattern.p, candidate.p, next);
  if (!next) return null;
  next = matchTerm(pattern.o, candidate.o, next);
  if (!next) return null;
  if (pattern.pol !== undefined && (candidate.pol || "is") !== pattern.pol) return null;
  return next;
}

function applyPattern(bindings, candidates, pattern) {
  const out = [];
  for (const binding of bindings) {
    const before = out.length;
    for (const candidate of candidates) {
      const matched = matchPattern(pattern, candidate, binding);
      if (matched) out.push(matched);
    }
    if (before === out.length && isOptionalPattern(pattern)) out.push(binding);
  }
  return out;
}

function normalizeOrder(orderBy = []) {
  const fields = Array.isArray(orderBy) ? orderBy : [orderBy];
  return fields
    .map(field => {
      if (typeof field === "string") return { field: field.startsWith("$") ? field.slice(1) : field, direction: "asc" };
      if (!field || typeof field !== "object") return null;
      return {
        field: String(field.field || field.name || "").replace(/^\$/, ""),
        direction: field.direction === "desc" ? "desc" : "asc",
      };
    })
    .filter(field => field?.field);
}

function projectBinding(binding, select) {
  if (select == null) return Object.freeze({ ...binding });
  if (typeof select === "string") return binding[select.replace(/^\$/, "")];
  if (Array.isArray(select)) {
    const row = {};
    for (const field of select) row[String(field).replace(/^\$/, "")] = binding[String(field).replace(/^\$/, "")];
    return Object.freeze(row);
  }
  if (select && typeof select === "object") {
    const row = {};
    for (const [key, value] of Object.entries(select)) row[key] = binding[String(value).replace(/^\$/, "")];
    return Object.freeze(row);
  }
  return Object.freeze({ ...binding });
}

function querySource(source, options = {}) {
  const where = options.where || [];
  const patterns = Array.isArray(where) && where.length === 3 && !Array.isArray(where[0]) && typeof where[0] !== "object"
    ? [where]
    : (where?.s || where?.p || where?.o)
      ? [where]
      : where;
  const candidates = factCandidates(source, options.mode || "active");
  let bindings = [Object.freeze({})];
  for (const pattern of patterns.map(normalizePattern)) {
    bindings = applyPattern(bindings, candidates, pattern);
    if (!bindings.length) break;
  }
  const order = normalizeOrder(options.orderBy);
  if (order.length) {
    bindings = [...bindings].sort((left, right) => {
      for (const { field, direction } of order) {
        const compared = String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
        if (compared) return direction === "desc" ? -compared : compared;
      }
      return 0;
    });
  }
  if (Number.isFinite(options.limit)) bindings = bindings.slice(0, Math.max(0, Number(options.limit)));
  return Object.freeze(bindings.map(binding => projectBinding(binding, options.select)));
}

class FactView {
  constructor(source = []) {
    this[SOURCE] = storeFrom(source);
  }

  get size() {
    return this[SOURCE].size;
  }

  get length() {
    return this.size;
  }

  [Symbol.iterator]() {
    return this.toArray()[Symbol.iterator]();
  }

  find(predicate, thisArg) {
    return this.toArray().find(predicate, thisArg);
  }

  some(predicate, thisArg) {
    return this.toArray().some(predicate, thisArg);
  }

  map(callback, thisArg) {
    return this.toArray().map(callback, thisArg);
  }

  filter(predicate, thisArg) {
    return this.toArray().filter(predicate, thisArg);
  }

  flatMap(callback, thisArg) {
    return this.toArray().flatMap(callback, thisArg);
  }

  query(options = {}) {
    return querySource(this[SOURCE], options);
  }

  one(subject, predicate) {
    return this[SOURCE].one(subject, predicate);
  }

  many(subject, predicate) {
    return this[SOURCE].objects(subject, predicate);
  }

  activeMany(subject, predicate) {
    return this[SOURCE].activeObjects(subject, predicate);
  }

  subjectsOfType(type) {
    return this[SOURCE].things(type);
  }

  hasType(subject, type) {
    return this[SOURCE].activeTypes(subject).includes(type);
  }

  factsForSubject(subject) {
    return this[SOURCE].factsForSubject(subject);
  }

  factsForPredicate(predicate) {
    return this[SOURCE].factsForPredicate(predicate);
  }

  factsForObject(object) {
    return this[SOURCE].factsForObject(object);
  }

  factsForSubjectPredicate(subject, predicate) {
    return this[SOURCE].factsForSubjectPredicate(subject, predicate);
  }

  toArray() {
    return this[SOURCE].toArray();
  }

  projection() {
    return projectionFromFacts(this[SOURCE]);
  }

  dump() {
    return this.projection();
  }

  serialize() {
    return serializeFacts(this[SOURCE]);
  }

  objects(subject, predicate) {
    return this.many(subject, predicate);
  }

  activeObjects(subject, predicate) {
    return this.activeMany(subject, predicate);
  }

  subjects(predicate, object) {
    return this[SOURCE].subjects(predicate, object);
  }

  predicates(subject, object) {
    return this[SOURCE].predicates(subject, object);
  }

  things(type) {
    return this.subjectsOfType(type);
  }

  activeTypes(subject) {
    return this[SOURCE].activeTypes(subject);
  }

  has(subject, predicate, object) {
    return this[SOURCE].has(subject, predicate, object);
  }

  hasActive(subject, predicate, object) {
    return this[SOURCE].hasActive(subject, predicate, object);
  }

  distinctSubjects(predicate, object) {
    if (predicate === "isa") return this.subjectsOfType(object);
    return this[SOURCE].distinctSubjects(predicate, object);
  }

  distinctObjects(subject, predicate) {
    return this[SOURCE].distinctObjects(subject, predicate);
  }

  distinctPredicates(subject, object) {
    return this[SOURCE].distinctPredicates(subject, object);
  }

  distinctActiveObjects(subject, predicate) {
    return this[SOURCE].distinctActiveObjects(subject, predicate);
  }

  distinctActiveSubjects(predicate, object) {
    return this[SOURCE].distinctActiveSubjects(predicate, object);
  }

  distinctActivePredicates(subject, object) {
    return this[SOURCE].distinctActivePredicates(subject, object);
  }
}

class FactBuffer extends FactView {
  constructor(source = []) {
    super(FactStore.from(sourceFacts(source)));
  }

  append(factToAppend) {
    this[SOURCE].append(normalizeFactInput(factToAppend));
    return this;
  }

  appendMany(source = []) {
    this[SOURCE].appendMany([...sourceFacts(source)].map(normalizeFactInput));
    return this;
  }

  replaceAll(source = []) {
    this[SOURCE].replaceAll([...sourceFacts(source)].map(normalizeFactInput));
    return this;
  }

  fork() {
    return new FactBuffer(this[SOURCE].fork());
  }

  serialize() {
    return serializeFacts(this[SOURCE]);
  }
}

export const fact = Object.freeze({
  is(s, p, o, metadata = {}) {
    return Object.freeze({ s: String(s), p: String(p), o: String(o), pol: "is", ...metadata });
  },
  not(s, p, o, metadata = {}) {
    return Object.freeze({ s: String(s), p: String(p), o: String(o), pol: "is-not", ...metadata });
  },
});

function normalizeFactInput(entry) {
  return {
    ...(entry || {}),
    s: String(entry?.s ?? ""),
    p: String(entry?.p ?? ""),
    o: String(entry?.o ?? ""),
    pol: String(entry?.pol || "is"),
  };
}

export function plainFact(entry) {
  return {
    s: String(entry?.s ?? ""),
    p: String(entry?.p ?? ""),
    o: String(entry?.o ?? ""),
    pol: String(entry?.pol || "is"),
  };
}

export function parseRel(text, meta = {}) {
  return factBuffer(parse(text, meta));
}

export function parseRelS(text, meta = {}) {
  return factBuffer(parseS(text, meta));
}

export function parseRelBinary(source, meta = {}) {
  return factBuffer(parseBinary(source, meta));
}

export function parseRawRel(text, meta = {}) {
  return Object.freeze(parseRawFacts(text, meta));
}

export function serializeFacts(source = []) {
  return serialize(sourceFacts(source));
}

export function serializeFactsS(source = []) {
  return serializeS(sourceFacts(source));
}

export function serializeFactsBinary(source = []) {
  return serializeBinary(sourceFacts(source));
}

export function projectionFromFacts(source = []) {
  return project(sourceFacts(source)).dump();
}

export function facts(source = []) {
  return new FactView(source);
}

export function factView(source = []) {
  return facts(source);
}

export function factBuffer(source = []) {
  return new FactBuffer(source);
}

export function mutableFacts(source = []) {
  return factBuffer(source);
}

export function concatFacts(...sources) {
  const buffer = factBuffer();
  for (const source of sources) buffer.appendMany(source || []);
  return buffer;
}

export function factsArray(source = []) {
  return facts(source).toArray();
}
