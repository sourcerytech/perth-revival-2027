// Semantic page projection grammar for Perth Encounter.
//
// Input: authored semantic REL (Page, Section, ProcessStage, Principle).
// Output: authored DOM REL consumed by Claimipedia/Sourcery html-rel.
// This is deliberately a semantic adapter: it never parses HTML and never
// lowers an existing DOM back into REL.

import { parse, serialize } from "../html-rel/core/rel-core.mjs";
import { SEMANTIC_DOCUMENT_GRAMMAR } from "../claimipedia/semantic-page-contract.mjs";

const value = (facts, subject, predicate, fallback = "") => facts.find(f => f.s === subject && f.p === predicate && f.pol !== "is-not")?.o ?? fallback;
const values = (facts, subject, predicate) => facts.filter(f => f.s === subject && f.p === predicate && f.pol !== "is-not").map(f => f.o);
const subjectsOfType = (facts, type) => [...new Set(facts.filter(f => f.p === "isa" && f.o === type).map(f => f.s))];
const q = value => JSON.stringify(String(value));

export function projectSemanticPagesToDomRel(source, { file = "source/semantic/perth-encounter.rel" } = {}) {
  if (SEMANTIC_DOCUMENT_GRAMMAR.protocol !== "claimipedia-semantic-document-grammar/1") throw new Error("Claimipedia semantic document grammar is not the admitted grammar.");
  if (JSON.stringify(SEMANTIC_DOCUMENT_GRAMMAR.productions.Document) !== JSON.stringify(["SkipLink?", "SiteHeader", "Main", "SiteFooter?"])) throw new Error("Claimipedia document production drifted.");
  const semantic = parse(source, { file });
  const facts = [];
  let sequence = 0;
  const add = (s, p, o, pol = "is") => facts.push({ s, p, o, pol, file: "source/projection/semantic-page-to-dom-rel.mjs", line: ++sequence });
  const text = (parent, content, label = "text") => {
    const subject = `projection.text.${++sequence}.${label}`;
    add(subject, "isa", "DomText"); add(subject, "text", content); child(parent, subject);
  };
  const attr = (node, name, content, label = "attr") => {
    const subject = `projection.attr.${++sequence}.${label}`;
    add(subject, "isa", "DomAttr"); add(subject, "node", node); add(subject, "name", name); add(subject, "value", content);
  };
  const child = (parent, childSubject) => {
    const edge = `projection.edge.${++sequence}`;
    add(edge, "isa", "DomChild"); add(edge, "parent", parent); add(edge, "child", childSubject); add(edge, "order", String(sequence));
  };
  const el = (tag, attrs = {}, children = [], label = tag) => {
    const node = `projection.node.${++sequence}.${label}`;
    add(node, "isa", "DomNode"); add(node, "tag", tag);
    for (const [name, content] of Object.entries(attrs)) if (content != null) attr(node, name, content, name);
    for (const childNode of children) child(node, childNode);
    return node;
  };
  const paragraph = (parent, content, className = "") => {
    const node = el("p", className ? { class: className } : {}, [], "p"); text(node, content); child(parent, node);
  };
  const heading = (parent, level, content, id = "") => {
    const node = el(`h${level}`, id ? { id } : {}, [], `h${level}`); text(node, content); child(parent, node);
  };
  const link = (parent, href, label, className = "") => {
    const node = el("a", { href, ...(className ? { class: className } : {}) }, [], "link"); text(node, label); child(parent, node);
  };

  const site = subjectsOfType(semantic, "Site")[0];
  const navigation = values(semantic, site, "navigation");
  const pages = subjectsOfType(semantic, "Page");
  const pageByRoute = new Map(pages.map(page => [value(semantic, page, "route"), page]));

  for (const page of pages) {
    const route = value(semantic, page, "route");
    const role = value(semantic, page, "role");
    const document = `projection.document.${role}`;
    add(document, "isa", "DomDocument");
    const html = el("html", { lang: "en-AU" }, [], "html"); add(document, "root", html);
    const head = el("head", {}, [], "head"); child(html, head);
    const charset = el("meta", { charset: "utf-8" }, [], "charset"); child(head, charset);
    const viewport = el("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }, [], "viewport"); child(head, viewport);
    const description = value(semantic, page, "description");
    const descriptionMeta = el("meta", { name: "description", content: description }, [], "description"); child(head, descriptionMeta);
    const title = value(semantic, page, "title");
    const titleNode = el("title", {}, [], "title"); text(titleNode, title); child(head, titleNode);
    const icon = el("link", { rel: "icon", href: "assets/favicon.svg", type: "image/svg+xml" }, [], "icon"); child(head, icon);
    const stylesheet = el("link", { rel: "stylesheet", href: "styles.css" }, [], "stylesheet"); child(head, stylesheet);

    const body = el("body", {}, [], "body"); child(html, body);
    const header = el("header", { class: "site-header" }, [], "site-header"); child(body, header);
    const wordmark = el("a", { class: "wordmark", href: role === "home" ? "#top" : "index.html#top", "aria-label": "Perth Encounter home" }, [], "wordmark");
    for (const digit of ["07", "07", "27"]) { const span = el("span", {}, [], "date"); text(span, digit); child(wordmark, span); }
    child(header, wordmark);
    const toggle = el("button", { class: "menu-toggle", type: "button", "aria-expanded": "false", "aria-controls": "site-nav" }, [], "menu"); text(toggle, "Menu"); child(header, toggle);
    const nav = el("nav", { id: "site-nav", "aria-label": "Main navigation" }, [], "nav");
    for (const item of navigation) {
      const href = value(semantic, item, "href");
      const label = value(semantic, item, "label");
      link(nav, href, label, value(semantic, item, "cta") === "true" ? "nav-cta" : "");
    }
    child(header, nav);

    const main = el("main", { id: role === "home" ? "top" : "content" }, [], "main"); child(body, main);
    if (role === "home") {
      const hero = el("section", { class: "hero", "aria-labelledby": "hero-title" }, [], "hero");
      const image = el("div", { class: "hero-image", role: "img", "aria-label": "A painted Perth skyline at dusk with a kneeling crowd beneath a column of light" }, [], "hero-image"); child(hero, image);
      child(hero, el("div", { class: "hero-shade" }, [], "hero-shade"));
      const copy = el("div", { class: "hero-copy" }, [], "hero-copy");
      const kicker = el("p", { class: "eyebrow" }, [], "kicker"); text(kicker, value(semantic, page, "kicker")); child(copy, kicker);
      heading(copy, 1, value(semantic, page, "heading"), "hero-title");
      paragraph(copy, value(semantic, page, "intro"), "hero-lede");
      const actions = el("div", { class: "hero-actions" }, [], "actions"); link(actions, "#join", "Register interest ↗", "button button-light"); link(actions, "#flow", "See the evening ↓", "text-link"); child(copy, actions); child(hero, copy);
      const note = el("div", { class: "hero-note" }, [], "hero-note"); text(note, value(semantic, page, "note")); child(hero, note); child(main, hero);
    } else {
      const hero = el("header", { class: "source-hero" }, [], "source-hero");
      const kicker = el("p", { class: "eyebrow" }, [], "kicker"); text(kicker, value(semantic, page, "kicker")); child(hero, kicker);
      heading(hero, 1, value(semantic, page, "heading")); paragraph(hero, value(semantic, page, "intro")); child(main, hero);
    }

    const sectionIds = values(semantic, page, "section").sort((a, b) => Number(value(semantic, a, "order", "0")) - Number(value(semantic, b, "order", "0")));
    for (const sectionId of sectionIds) {
      const classes = role === "home" ? (sectionId.includes("night") ? "flow section" : sectionId.includes("algebra") ? "algebra section" : sectionId.includes("posture") || sectionId.includes("architecture") ? "section section-dark" : `${role === "home" ? "section" : "source-copy"}`) : "source-copy";
      const section = el("section", { class: classes, id: sectionId.includes("night") ? "flow" : sectionId.includes("join") ? "join" : undefined }, [], "section");
      const label = value(semantic, sectionId, "label"); if (label) { const kicker = el("div", { class: "section-kicker" }, [], "section-kicker"); text(kicker, label); child(section, kicker); }
      const sectionHeading = value(semantic, sectionId, "heading"); if (sectionHeading) heading(section, 2, sectionHeading);
      const proseValues = values(semantic, sectionId, "prose");
      for (const prose of proseValues) paragraph(section, prose);
      const quote = value(semantic, sectionId, "quote"); if (quote) { const aside = el("div", { class: "pull-quote" }, [], "quote"); text(aside, `“${quote}”`); child(section, aside); }
      const equation = value(semantic, sectionId, "equation"); if (equation) { const eq = el("div", { class: "equation" }, [], "equation"); text(eq, equation); child(section, eq); }
      const items = values(semantic, sectionId, "item");
      if (items.length) {
        const list = el(role === "home" && sectionId.includes("night") ? "div" : "div", { class: role === "home" && sectionId.includes("night") ? "timeline" : role === "home" ? "principles-grid" : "commons-list" }, [], "items");
        for (const item of items) {
          const itemType = value(semantic, item, "isa");
          const itemNode = el("article", { class: itemType === "ProcessStage" ? "timeline-item" : "principle-card" }, [], "item");
          if (value(semantic, item, "time")) { const time = el("time", { class: "time" }, [], "time"); text(time, value(semantic, item, "time")); child(itemNode, time); }
          if (value(semantic, item, "label")) { const labelNode = el("span", {}, [], "label"); text(labelNode, value(semantic, item, "label")); child(itemNode, labelNode); }
          heading(itemNode, 3, value(semantic, item, "heading")); paragraph(itemNode, value(semantic, item, "prose")); child(list, itemNode);
        }
        child(section, list);
      }
      const linkLabel = value(semantic, sectionId, "linkLabel"); if (linkLabel) link(section, value(semantic, sectionId, "linkHref"), linkLabel);
      if (sectionId.includes("join")) {
        const form = el("form", { id: "interest-form" }, [], "interest-form"); const label = el("label", { for: "email" }, [], "email-label"); text(label, "Email address"); child(form, label); const input = el("input", { id: "email", name: "email", type: "email", autocomplete: "email", placeholder: "you@example.com", required: "true" }, [], "email"); child(form, input); const submit = el("button", { class: "button button-dark", type: "submit" }, [], "submit"); text(submit, "I'm interested ↗"); child(form, submit); child(section, form);
      }
      child(main, section);
    }
    const footer = el("footer", {}, [], "footer"); text(footer, "PERTH ENCOUNTER / 07·07·27 · Make room. Lift burdens. Return changed."); child(body, footer);
    const script = el("script", { src: "script.js" }, [], "script"); child(body, script);
  }

  return serialize(facts);
}

