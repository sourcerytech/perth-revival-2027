// Semantic page projection grammar for Perth Encounter.
//
// Input: authored semantic REL (Page, Section, ProcessStage, Principle).
// Output: authored DOM REL consumed by Claimipedia/Sourcery html-rel.
// This is deliberately a semantic adapter: it never parses HTML and never
// lowers an existing DOM back into REL.

import { readFileSync } from "node:fs";
import { parse, serialize } from "../html-rel/core/rel-core.mjs";

const value = (facts, subject, predicate, fallback = "") => facts.find(f => f.s === subject && f.p === predicate && f.pol !== "is-not")?.o ?? fallback;
const values = (facts, subject, predicate) => facts.filter(f => f.s === subject && f.p === predicate && f.pol !== "is-not").map(f => f.o);
const subjectsOfType = (facts, type) => [...new Set(facts.filter(f => f.p === "isa" && f.o === type).map(f => f.s))];
const q = value => JSON.stringify(String(value));
const projectionGrammar = parse(readFileSync(new URL("../semantic/projection-grammar.rel", import.meta.url), "utf8"), { file: "source/semantic/projection-grammar.rel" });
const grammarValue = (subject, predicate, fallback = "") => value(projectionGrammar, subject, predicate, fallback);
const grammarSubjectsOfType = type => subjectsOfType(projectionGrammar, type);
const pageTemplate = role => grammarSubjectsOfType("PageTemplate").find(subject => grammarValue(subject, "pageRole") === role) || grammarSubjectsOfType("PageTemplate").find(subject => grammarValue(subject, "pageRole") === "default");
const projectionRegion = role => grammarSubjectsOfType("ProjectionRegion").find(subject => grammarValue(subject, "sourceRole") === role) || grammarSubjectsOfType("ProjectionRegion").find(subject => grammarValue(subject, "sourceRole") === "*");
const semanticMapping = type => grammarSubjectsOfType("SemanticElementMapping").find(subject => grammarValue(subject, "sourceType") === type);

export function projectSemanticPagesToDomRel(source, { file = "source/semantic/perth-encounter.rel" } = {}) {
  const semantic = parse(source, { file });
  const semanticProjection = value(projectionGrammar, "grammar.perthEncounter.document", "protocol");
  const documentProduction = value(projectionGrammar, "grammar.perthEncounter.document", "production");
  const productionRhs = values(projectionGrammar, documentProduction, "rhs");
  if (semanticProjection !== "claimipedia-semantic-document-grammar/1") throw new Error("Claimipedia semantic document grammar protocol is not admitted.");
  if (JSON.stringify(productionRhs) !== JSON.stringify(["SkipLink?", "SiteHeader", "Main", "SiteFooter?"])) throw new Error("Claimipedia document production drifted in REL.");
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

    const template = pageTemplate(role);
    if (!template) throw new Error(`No projection template for page role ${role}.`);
    const isHomeTemplate = grammarValue(template, "pageRole") === "home";
    const main = el("main", { id: isHomeTemplate ? "top" : "content" }, [], "main"); child(body, main);
    const heroSpec = grammarValue(template, "hero");
    const heroRegion = heroSpec && grammarSubjectsOfType("ProjectionRegion").includes(heroSpec) ? heroSpec : null;
    if (isHomeTemplate) {
      const hero = el(grammarValue(heroRegion, "tag", "section"), { class: grammarValue(heroRegion, "class", "hero"), "aria-labelledby": "hero-title" }, [], "hero");
      const image = el("div", { class: "hero-image", role: "img", "aria-label": "A painted Perth skyline at dusk with a kneeling crowd beneath a column of light" }, [], "hero-image"); child(hero, image);
      child(hero, el("div", { class: "hero-shade" }, [], "hero-shade"));
      const copy = el("div", { class: "hero-copy" }, [], "hero-copy");
      const kicker = el("p", { class: "eyebrow" }, [], "kicker"); text(kicker, value(semantic, page, "kicker")); child(copy, kicker);
      heading(copy, 1, value(semantic, page, "heading"), "hero-title");
      paragraph(copy, value(semantic, page, "intro"), "hero-lede");
      const actions = el("div", { class: "hero-actions" }, [], "actions"); link(actions, "#join", "Register interest ↗", "button button-light"); link(actions, "#flow", "See the evening ↓", "text-link"); child(copy, actions); child(hero, copy);
      const note = el("div", { class: "hero-note" }, [], "hero-note"); text(note, value(semantic, page, "note")); child(hero, note); child(main, hero);
    } else {
      const hero = el(grammarValue(heroRegion, "tag", "header"), { class: grammarValue(heroRegion, "class", "source-hero") }, [], "source-hero");
      const kicker = el("p", { class: "eyebrow" }, [], "kicker"); text(kicker, value(semantic, page, "kicker")); child(hero, kicker);
      heading(hero, 1, value(semantic, page, "heading")); paragraph(hero, value(semantic, page, "intro")); child(main, hero);
    }

    const sectionIds = values(semantic, page, "section").sort((a, b) => Number(value(semantic, a, "order", "0")) - Number(value(semantic, b, "order", "0")));
    for (const sectionId of sectionIds) {
      const sectionRole = value(semantic, sectionId, "viewRole", "default");
      const region = projectionRegion(sectionRole);
      if (!region) throw new Error(`No projection region for section role ${sectionRole}.`);
      const section = el(grammarValue(region, "tag", "section"), { class: grammarValue(region, "class", "source-copy"), id: value(semantic, sectionId, "id", grammarValue(region, "id")) || undefined }, [], "section");
      const label = value(semantic, sectionId, "label"); if (label) { const kicker = el("div", { class: "section-kicker" }, [], "section-kicker"); text(kicker, label); child(section, kicker); }
      const sectionHeading = value(semantic, sectionId, "heading");
      const lead = value(semantic, sectionId, "lead");
      const proseValues = values(semantic, sectionId, "prose");
      const introClass = sectionRole === "architecture" ? "architecture-heading" : sectionRole === "kenotic" ? "algebra-intro" : null;
      const intro = introClass ? el("div", { class: introClass }, [], "section-intro") : section;
      if (sectionHeading) heading(intro, 2, sectionHeading);
      if (lead) paragraph(intro, lead, "lead");
      for (const prose of proseValues) paragraph(intro, prose);
      if (intro !== section) child(section, intro);
      const quote = value(semantic, sectionId, "quote"); if (quote) { const aside = el("div", { class: "pull-quote" }, [], "quote"); text(aside, `“${quote}”`); child(section, aside); }
      const equation = value(semantic, sectionId, "equation"); if (equation) { const eq = el("div", { class: "equation" }, [], "equation"); text(eq, equation); child(intro, eq); }
      const items = values(semantic, sectionId, "item").sort((a, b) => Number(value(semantic, a, "order", "0")) - Number(value(semantic, b, "order", "0")));
      if (items.length) {
        const itemType = value(semantic, items[0], "isa");
        const itemMapping = semanticMapping(itemType);
        const collectionClass = sectionRole === "architecture" ? "architecture-grid" : sectionRole === "kenotic" ? "algebra-grid" : sectionRole === "sources" ? "sources-grid" : grammarValue(itemMapping, "collectionClass", "commons-list");
        const list = el(grammarValue(itemMapping, "collectionTag", "div"), { class: collectionClass }, [], "items");
        for (const item of items) {
          const itemType = value(semantic, item, "isa");
          const itemMapping = semanticMapping(itemType);
          const itemTag = grammarValue(itemMapping, "tag", "article");
          const itemAttrs = { class: sectionRole === "kenotic" ? "algebra-node" : grammarValue(itemMapping, "class", "item") };
          if (itemType === "ArchitectureCard" || itemType === "SourceLink") itemAttrs.href = value(semantic, item, "href");
          if (itemType === "ProcessStage" && value(semantic, item, "highlight") === "true") itemAttrs.class = `${itemAttrs.class} highlight`;
          const itemNode = el(itemTag, itemAttrs, [], "item");
          if (value(semantic, item, "time")) { const time = el("time", { class: "time" }, [], "time"); text(time, value(semantic, item, "time")); child(itemNode, time); }
          if (value(semantic, item, "label")) { const labelNode = el("span", {}, [], "label"); text(labelNode, value(semantic, item, "label")); child(itemNode, labelNode); }
          if (value(semantic, item, "heading")) heading(itemNode, Number(grammarValue(itemMapping, "headingTag", "h3").slice(1)), value(semantic, item, "heading"));
          if (value(semantic, item, "prose")) paragraph(itemNode, value(semantic, item, "prose"));
          if (value(semantic, item, "linkLabel")) { const linkLabel = el("span", {}, [], "link-label"); text(linkLabel, value(semantic, item, "linkLabel")); child(itemNode, linkLabel); }
          child(list, itemNode);
        }
        child(section, list);
      }
      const linkLabel = value(semantic, sectionId, "linkLabel"); if (linkLabel) link(section, value(semantic, sectionId, "linkHref"), linkLabel);
      if (grammarValue(region, "containsForm") === "true") {
        const form = el("form", { id: "interest-form" }, [], "interest-form"); const label = el("label", { for: "email" }, [], "email-label"); text(label, "Email address"); child(form, label); const input = el("input", { id: "email", name: "email", type: "email", autocomplete: "email", placeholder: "you@example.com", required: "true" }, [], "email"); child(form, input); const submit = el("button", { class: "button button-dark", type: "submit" }, [], "submit"); text(submit, "I'm interested ↗"); child(form, submit);
        const consentLabel = value(semantic, sectionId, "consentLabel"); if (consentLabel) { const consent = el("label", { class: "consent" }, [], "consent"); const checkbox = el("input", { id: "consent", name: "consent", type: "checkbox", required: "true" }, [], "consent-input"); child(consent, checkbox); const consentText = el("span", {}, [], "consent-text"); text(consentText, consentLabel); child(consent, consentText); child(form, consent); }
        const note = value(semantic, sectionId, "formNote"); if (note) { const formNote = el("p", { class: "form-note" }, [], "form-note"); text(formNote, note); const privacyLink = el("a", { href: value(semantic, sectionId, "privacyHref", "privacy.html") }, [], "privacy-link"); text(privacyLink, value(semantic, sectionId, "formNoteLinkLabel", "Privacy and unsubscribe options.")); child(formNote, privacyLink); child(form, formNote); }
        child(section, form);
      }
      child(main, section);
    }
    const footer = el("footer", {}, [], "footer");
    const footerText = value(semantic, "site.perthEncounter", "footerText", "PERTH ENCOUNTER / 07·07·27");
    const footerTagline = value(semantic, "site.perthEncounter", "footerTagline", "Make room. Lift burdens. Return changed.");
    text(footer, `${footerText} · ${footerTagline}`);
    for (const footerId of values(semantic, "site.perthEncounter", "footerLink")) {
      const footerLink = el("a", { href: value(semantic, footerId, "href") }, [], "footer-link");
      text(footerLink, value(semantic, footerId, "label"));
      child(footer, footerLink);
    }
    child(body, footer);
    const script = el("script", { src: "script.js" }, [], "script"); child(body, script);
  }

  return serialize(facts);
}

