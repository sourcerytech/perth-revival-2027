import { IR_VERSION } from "./ir.mjs";

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

function lower(value) {
  return String(value || "").toLowerCase();
}

function eof(context) {
  return context.index >= context.html.length;
}

function startsWith(context, value) {
  return context.html.startsWith(value, context.index);
}

function currentChar(context) {
  return context.html[context.index];
}

function advance(context, count = 1) {
  context.index += count;
}

function skipWhitespace(context) {
  while (!eof(context) && /\s/.test(currentChar(context))) advance(context);
}

function readWhile(context, predicate) {
  const start = context.index;
  while (!eof(context) && predicate(currentChar(context))) advance(context);
  return context.html.slice(start, context.index);
}

function makeLocation(start, end) {
  return { start, end };
}

function makePath(parentPath, index) {
  return [...parentPath, index];
}

function createElement(tagName, path, attributes = [], source = null) {
  return {
    kind: "element",
    tagName: lower(tagName),
    attributes,
    children: [],
    path,
    source,
  };
}

function createLeaf(kind, value, path, extra = {}, source = null) {
  return {
    kind,
    value,
    path,
    source,
    ...extra,
  };
}

function readTagName(context) {
  return readWhile(context, char => /[A-Za-z0-9:_-]/.test(char));
}

function readAttribute(context) {
  skipWhitespace(context);
  const start = context.index;
  const name = readWhile(context, char => /[^\s=/>]/.test(char));
  if (!name) return null;
  skipWhitespace(context);
  let value = null;
  let quote = null;
  let valueKind = "boolean";
  if (currentChar(context) === "=") {
    advance(context);
    skipWhitespace(context);
    valueKind = "string";
    const quoteChar = currentChar(context);
    if (quoteChar === "\"" || quoteChar === "'") {
      quote = quoteChar;
      advance(context);
      const valueStart = context.index;
      while (!eof(context) && currentChar(context) !== quoteChar) advance(context);
      value = context.html.slice(valueStart, context.index);
      if (currentChar(context) === quoteChar) advance(context);
    } else {
      value = readWhile(context, char => /[^\s>]/.test(char));
    }
  }
  return {
    name,
    value,
    quote,
    valueKind,
    source: makeLocation(start, context.index),
  };
}

function readComment(context, parentPath, childIndex) {
  const start = context.index;
  advance(context, 4);
  const endIndex = context.html.indexOf("-->", context.index);
  const stop = endIndex === -1 ? context.html.length : endIndex;
  const value = context.html.slice(context.index, stop);
  context.index = endIndex === -1 ? context.html.length : endIndex + 3;
  return createLeaf("comment", value, makePath(parentPath, childIndex), {}, makeLocation(start, context.index));
}

function readDoctype(context) {
  const start = context.index;
  advance(context, 2);
  const value = readWhile(context, char => char !== ">");
  if (currentChar(context) === ">") advance(context);
  const trimmed = value.trim();
  const name = trimmed.replace(/^doctype\s+/i, "").split(/\s+/)[0] || "html";
  return {
    name: lower(name),
    publicId: "",
    systemId: "",
    source: makeLocation(start, context.index),
  };
}

function readTextNode(context, parentPath, childIndex, stopTag = null) {
  const start = context.index;
  while (!eof(context)) {
    if (startsWith(context, "<")) break;
    if (stopTag && startsWith(context, `</${stopTag}`)) break;
    advance(context);
  }
  return createLeaf("text", context.html.slice(start, context.index), makePath(parentPath, childIndex), {}, makeLocation(start, context.index));
}

function readRawTextNode(context, parentPath, childIndex, tagName) {
  const start = context.index;
  const endToken = `</${tagName}`;
  const lowerHtml = context.html.toLowerCase();
  const endIndex = lowerHtml.indexOf(endToken, context.index);
  const stop = endIndex === -1 ? context.html.length : endIndex;
  context.index = stop;
  return createLeaf("raw", context.html.slice(start, stop), makePath(parentPath, childIndex), { mode: tagName }, makeLocation(start, stop));
}

function parseChildren(context, parentElement, stopTag = null) {
  while (!eof(context)) {
    if (startsWith(context, "<!--")) {
      parentElement.children.push(readComment(context, parentElement.path, parentElement.children.length));
      continue;
    }
    if (startsWith(context, "</")) {
      const closeStart = context.index;
      advance(context, 2);
      skipWhitespace(context);
      const closeTag = lower(readTagName(context));
      readWhile(context, char => char !== ">");
      if (currentChar(context) === ">") advance(context);
      if (!stopTag) continue;
      if (closeTag !== stopTag) {
        throw new Error(`Unexpected closing tag </${closeTag}> at offset ${closeStart}; expected </${stopTag}>.`);
      }
      return;
    }
    if (startsWith(context, "<!DOCTYPE") || startsWith(context, "<!doctype")) {
      throw new Error("DOCTYPE is only valid at the document root.");
    }
    if (startsWith(context, "<")) {
      parentElement.children.push(readElement(context, parentElement.path, parentElement.children.length));
      continue;
    }
    const text = stopTag && RAW_TEXT_TAGS.has(stopTag)
      ? readRawTextNode(context, parentElement.path, parentElement.children.length, stopTag)
      : readTextNode(context, parentElement.path, parentElement.children.length, stopTag);
    if (text.value) parentElement.children.push(text);
  }
  if (stopTag) throw new Error(`Missing closing tag </${stopTag}>.`);
}

function readElement(context, parentPath, childIndex) {
  const start = context.index;
  advance(context);
  const tagName = readTagName(context);
  if (!tagName) throw new Error(`Expected tag name at offset ${start}.`);
  const attributes = [];
  let selfClosing = false;
  while (!eof(context)) {
    skipWhitespace(context);
    if (startsWith(context, "/>")) {
      selfClosing = true;
      advance(context, 2);
      break;
    }
    if (currentChar(context) === ">") {
      advance(context);
      break;
    }
    const attr = readAttribute(context);
    if (!attr) throw new Error(`Malformed attribute on <${tagName}> at offset ${context.index}.`);
    attributes.push(attr);
  }
  const element = createElement(tagName, makePath(parentPath, childIndex), attributes, makeLocation(start, context.index));
  const loweredTag = lower(tagName);
  if (selfClosing || VOID_TAGS.has(loweredTag)) return element;
  if (RAW_TEXT_TAGS.has(loweredTag)) {
    const rawChild = readRawTextNode(context, element.path, 0, loweredTag);
    if (rawChild.value) element.children.push(rawChild);
    if (context.html.toLowerCase().startsWith(`</${loweredTag}`, context.index)) {
      advance(context, 2);
      readTagName(context);
      readWhile(context, char => char !== ">");
      if (currentChar(context) === ">") advance(context);
      element.source = makeLocation(start, context.index);
      return element;
    }
    throw new Error(`Missing closing tag </${loweredTag}>.`);
  }
  parseChildren(context, element, loweredTag);
  element.source = makeLocation(start, context.index);
  return element;
}

export function parseHtmlToIr(html, options = {}) {
  const context = {
    html: String(html),
    index: 0,
    file: options.file || "",
  };
  const document = {
    version: IR_VERSION,
    kind: "document",
    doctype: null,
    children: [],
    source: {
      file: context.file,
      length: context.html.length,
    },
  };
  while (!eof(context)) {
    if (startsWith(context, "<!--")) {
      document.children.push(readComment(context, [], document.children.length));
      continue;
    }
    if (startsWith(context, "<!DOCTYPE") || startsWith(context, "<!doctype")) {
      if (document.doctype) throw new Error("Only one DOCTYPE is allowed per document.");
      document.doctype = readDoctype(context);
      continue;
    }
    if (startsWith(context, "<")) {
      document.children.push(readElement(context, [], document.children.length));
      continue;
    }
    const text = readTextNode(context, [], document.children.length);
    if (text.value) document.children.push(text);
  }
  return document;
}

export function parseHtmlFragmentToIr(html, options = {}) {
  const document = parseHtmlToIr(html, options);
  return {
    ...document,
    doctype: null,
  };
}
