export function speechParts(content: string): string[] {
    // Speak link labels and prose rather than Markdown delimiters or URL destinations.
    const text = content.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, "")
        .replace(/```[^\n]*\n/g, "").replace(/`/g, "").replace(/(\*\*|__)(.+?)\1/g, "$2").trim();
    const parts: string[] = [];
    let remaining = text;
    while (remaining.length > 4000) {
        const window = remaining.slice(0, 4001);
        const paragraph = window.lastIndexOf("\n\n");
        const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
        const word = window.lastIndexOf(" ");
        let boundary = paragraph > 2000 ? paragraph : sentence > 2000 ? sentence + 1 : word > 0 ? word : 4000;
        // JavaScript indexes UTF-16 units. Never split an emoji/surrogate pair
        // when a long word has no paragraph, sentence, or whitespace boundary.
        const before = remaining.charCodeAt(boundary - 1), after = remaining.charCodeAt(boundary);
        if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) boundary--;
        parts.push(remaining.slice(0, boundary).trim());
        remaining = remaining.slice(boundary).trimStart();
    }
    if (remaining) parts.push(remaining);
    return parts;
}
