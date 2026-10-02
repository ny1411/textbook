export type CitationToken =
    | { type: "text"; value: string }
    | { type: "citation"; sourceId: string };

function sourceIdFor(token: string, knownIds: Set<string>): string | undefined {
    const value = token.trim();
    // Prefer an exact returned ID, including IDs that themselves start with source_.
    if (knownIds.has(value)) return value;
    const explicit = value.match(/^source_([a-zA-Z0-9_-]+)$/i)
        ?? value.match(/^Source\s+([a-zA-Z0-9_-]+)$/i)
        ?? value.match(/^Source(\d+)$/i);
    if (explicit) return explicit[1];
    if (/^\d+$/.test(value)) return value;
    return undefined;
}

/** Only complete citation groups are converted; ordinary bracketed prose stays text. */
export function parseCitationText(
    text: string,
    sourceIds: Iterable<string | number> = [],
): CitationToken[] {
    const knownIds = new Set(Array.from(sourceIds, String));
    const tokens: CitationToken[] = [];
    const pattern = /\[([^\[\]\n]+)\]/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
        const ids = match[1].split(",").map((part) => sourceIdFor(part, knownIds));
        if (ids.some((id) => id === undefined)) continue;
        if (match.index > offset) tokens.push({ type: "text", value: text.slice(offset, match.index) });
        for (const id of ids) tokens.push({ type: "citation", sourceId: id! });
        offset = match.index + match[0].length;
    }
    if (offset < text.length) tokens.push({ type: "text", value: text.slice(offset) });
    return tokens;
}

// Keep this small structural interface local: no runtime dependency on AST utilities.
interface MarkdownNode {
    type: string;
    value?: string;
    children?: MarkdownNode[];
    data?: Record<string, unknown>;
}

const literalNodes = new Set([
    "code", "inlineCode", "link", "linkReference", "image", "imageReference", "html", "definition",
]);

/** A remark plugin runs after Markdown parsing, leaving literal/linked content intact. */
export function createCitationPlugin(sourceIds: readonly (string | number)[]) {
    return function remarkCitations() {
        return function transform(tree: MarkdownNode) {
            function visit(node: MarkdownNode) {
                if (literalNodes.has(node.type) || !node.children) return;
                node.children = node.children.flatMap((child) => {
                    if (child.type !== "text" || typeof child.value !== "string") {
                        visit(child);
                        return [child];
                    }
                    return parseCitationText(child.value, sourceIds).map((token): MarkdownNode => {
                        if (token.type === "text") return { type: "text", value: token.value };
                        return {
                            type: "text",
                            value: `[${token.sourceId}]`,
                            data: {
                                hName: "cite",
                                hProperties: { "data-source-id": token.sourceId },
                            },
                        };
                    });
                });
            }
            visit(tree);
        };
    };
}
