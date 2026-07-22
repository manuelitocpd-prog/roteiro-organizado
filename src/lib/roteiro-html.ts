import type { ItemRoteiro } from "./types";

// Escape plain text for safe HTML rendering.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Convert legacy **bold** markers into <strong>…</strong> after escaping.
function inlineBoldToHtml(text: string): string {
  const parts: string[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(esc(text.slice(last, m.index)));
    parts.push(`<strong>${esc(m[1])}</strong>`);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(esc(text.slice(last)));
  return parts.join("");
}

// True when the persisted itens are the new single-HTML payload.
export function isHtmlPayload(itens: ItemRoteiro[]): boolean {
  return (
    itens.length === 1 &&
    itens[0].tipo === "subtitulo" &&
    /<[a-zA-Z]/.test(itens[0].texto)
  );
}

// Legacy itens (subtitulo + topico with **bold**) → HTML for the editor / PDF.
export function itensToHtml(itens: ItemRoteiro[]): string {
  if (itens.length === 0) return "";
  const out: string[] = [];
  for (const it of itens) {
    if (it.tipo === "subtitulo") {
      out.push(`<p><strong>${inlineBoldToHtml(it.texto)}</strong></p>`);
    } else {
      out.push(`<p>- ${inlineBoldToHtml(it.texto)}</p>`);
    }
  }
  return out.join("");
}

// Wrap the editor HTML into the persistence shape (reuses the subtitulo slot).
export function htmlToItens(html: string): ItemRoteiro[] {
  const clean = html.trim();
  if (!clean) return [];
  return [{ tipo: "subtitulo", texto: clean }];
}

// ---------- PDF-facing parsing ----------

export interface HtmlSeg {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface HtmlParagraph {
  segs: HtmlSeg[];
}

const BLOCK_TAGS = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6"]);

// Parse a fragment of HTML into paragraphs of styled inline segments.
// Works in browser (uses DOMParser). Only for client-side PDF generation.
export function htmlToParagraphs(html: string): HtmlParagraph[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstChild as HTMLElement | null;
  if (!root) return [];

  const paragraphs: HtmlParagraph[] = [];
  let current: HtmlSeg[] = [];
  const flush = () => {
    // Trim leading/trailing whitespace-only entries.
    while (current.length && !current[0].text.trim()) current.shift();
    while (current.length && !current[current.length - 1].text.trim()) current.pop();
    if (current.length) paragraphs.push({ segs: current });
    current = [];
  };

  const walk = (node: Node, style: { b: boolean; i: boolean; u: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").replace(/\s+/g, " ");
      if (!t) return;
      current.push({ text: t, bold: style.b, italic: style.i, underline: style.u });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === "BR") {
      flush();
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush();
      const next = {
        b: style.b || tag === "STRONG" || tag === "B",
        i: style.i || tag === "EM" || tag === "I",
        u: style.u || tag === "U",
      };
      el.childNodes.forEach((c) => walk(c, next));
      flush();
      return;
    }

    const next = {
      b: style.b || tag === "STRONG" || tag === "B",
      i: style.i || tag === "EM" || tag === "I",
      u: style.u || tag === "U",
    };
    el.childNodes.forEach((c) => walk(c, next));
  };

  root.childNodes.forEach((c) => walk(c, { b: false, i: false, u: false }));
  flush();
  return paragraphs;
}
