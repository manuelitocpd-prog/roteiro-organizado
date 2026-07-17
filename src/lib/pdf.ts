import jsPDF from "jspdf";
import type { ItemRoteiro } from "./types";

export interface RoteiroPdfInput {
  disciplinaNome: string;
  itens: ItemRoteiro[];
  observacao: string | null;
}

export interface PdfArgs {
  turmaNome: string;
  segmento: string;
  etapa: number;
  tipoAvaliacao: "parcial" | "global";
  dataInicio: string | null;
  dataFim: string | null;
  anoLetivo: number;
  roteiros: RoteiroPdfInput[];
  logoUrl: string;
}

// ---------- layout constants (mm) ----------
const PAGE_W = 210;
const PAGE_H = 297;
const OUTER = 5;
const GAP = 4;
const COL_W = (PAGE_W - OUTER * 2 - GAP) / 2;
const PAD = 4;
const CONTENT_W = COL_W - PAD * 2;
const TOP = 8;
const BOT = 8;
const COL_H = PAGE_H - TOP - BOT;
const HEADER_H = 20;
const TITLE_H_LINES = 3;

// helvetica line-height helper (font size in pt → mm)
const lh = (pt: number, factor = 1.18) => pt * 0.3528 * factor;

// ---------- inline **bold** parser ----------
interface Seg {
  text: string;
  bold: boolean;
}
function parseBold(text: string): Seg[] {
  const out: Seg[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

// ---------- word-wrap with mixed styles ----------
interface LineTok {
  text: string;
  bold: boolean;
  x: number; // relative to line start
}
function wrapInline(
  doc: jsPDF,
  segs: Seg[],
  maxWidth: number,
  fontSize: number,
  fontName = "helvetica",
): LineTok[][] {
  const lines: LineTok[][] = [[]];
  let cx = 0;
  const spaceWidth = (bold: boolean) => {
    doc.setFont(fontName, bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    return doc.getTextWidth(" ");
  };
  for (const seg of segs) {
    doc.setFont(fontName, seg.bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    const words = seg.text.split(/\s+/).filter(Boolean);
    words.forEach((w, i) => {
      const wW = doc.getTextWidth(w);
      const sp = i === 0 && lines[lines.length - 1].length === 0 ? 0 : spaceWidth(seg.bold);
      if (cx + sp + wW > maxWidth && lines[lines.length - 1].length > 0) {
        lines.push([]);
        cx = 0;
        lines[lines.length - 1].push({ text: w, bold: seg.bold, x: 0 });
        cx = wW;
      } else {
        const line = lines[lines.length - 1];
        if (line.length > 0) cx += sp;
        line.push({ text: w, bold: seg.bold, x: cx });
        cx += wW;
      }
    });
  }
  return lines;
}

function drawInlineLines(
  doc: jsPDF,
  lines: LineTok[][],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  fontName = "helvetica",
) {
  lines.forEach((line, i) => {
    const yy = y + (i + 1) * lineHeight - lineHeight * 0.25;
    for (const tok of line) {
      doc.setFont(fontName, tok.bold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      doc.text(tok.text, x + tok.x, yy);
    }
  });
}

// ---------- block model ----------
interface Block {
  height: number;
  draw: (doc: jsPDF, x: number, y: number) => void;
}

function buildBlocksForDisciplina(
  doc: jsPDF,
  r: RoteiroPdfInput,
): Block[] {
  const blocks: Block[] = [];
  const bodyPt = 9.5;
  const bodyLh = lh(bodyPt);
  const headerPt = 11;
  const headerLh = lh(headerPt, 1.4);

  // disciplina header
  blocks.push({
    height: headerLh + 1,
    draw: (doc, x, y) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(headerPt);
      const t = r.disciplinaNome.toUpperCase();
      const tw = doc.getTextWidth(t);
      doc.text(t, x + (CONTENT_W - tw) / 2, y + headerLh * 0.8);
    },
  });

  for (const item of r.itens) {
    if (item.tipo === "subtitulo") {
      const lines = wrapInline(doc, [{ text: item.texto, bold: true }], CONTENT_W, bodyPt);
      const h = lines.length * bodyLh + 0.4;
      blocks.push({
        height: h,
        draw: (doc, x, y) => drawInlineLines(doc, lines, x, y, bodyPt, bodyLh),
      });
    } else {
      // topico with "- " prefix
      doc.setFont("helvetica", "normal");
      doc.setFontSize(bodyPt);
      const dashW = doc.getTextWidth("- ");
      const segs = parseBold(item.texto);
      const lines = wrapInline(doc, segs, CONTENT_W - dashW, bodyPt);
      const h = Math.max(lines.length, 1) * bodyLh + 0.2;
      blocks.push({
        height: h,
        draw: (doc, x, y) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(bodyPt);
          doc.text("- ", x, y + bodyLh * 0.75);
          drawInlineLines(doc, lines, x + dashW, y, bodyPt, bodyLh);
        },
      });
    }
  }

  if (r.observacao?.trim()) {
    const segs: Seg[] = [
      { text: "OBS: ", bold: true },
      ...parseBold(r.observacao.trim()).map((s) => ({ ...s })),
    ];
    const lines = wrapInline(doc, segs, CONTENT_W, bodyPt);
    const h = lines.length * bodyLh + 0.4;
    blocks.push({
      height: h,
      draw: (doc, x, y) => drawInlineLines(doc, lines, x, y, bodyPt, bodyLh),
    });
  }

  // spacer between disciplinas
  blocks.push({ height: 3, draw: () => {} });
  return blocks;
}

function fmtDate(d: string | null) {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}`;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ---------- main ----------
export async function generateRoteirosPdf(args: PdfArgs): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadImage(args.logoUrl).catch(() => null);

  // Build all blocks
  const allBlocks: Block[] = [];
  for (const r of args.roteiros) allBlocks.push(...buildBlocksForDisciplina(doc, r));

  // Paginate
  const pages: Block[][] = [[]];
  let colY = 0;
  const firstPageUsable = COL_H - HEADER_H - TITLE_H_LINES * lh(11, 1.5);
  const restUsable = COL_H - HEADER_H;
  const usable = () => (pages.length === 1 ? firstPageUsable : restUsable);

  for (const b of allBlocks) {
    if (colY + b.height > usable() && pages[pages.length - 1].length > 0) {
      pages.push([]);
      colY = 0;
    }
    pages[pages.length - 1].push(b);
    colY += b.height;
  }

  const drawColumn = (colIndex: number, pageIdx: number, blocks: Block[]) => {
    const colX = OUTER + colIndex * (COL_W + GAP);
    // border
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.rect(colX, TOP, COL_W, COL_H);

    // header
    const headerY = TOP + 2;
    if (logo) {
      const logoH = 14;
      const ratio = logo.width / logo.height;
      const logoW = logoH * ratio;
      try {
        doc.addImage(logo, "PNG", colX + PAD, headerY, logoW, logoH);
      } catch {}
      const textX = colX + PAD + logoW + 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("COLÉGIO MANUELITO", textX, headerY + 4.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(args.segmento.toUpperCase(), textX, headerY + 9);
      doc.text(String(args.anoLetivo), textX, headerY + 13);
    }
    // separator under header
    doc.setLineWidth(0.2);
    doc.line(colX + PAD, TOP + HEADER_H - 2, colX + COL_W - PAD, TOP + HEADER_H - 2);

    let contentY = TOP + HEADER_H;

    // title on page 1
    if (pageIdx === 0) {
      const tipoTxt = args.tipoAvaliacao === "global" ? "GLOBAIS" : "PARCIAIS";
      const titlePt = 11;
      const titleLh = lh(titlePt, 1.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(titlePt);
      const l1 = `AVALIAÇÕES ${tipoTxt} – ${args.etapa}ª ETAPA`;
      const l2 = args.turmaNome.toUpperCase();
      const dIni = fmtDate(args.dataInicio);
      const dFim = fmtDate(args.dataFim);
      const periodo = dIni && dFim && dIni !== dFim ? `${dIni} a ${dFim}` : dIni || dFim;
      const l3 = periodo ? `REALIZAÇÃO: ${periodo}` : "";
      const cx = colX + COL_W / 2;
      doc.text(l1, cx - doc.getTextWidth(l1) / 2, contentY + titleLh);
      doc.text(l2, cx - doc.getTextWidth(l2) / 2, contentY + titleLh * 2);
      if (l3) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(l3, cx - doc.getTextWidth(l3) / 2, contentY + titleLh * 3);
      }
      contentY += titleLh * 3 + 1;
    }

    let y = contentY;
    for (const b of blocks) {
      b.draw(doc, colX + PAD, y);
      y += b.height;
    }
  };

  pages.forEach((blocks, pageIdx) => {
    if (pageIdx > 0) doc.addPage();
    drawColumn(0, pageIdx, blocks);
    drawColumn(1, pageIdx, blocks);
  });

  return doc.output("blob");
}

export function pdfFilename(turmaNome: string, etapa: number, tipo: "parcial" | "global") {
  const slug = turmaNome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  return `roteiro_${slug}_${etapa}etapa_${tipo}.pdf`;
}
