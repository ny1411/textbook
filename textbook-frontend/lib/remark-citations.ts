import type { Link, Parent, Root, RootContent, Text } from "mdast";
import { decodeString } from "micromark-util-decode-string";

interface CitationOptions {
    sourceIds: readonly (number | string)[];
}

const BRACKETS = /\[[^\[\]\n]+\]/g;
const SOURCE_ID = /^(?:source_|Source\s*)?([a-zA-Z0-9_-]+)$/i;
const SKIP = new Set(["link", "linkReference", "image", "imageReference", "code", "inlineCode", "html"]);

function escapedAt(value: string, offset: number): boolean {
    let slashes = 0;
    while (offset > 0 && value[--offset] === "\\") slashes++;
    return slashes % 2 === 1;
}

/** Turn only references to supplied sources into links marked for the badge renderer. */
export function remarkCitations({ sourceIds }: CitationOptions) {
    const known = new Set(sourceIds.map(String));

    return (tree: Root, file: { value: unknown }) => {
        const markdown = String(file.value);

        function splitText(node: Text): RootContent[] {
            const start = node.position?.start.offset;
            const end = node.position?.end.offset;
            if (start === undefined || end === undefined) return [node];
            const raw = markdown.slice(start, end);
            // Keep unusual parser-normalized text literal instead of guessing its offsets.
            if (decodeString(raw) !== node.value) return [node];

            const children: RootContent[] = [];
            let offset = 0;
            for (const match of raw.matchAll(BRACKETS)) {
                const bracket = match[0];
                if (escapedAt(raw, match.index) || escapedAt(bracket, bracket.length - 1)) continue;
                const ids = bracket.slice(1, -1).split(",").map((part) => {
                    const token = part.trim();
                    return known.has(token) ? token : SOURCE_ID.exec(token)?.[1];
                });
                if (!ids.every((id): id is string => id !== undefined && known.has(id))) continue;

                if (match.index > offset) children.push({ type: "text", value: decodeString(raw.slice(offset, match.index)) });
                for (const id of ids) {
                    const link: Link = {
                        type: "link",
                        url: `#citation-${encodeURIComponent(id)}`,
                        children: [{ type: "text", value: `[${id}]` }],
                        data: { hProperties: { "data-citation-source": id } },
                    };
                    children.push(link);
                }
                offset = match.index + bracket.length;
            }
            if (offset === 0) return [node];
            if (offset < raw.length) children.push({ type: "text", value: decodeString(raw.slice(offset)) });
            return children;
        }

        function visit(parent: Parent) {
            parent.children = parent.children.flatMap((node) => {
                if (SKIP.has(node.type)) return [node];
                if (node.type === "text") return splitText(node);
                if ("children" in node) visit(node);
                return [node];
            });
        }

        if (known.size > 0) visit(tree);
    };
}
