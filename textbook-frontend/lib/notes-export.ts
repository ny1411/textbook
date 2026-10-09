import type { StudioNote } from "@/stores/useTextbookStore";
import type { Content, ContentText, TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

const devanagariPattern = /[\u0900-\u097f\ua8e0-\ua8ff]/;
const devanagariRuns = /([\u0900-\u097f\ua8e0-\ua8ff][\u0900-\u097f\ua8e0-\ua8ff\u200c\u200d]*)/g;
const devanagariFont = "NotoSansDevanagari-Regular.ttf";
let devanagariFontPromise: Promise<string> | undefined;

function dateLabel(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown date" : date.toISOString();
}

function heading(value: string): string {
    return value.replace(/[\r\n]+/g, " ").trim() || "Studio Notes";
}

function sourceLines(source: StudioNote["sourceRef"]): string[] {
    if (!source) return [];
    return [
        source.sourceId != null ? `Source: [${source.sourceId}]` : "",
        source.documentId ? `Document: ${source.documentId}` : "",
        source.pageNumber != null ? `Page: ${source.pageNumber}` : "",
        source.url ? `URL: ${source.url}` : "",
    ].filter(Boolean);
}

export function notesAsMarkdown(
    notes: readonly StudioNote[],
    notebookTitle = "Studio Notes",
    exportedAt = new Date(),
): string {
    const sections = notes.map((note, index) => {
        const metadata = [
            `Created: ${dateLabel(note.createdAt)}`,
            `Updated: ${dateLabel(note.updatedAt)}`,
        ];
        const source = sourceLines(note.sourceRef);
        const excerpt = note.sourceRef?.excerpt
            ? `\n\nSource excerpt:\n\n${note.sourceRef.excerpt.split(/\r?\n/).map((line) => `> ${line}`).join("\n")}`
            : "";
        return `## ${heading(note.title || `Note ${index + 1}`)}\n\n${metadata.join("\n\n")}\n\n${note.content}${source.length ? `\n\n${source.join("\n\n")}` : ""}${excerpt}`;
    });
    return `# ${heading(notebookTitle)}\n\nExported: ${exportedAt.toISOString()}\n\n${sections.join("\n\n---\n\n")}\n`;
}

function unicodeText(text: string): ContentText[] {
    return text.split(devanagariRuns).filter(Boolean).map((part) => ({
        text: part,
        ...(devanagariPattern.test(part) ? { font: "NotoDevanagari" } : {}),
    }));
}

function noteContent(text: string): Content[] {
    // Keep the note's text intact, with readable spacing and basic Markdown headings/lists.
    return text.split(/\r?\n/).map((line) => {
        const title = /^(#{1,6})\s+(.+)$/.exec(line);
        const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
        return {
            text: unicodeText(title ? title[2] : bullet ? `• ${bullet[1]}` : line || " "),
            ...(title ? { bold: true, fontSize: 13, margin: [0, 7, 0, 4] } : { margin: [0, 0, 0, 3] }),
        } as ContentText;
    });
}

function documentDefinition(
    notes: readonly StudioNote[],
    notebookTitle: string,
    exportedAt: Date,
): TDocumentDefinitions {
    const content: Content[] = [
        { text: unicodeText(heading(notebookTitle)), fontSize: 22, bold: true, margin: [0, 0, 0, 8] },
        { text: `Exported: ${exportedAt.toISOString()}`, fontSize: 9, color: "#64748b", margin: [0, 0, 0, 20] },
    ];
    notes.forEach((note, index) => {
        content.push(
            { text: unicodeText(heading(note.title || `Note ${index + 1}`)), fontSize: 15, bold: true, margin: [0, 8, 0, 5] },
            { text: `Created: ${dateLabel(note.createdAt)}\nUpdated: ${dateLabel(note.updatedAt)}`, fontSize: 8, color: "#64748b", margin: [0, 0, 0, 9] },
            ...noteContent(note.content),
        );
        const source = sourceLines(note.sourceRef);
        if (source.length) content.push({ text: unicodeText(source.join("\n")), fontSize: 9, color: "#475569", margin: [0, 8, 0, 5] });
        if (note.sourceRef?.excerpt) content.push({
            text: unicodeText(`Source excerpt: ${note.sourceRef.excerpt}`),
            fontSize: 9,
            color: "#475569",
            margin: [12, 3, 0, 12],
        });
        content.push({ text: " ", margin: [0, 0, 0, 8] });
    });
    return {
        info: { title: heading(notebookTitle), creator: "Textbook Studio" },
        pageSize: "A4",
        pageMargins: [48, 48, 48, 48],
        defaultStyle: { font: "Roboto", fontSize: 11, color: "#172033", lineHeight: 1.3 },
        content,
        footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: "center", fontSize: 8, color: "#64748b", margin: [0, 15, 0, 0] }),
    };
}

function loadDevanagariFont(): Promise<string> {
    if (!devanagariFontPromise) {
        devanagariFontPromise = fetch(`/fonts/notes-export/${devanagariFont}`)
            .then(async (response) => {
                if (!response.ok) throw new Error("Could not load the PDF font. Please try again.");
                const bytes = new Uint8Array(await response.arrayBuffer());
                const chunks: string[] = [];
                for (let offset = 0; offset < bytes.length; offset += 8192) {
                    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
                }
                return btoa(chunks.join(""));
            })
            .catch((error: unknown) => {
                devanagariFontPromise = undefined;
                throw error;
            });
    }
    return devanagariFontPromise;
}

export async function createNotesPdf(
    notes: readonly StudioNote[],
    notebookTitle = "Studio Notes",
    exportedAt = new Date(),
): Promise<Blob> {
    const needsDevanagari = devanagariPattern.test(JSON.stringify([notebookTitle, notes]));
    // The renderer and its fonts are only downloaded when PDF export is requested.
    const [pdfModule, fontsModule, devanagari] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("pdfmake/build/vfs_fonts"),
        needsDevanagari ? loadDevanagariFont() : Promise.resolve(null),
    ]);
    const fonts: TFontDictionary = {
        Roboto: {
            normal: "Roboto-Regular.ttf",
            bold: "Roboto-Medium.ttf",
            italics: "Roboto-Italic.ttf",
            bolditalics: "Roboto-MediumItalic.ttf",
        },
    };
    const vfs = { ...fontsModule.default };
    if (devanagari) {
        vfs[devanagariFont] = devanagari;
        fonts.NotoDevanagari = { normal: devanagariFont, bold: devanagariFont, italics: devanagariFont, bolditalics: devanagariFont };
    }
    const pdf = pdfModule.default.createPdf(documentDefinition(notes, notebookTitle, exportedAt), undefined, fonts, vfs);
    return new Promise((resolve, reject) => {
        // All fonts are in memory, so stream creation also reports layout errors synchronously.
        const stream = pdf.getStream();
        const chunks: ArrayBuffer[] = [];
        stream.on("data", (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk).buffer));
        stream.on("error", reject);
        stream.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })));
        stream.end();
    });
}

export function notesFilename(notebookTitle: string, extension: "md" | "pdf"): string {
    const name = notebookTitle.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "-").slice(0, 100);
    return `${name || "studio-notes"}.${extension}`;
}

export function downloadNotesBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser time to begin reading the download before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
