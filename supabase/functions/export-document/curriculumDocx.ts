// Fills the school's Word curriculum template (templateData.ts) with a curriculum
// document. Works on the raw WordprocessingML strings so the template's own
// styling, numbering, tables and footers are preserved exactly.

export interface Line { text: string; depth: number }

const MAX_LEVEL = 3;

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// Word text with line breaks, safe to place inside a <w:t> element.
function textContent(s: string): string {
  return escapeXml(s).replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
}

export function flattenItems(items: any, depth = 0): Line[] {
  const out: Line[] = [];
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    const node = typeof raw === "string" ? { text: raw } : raw ?? {};
    const text = String(node.text ?? "").trim();
    if (text) out.push({ text, depth: Math.min(depth, MAX_LEVEL) });
    out.push(...flattenItems(node.children, depth + 1));
  }
  return out;
}

const PARA_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const T_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

// Placeholders are often split across runs by Word/Docs, so match on the joined
// paragraph text and write the replacement into the run that holds the start.
function fillParagraph(p: string, values: Record<string, string>): string {
  if (!p.includes("{")) return p;
  const tokens: { start: number; end: number; text: string; open: string }[] = [];
  let m: RegExpExecArray | null;
  T_RE.lastIndex = 0;
  while ((m = T_RE.exec(p))) {
    const full = m[0];
    const open = full.slice(0, full.indexOf(">") + 1);
    const innerStart = m.index + open.length;
    tokens.push({ start: innerStart, end: innerStart + m[1].length, text: unescapeXml(m[1]), open });
  }
  const joined = tokens.map(t => t.text).join("");
  const matches: { s: number; e: number; rep: string }[] = [];
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(joined))) {
    if (m[1] in values) matches.push({ s: m.index, e: m.index + m[0].length, rep: values[m[1]] });
  }
  if (matches.length === 0) return p;

  let result = p;
  const rewritten: string[] = [];
  let a = 0;
  for (const t of tokens) {
    const b = a + t.text.length;
    let res = "";
    let pos = a;
    for (const mt of matches) {
      if (mt.e <= a || mt.s >= b) continue;
      const ovS = Math.max(mt.s, a);
      const ovE = Math.min(mt.e, b);
      res += joined.slice(pos, ovS);
      if (mt.s >= a) res += mt.rep;
      pos = ovE;
    }
    res += joined.slice(pos, b);
    rewritten.push(res);
    a = b;
  }
  // Rebuild back-to-front so earlier offsets stay valid.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    const open = t.open.includes("xml:space") ? t.open : t.open.replace(/>$/, ' xml:space="preserve">');
    const openStart = t.start - t.open.length;
    result = result.slice(0, openStart) + open + textContent(rewritten[i]) + result.slice(t.end);
  }
  return result;
}

export function fillInline(xml: string, values: Record<string, string>): string {
  return xml.replace(PARA_RE, p => fillParagraph(p, values));
}

function paragraphText(p: string): string {
  const parts: string[] = [];
  T_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_RE.exec(p))) parts.push(unescapeXml(m[1]));
  return parts.join("");
}

function firstRunProps(p: string): string {
  for (const run of p.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) ?? []) {
    if (!run.includes("<w:t")) continue;
    return run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  }
  return "";
}

function paragraphProps(p: string): string {
  return p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
}

function run(rPr: string, text: string): string {
  return `<w:r>${rPr}<w:t xml:space="preserve">${textContent(text)}</w:t></w:r>`;
}

function withLevel(pPr: string, depth: number): string {
  if (!pPr) return pPr;
  let out = pPr.replace(/<w:ilvl w:val="\d+"\/>/, `<w:ilvl w:val="${depth}"/>`);
  // The template's direct indent is for level 0; deeper levels use the numbering definition.
  if (depth > 0) out = out.replace(/<w:ind\b[^>]*\/>/, "");
  return out;
}

function withoutNumbering(pPr: string): string {
  return pPr.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, "").replace(/<w:ind\b[^>]*\/>/, "");
}

function buildListParagraphs(templatePara: string, lines: Line[], intro: string): string {
  const pPr = paragraphProps(templatePara);
  const rPr = firstRunProps(templatePara);
  const out: string[] = [];
  if (intro.trim()) {
    out.push(`<w:p>${withoutNumbering(pPr)}${run(rPr, intro.trim())}</w:p>`);
  }
  if (lines.length === 0) {
    if (!intro.trim()) out.push(`<w:p>${withoutNumbering(pPr)}${run(rPr, "—")}</w:p>`);
    return out.join("");
  }
  for (const line of lines) {
    out.push(`<w:p>${withLevel(pPr, line.depth)}${run(rPr, line.text)}</w:p>`);
  }
  return out.join("");
}

function setCellText(cell: string, text: string): string {
  const paras = cell.match(PARA_RE) ?? [];
  if (paras.length === 0) return cell;
  const first = paras[0];
  const pPr = paragraphProps(first);
  const rPr = firstRunProps(first);
  const rebuilt = `<w:p>${pPr}${text ? run(rPr, text) : ""}</w:p>`;
  const open = cell.slice(0, cell.indexOf(paras[0]));
  return `${open}${rebuilt}</w:tc>`;
}

function expandTable(tbl: string, marker: string, rows: any[], keys: string[]): string {
  const rowRe = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;
  const trs = tbl.match(rowRe) ?? [];
  const templateRow = trs.find(r => paragraphText(r).includes(marker));
  if (!templateRow) return tbl;
  const cellRe = /<w:tc>[\s\S]*?<\/w:tc>/g;

  const build = (row: any) => {
    let i = 0;
    return templateRow.replace(cellRe, cell => {
      const key = keys[i++];
      return setCellText(cell, key ? String(row?.[key] ?? "").trim() : "");
    });
  };

  const data = rows.filter(r => keys.some(k => String(r?.[k] ?? "").trim() !== ""));
  const newRows = (data.length ? data : [{}]).map(build).join("");
  return tbl.replace(templateRow, () => newRows);
}

export const GRADING_KEYS = ["category", "maxGrade", "items", "percent"];
export const OUTLINE_KEYS = ["month", "standard", "objective", "strategies", "materials", "assignments", "evaluation"];

export function metaValues(content: any): Record<string, string> {
  const m = content?.meta ?? {};
  const s = (v: unknown) => String(v ?? "");
  return {
    school: s(m.school), department: s(m.department), grade: s(m.grade), Grade: s(m.grade),
    creditHours: s(m.creditHours), hoursPerWeek: s(m.hoursPerWeek), academicYear: s(m.academicYear),
  };
}

export function fillDocumentXml(xml: string, content: any): string {
  const c = content ?? {};
  const cc = c.courseContent ?? {};
  const listPlaceholders: Record<string, { items: any; intro?: string }> = {
    courseObjectives: { items: c.courseObjectives?.items, intro: c.courseObjectives?.intro },
    learningOutcomes: { items: c.learningOutcomes?.items, intro: c.learningOutcomes?.intro },
    courseMaterials: { items: c.courseMaterials?.items },
    courseContentSem1: { items: cc.semesterOneItems },
    courseContentSem2: { items: cc.semesterTwoItems },
    teachingMethods: { items: c.teachingMethods?.items },
    projects: { items: c.projects?.items },
    trips: { items: c.trips?.items },
    internships: { items: c.internships?.items },
  };

  let out = xml.replace(PARA_RE, p => {
    const t = paragraphText(p).trim();
    const m = t.match(/^\{\{\s*([A-Za-z0-9_]+)\s*\}\}$/);
    if (!m || !(m[1] in listPlaceholders)) return p;
    const spec = listPlaceholders[m[1]];
    return buildListParagraphs(p, flattenItems(spec.items), String(spec.intro ?? ""));
  });

  out = out.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, tbl => {
    if (tbl.includes("gc_row")) {
      return expandTable(tbl, "{{gc_row}}", c.gradingCriteria?.rows ?? [], GRADING_KEYS);
    }
    if (tbl.includes("outline_sem1_row")) {
      return expandTable(tbl, "{{outline_sem1_row}}", c.curriculumOutlineSemesterOne?.rows ?? [], OUTLINE_KEYS);
    }
    if (tbl.includes("outline_sem2_row")) {
      return expandTable(tbl, "{{outline_sem2_row}}", c.curriculumOutlineSemesterTwo?.rows ?? [], OUTLINE_KEYS);
    }
    return tbl;
  });

  return fillInline(out, {
    ...metaValues(c),
    courseDescription: String(c.courseDescription?.text ?? ""),
    courseContentSem1Title: String(cc.semesterOneTitle || "Semester One"),
    courseContentSem2Title: String(cc.semesterTwoTitle || "Semester Two"),
    notes: String(c.notes?.text ?? ""),
  });
}

export function fillFooterXml(xml: string, content: any): string {
  return fillInline(xml, metaValues(content));
}
