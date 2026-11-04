import { validateIrDocument } from "./ir.mjs";

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

function escapeText(value) {
  return String(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/gu, "&quot;");
}

function emitAttribute(attr) {
  if (attr.value == null && attr.valueKind === "boolean") return attr.name;
  return `${attr.name}="${escapeAttribute(attr.value ?? "")}"`;
}

function emitNode(node) {
  switch (node.kind) {
    case "text":
      return escapeText(node.value);
    case "comment":
      return `<!--${node.value}-->`;
    case "raw":
      return node.value;
    case "element":
      return emitElement(node);
    default:
      throw new Error(`Unsupported IR node kind ${JSON.stringify(node.kind)}.`);
  }
}

function emitElement(node) {
  const attrs = node.attributes.length ? ` ${node.attributes.map(emitAttribute).join(" ")}` : "";
  const startTag = `<${node.tagName}${attrs}>`;
  if (VOID_TAGS.has(node.tagName)) return startTag;
  const children = node.children.map(child => {
    if (child.kind === "raw" && !RAW_TEXT_TAGS.has(node.tagName)) return escapeText(child.value);
    return emitNode(child);
  }).join("");
  return `${startTag}${children}</${node.tagName}>`;
}

export function emitHtmlFromIr(ir) {
  validateIrDocument(ir);
  const parts = [];
  if (ir.doctype) parts.push(`<!DOCTYPE ${ir.doctype.name}>`);
  parts.push(...ir.children.map(emitNode));
  return parts.join("");
}
