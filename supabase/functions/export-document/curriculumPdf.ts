// PDF version of the curriculum, laid out like the Word template: portrait A4 with
// roman-numeral section headings, and a landscape page for the outline tables.
// pdf-lib is passed in so this module has no network imports.

import { flattenItems, GRADING_KEYS, OUTLINE_KEYS } from "./curriculumDocx.ts";

const PORTRAIT: [number, number] = [595.28, 841.89];
const LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 54;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"];

const GRADING_HEAD = ["Category", "Percentage", "Approximate no. of items to be assigned", "Grade % per assignment"];
const OUTLINE_HEAD = ["Month & Hrs", "Standard", "Learning Objective", "Teaching Strategies", "Materials and Resources", "Assignments", "Method of Evaluation"];

export async function buildCurriculumPdf(lib: any, content: any, logo?: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = lib;
  const c = content ?? {};
  const meta = c.meta ?? {};
  const cc = c.courseContent ?? {};

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const allowed = new Set<number>(regular.getCharacterSet());

  // The built-in PDF fonts cover Latin text only; anything else is shown as "?".
  const clean = (v: unknown) =>
    Array.from(String(v ?? "").replace(/\r/g, "").replace(/\t/g, "    "))
      .map(ch => (ch === "\n" || allowed.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");

  let size: [number, number] = PORTRAIT;
  let page = pdf.addPage(size);
  let y = size[1] - MARGIN;
  const bottom = () => MARGIN + 10;
  const width = () => size[0] - MARGIN * 2;

  function newPage(next: [number, number] = size) {
    size = next;
    page = pdf.addPage(size);
    y = size[1] - MARGIN;
  }
  function ensure(h: number, onBreak?: () => void) {
    if (y - h < bottom()) {
      newPage();
      onBreak?.();
    }
  }

  function wrap(text: string, font: any, fs: number, maxW: number): string[] {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) { out.push(""); continue; }
      let line = "";
      const flush = () => { out.push(line); line = ""; };
      for (let word of words) {
        while (font.widthOfTextAtSize(word, fs) > maxW) {
          let cut = word.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), fs) > maxW) cut--;
          if (line) flush();
          out.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        const trial = line ? `${line} ${word}` : word;
        if (line && font.widthOfTextAtSize(trial, fs) > maxW) { flush(); line = word; } else line = trial;
      }
      if (line || out.length === 0) flush();
    }
    return out;
  }

  const LH = 1.25;
  function paragraph(text: string, opts: { font?: any; fs?: number; x?: number; gap?: number } = {}) {
    const font = opts.font ?? regular;
    const fs = opts.fs ?? 11;
    const x = opts.x ?? MARGIN;
    const lines = wrap(text, font, fs, size[0] - MARGIN - x);
    for (const line of lines) {
      ensure(fs * LH);
      y -= fs * LH;
      if (line) page.drawText(line, { x, y: y + fs * 0.25, size: fs, font });
    }
    y -= opts.gap ?? 0;
  }

  let headingNo = 0;
  function heading(title: string) {
    ensure(60);
    y -= 12;
    const label = `${ROMAN[headingNo++] ?? headingNo}.`;
    y -= 14;
    page.drawText(label, { x: MARGIN, y, size: 12.5, font: bold });
    page.drawText(title, { x: MARGIN + 30, y, size: 12.5, font: bold });
    y -= 4;
  }

  function list(items: any, opts: { numbered?: boolean; intro?: string } = {}) {
    if (opts.intro?.trim()) paragraph(opts.intro.trim(), { x: MARGIN + 6, gap: 3 });
    const lines = flattenItems(items);
    if (lines.length === 0) {
      if (!opts.intro?.trim()) paragraph("—", { x: MARGIN + 6 });
      return;
    }
    const counters = [0, 0, 0, 0];
    const fs = 11;
    for (const { text, depth } of lines) {
      let label: string;
      if (opts.numbered) {
        counters[depth]++;
        for (let d = depth + 1; d < counters.length; d++) counters[d] = 0;
        label = counters.slice(0, depth + 1).join(".") + ".";
      } else {
        label = depth === 0 ? "•" : depth === 1 ? "o" : "-";
      }
      const indent = MARGIN + 14 + depth * 20;
      const textX = indent + (opts.numbered ? 8 + depth * 6 + 14 : 14);
      const wrapped = wrap(text, regular, fs, size[0] - MARGIN - textX);
      wrapped.forEach((line, i) => {
        ensure(fs * LH);
        y -= fs * LH;
        if (i === 0) page.drawText(label, { x: indent, y: y + fs * 0.25, size: fs, font: regular });
        page.drawText(line, { x: textX, y: y + fs * 0.25, size: fs, font: regular });
      });
      y -= 1.5;
    }
  }

  function table(head: string[], rows: string[][], widths: number[], fs: number) {
    const pad = 3;
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = width() / total;
    const w = widths.map(v => v * scale);
    const drawRow = (cells: string[], font: any, shade: boolean) => {
      const wrapped = cells.map((t, i) => wrap(t, font, fs, w[i] - pad * 2));
      const lines = Math.max(1, ...wrapped.map(l => l.length));
      const h = lines * fs * LH + pad * 2;
      ensure(h, () => drawRow(head, bold, true));
      let x = MARGIN;
      cells.forEach((_, i) => {
        page.drawRectangle({
          x, y: y - h, width: w[i], height: h, borderColor: rgb(0, 0, 0), borderWidth: 0.75,
          ...(shade ? { color: rgb(0.9, 0.9, 0.9) } : {}),
        });
        wrapped[i].forEach((line, li) => {
          if (line) page.drawText(line, { x: x + pad, y: y - pad - fs - li * fs * LH + fs * 0.25 + 1, size: fs, font });
        });
        x += w[i];
      });
      y -= h;
    };
    drawRow(head, bold, true);
    const data = rows.filter(r => r.some(v => v.trim() !== ""));
    for (const r of data.length ? data : [head.map(() => "")]) drawRow(r, regular, false);
    y -= 8;
  }

  const rowsOf = (rows: any, keys: string[]) =>
    (Array.isArray(rows) ? rows : []).map((r: any) => keys.map(k => String(r?.[k] ?? "").trim()));

  // ----- Title block -----
  let logoImage: any = null;
  if (logo) {
    try { logoImage = await pdf.embedPng(logo); } catch { logoImage = null; }
  }
  const titleH = 56;
  const titleTop = y;
  if (logoImage) {
    const scale = Math.min(titleH / logoImage.height, 120 / logoImage.width);
    page.drawImage(logoImage, { x: MARGIN, y: titleTop - titleH + (titleH - logoImage.height * scale) / 2, width: logoImage.width * scale, height: logoImage.height * scale });
  }
  const school = clean(meta.school || "");
  const schoolW = bold.widthOfTextAtSize(school, 17);
  page.drawText(school, { x: MARGIN + (width() - schoolW) / 2, y: titleTop - titleH / 2 - 5, size: 17, font: bold });
  y = titleTop - titleH - 8;

  const gradeDept = clean(`${meta.grade ?? ""} ${meta.department ?? ""}`.trim());
  const infoRows: [string, string][] = [
    [gradeDept, `Grade Level: ${clean(meta.grade)}`],
    [`No. of Credit Hours: ${clean(meta.creditHours)}`, `Annual Instruction: ${clean(meta.hoursPerWeek)}`],
    [clean(meta.academicYear), ""],
  ];
  const half = width() / 2;
  infoRows.forEach(([l, r], idx) => {
    const h = 24;
    for (const [i, t] of [l, r].entries()) {
      page.drawRectangle({ x: MARGIN + i * half, y: y - h, width: half, height: h, borderColor: rgb(0, 0, 0), borderWidth: 0.75 });
      if (t) page.drawText(t, { x: MARGIN + i * half + 6, y: y - 16, size: 11, font: idx === 0 && i === 0 ? bold : regular });
    }
    y -= h;
  });
  y -= 6;

  // ----- Sections -----
  heading("Course Description:");
  paragraph(c.courseDescription?.text ?? "", { x: MARGIN + 6 });

  heading("Course Objectives:");
  list(c.courseObjectives?.items, { intro: c.courseObjectives?.intro });

  heading("Learning outcomes");
  list(c.learningOutcomes?.items, { intro: c.learningOutcomes?.intro });

  heading("Course Materials and Resources:");
  list(c.courseMaterials?.items);

  heading("Course Content:");
  paragraph(cc.semesterOneTitle || "Semester One", { font: bold, x: MARGIN + 6 });
  list(cc.semesterOneItems, { numbered: true });
  y -= 6;
  paragraph(cc.semesterTwoTitle || "Semester Two", { font: bold, x: MARGIN + 6 });
  list(cc.semesterTwoItems, { numbered: true });

  heading("Teaching Methods/Strategies:");
  list(c.teachingMethods?.items);

  heading("List of projects for each Semester:");
  list(c.projects?.items);

  heading("List of trips");
  list(c.trips?.items);

  heading("List of Internships and events");
  list(c.internships?.items);

  heading("Grading Criteria");
  paragraph(
    "This includes the grade breakdown with a rationale for it, the minimum number of assessment items in each category, and the grade each assignment carries.",
    { font: italic, fs: 10, x: MARGIN + 6, gap: 6 },
  );
  table(GRADING_HEAD, rowsOf(c.gradingCriteria?.rows, GRADING_KEYS), [3, 2, 3, 3], 10.5);

  // The outline tables are wide, so they get a landscape page like in the Word template.
  newPage(LANDSCAPE);
  heading("Curriculum Outline:");
  const outlineWidths = [1.1, 1.2, 2, 1.6, 1.6, 1.3, 1.3];
  paragraph("Semester One:", { font: bold, gap: 4 });
  table(OUTLINE_HEAD, rowsOf(c.curriculumOutlineSemesterOne?.rows, OUTLINE_KEYS), outlineWidths, 9);
  paragraph("Semester Two:", { font: bold, gap: 4 });
  table(OUTLINE_HEAD, rowsOf(c.curriculumOutlineSemesterTwo?.rows, OUTLINE_KEYS), outlineWidths, 9);

  newPage(PORTRAIT);
  heading("Curriculum Changes:");
  paragraph(c.notes?.text ?? "", { x: MARGIN + 6 });

  // ----- Footer on every page -----
  const pages = pdf.getPages();
  const footerLeft = clean(`MEAS- Curriculum ${meta.grade ?? ""} ${meta.department ?? ""}, ${meta.academicYear ?? ""}`);
  pages.forEach((p: any, i: number) => {
    const [pw] = [p.getWidth()];
    p.drawLine({ start: { x: MARGIN, y: MARGIN - 4 }, end: { x: pw - MARGIN, y: MARGIN - 4 }, thickness: 0.5, color: rgb(0, 0, 0) });
    p.drawText(footerLeft, { x: MARGIN, y: MARGIN - 18, size: 9, font: regular });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: pw - MARGIN - regular.widthOfTextAtSize(label, 9), y: MARGIN - 18, size: 9, font: regular });
  });

  return await pdf.save();
}
