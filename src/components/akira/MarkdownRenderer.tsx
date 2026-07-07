import React, { useState } from "react";
import { Copy, Check, Square, CheckSquare } from "lucide-react";

export type BlockToken =
  | { type: "code-block"; lang: string; content: string; isClosed: boolean }
  | { type: "header"; level: number; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: { text: string; checked?: boolean }[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "paragraph"; text: string };

/**
 * Line-by-line streaming-safe Markdown parser.
 */
export function parseMarkdown(text: string): BlockToken[] {
  const lines = text.split("\n");
  const blocks: BlockToken[] = [];

  let currentCodeBlock: {
    type: "code-block";
    lang: string;
    content: string;
    isClosed: boolean;
  } | null = null;
  let currentList: {
    type: "list";
    ordered: boolean;
    items: { text: string; checked?: boolean }[];
  } | null = null;
  let currentTable: { type: "table"; headers: string[]; rows: string[][] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- 1. Code Block Handling ---
    if (currentCodeBlock) {
      if (line.trim().startsWith("```")) {
        currentCodeBlock.isClosed = true;
        blocks.push(currentCodeBlock);
        currentCodeBlock = null;
      } else {
        currentCodeBlock.content += (currentCodeBlock.content ? "\n" : "") + line;
      }
      continue;
    }

    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      currentCodeBlock = { type: "code-block", lang, content: "", isClosed: false };

      // Flush list or table if any
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      if (currentTable) {
        blocks.push(currentTable);
        currentTable = null;
      }
      continue;
    }

    // --- 2. Table Handling ---
    const isTableRow = line.trim().startsWith("|") && line.trim().endsWith("|");
    if (isTableRow) {
      // Flush list if any
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }

      const cells = line
        .split("|")
        .map((c) => c.trim())
        .slice(1, -1);

      if (!currentTable) {
        currentTable = { type: "table", headers: cells, rows: [] };
      } else {
        // Check if this line is a separator line (e.g. |---|---|)
        const isSeparator = cells.every(
          (c) => (c.startsWith("-") && c.endsWith("-")) || c === "---" || c === "--" || c === "-",
        );
        if (!isSeparator) {
          currentTable.rows.push(cells);
        }
      }
      continue;
    } else {
      if (currentTable) {
        blocks.push(currentTable);
        currentTable = null;
      }
    }

    // --- 3. List Handling ---
    const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.*)/);
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.*)/);

    if (unorderedMatch || orderedMatch) {
      const isOrdered = !!orderedMatch;
      const content = unorderedMatch ? unorderedMatch[2] : orderedMatch![2];

      // Check if it's a task list item
      let checked: boolean | undefined = undefined;
      let listContent = content;
      if (content.startsWith("[ ] ")) {
        checked = false;
        listContent = content.slice(4);
      } else if (content.startsWith("[x] ") || content.startsWith("[X] ")) {
        checked = true;
        listContent = content.slice(4);
      }

      if (currentList && currentList.ordered === isOrdered) {
        currentList.items.push({ text: listContent, checked });
      } else {
        if (currentList) {
          blocks.push(currentList);
        }
        currentList = { type: "list", ordered: isOrdered, items: [{ text: listContent, checked }] };
      }
      continue;
    } else {
      // If it's a blank line, it ends the list
      if (!line.trim()) {
        if (currentList) {
          blocks.push(currentList);
          currentList = null;
        }
        continue;
      }
      // If it's a continuation of the last list item and starts with indentation
      if (currentList && line.startsWith("  ")) {
        const lastItem = currentList.items[currentList.items.length - 1];
        if (lastItem) {
          lastItem.text += "\n" + line.trim();
        }
        continue;
      }
    }

    // Flush list if we are not continuing it
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }

    // --- 4. Headers ---
    const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      blocks.push({
        type: "header",
        level: headerMatch[1].length,
        text: headerMatch[2].trim(),
      });
      continue;
    }

    // --- 5. Blockquotes ---
    if (line.trim().startsWith(">")) {
      const quoteText = line.trim().replace(/^>\s?/, "");
      blocks.push({ type: "blockquote", text: quoteText });
      continue;
    }

    // --- 6. Regular Paragraph ---
    blocks.push({ type: "paragraph", text: line });
  }

  // Flush remaining buffers
  if (currentCodeBlock) blocks.push(currentCodeBlock);
  if (currentTable) blocks.push(currentTable);
  if (currentList) blocks.push(currentList);

  return blocks;
}

/**
 * Regex-based inline style formatter for bold, italics, inline code, and links.
 */
export function renderInlineText(text: string): React.ReactNode {
  if (!text) return "";

  const tokens: (string | React.ReactNode)[] = [];
  let remaining = text;

  while (remaining) {
    const codeMatch = remaining.match(/`([^`]+)`/);
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const italicMatch = remaining.match(/\*([^*]+)\*/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches: { index: number; length: number; node: React.ReactNode }[] = [];

    if (codeMatch && codeMatch.index !== undefined) {
      matches.push({
        index: codeMatch.index,
        length: codeMatch[0].length,
        node: (
          <code
            key={`code-${codeMatch.index}`}
            className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs text-pink-400 border border-white/5"
          >
            {codeMatch[1]}
          </code>
        ),
      });
    }

    if (boldMatch && boldMatch.index !== undefined) {
      matches.push({
        index: boldMatch.index,
        length: boldMatch[0].length,
        node: (
          <strong key={`bold-${boldMatch.index}`} className="font-semibold text-white">
            {boldMatch[1]}
          </strong>
        ),
      });
    }

    if (italicMatch && italicMatch.index !== undefined) {
      matches.push({
        index: italicMatch.index,
        length: italicMatch[0].length,
        node: (
          <em key={`italic-${italicMatch.index}`} className="italic text-muted-foreground">
            {italicMatch[1]}
          </em>
        ),
      });
    }

    if (linkMatch && linkMatch.index !== undefined) {
      matches.push({
        index: linkMatch.index,
        length: linkMatch[0].length,
        node: (
          <a
            key={`link-${linkMatch.index}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-glow hover:underline inline-flex items-center gap-0.5 transition-colors duration-150"
          >
            {linkMatch[1]}
          </a>
        ),
      });
    }

    if (matches.length === 0) {
      tokens.push(remaining);
      break;
    }

    matches.sort((a, b) => a.index - b.index);
    const firstMatch = matches[0];

    if (firstMatch.index > 0) {
      tokens.push(remaining.slice(0, firstMatch.index));
    }

    tokens.push(firstMatch.node);
    remaining = remaining.slice(firstMatch.index + firstMatch.length);
  }

  return <>{tokens}</>;
}

/**
 * Highlights a line of code with simple syntax tokens.
 */
function highlightCodeLine(line: string, lang: string): React.ReactNode {
  const language = (lang || "").toLowerCase();

  // If we don't have support for the language, render it plain
  if (
    ![
      "javascript",
      "typescript",
      "js",
      "ts",
      "python",
      "py",
      "json",
      "css",
      "html",
      "rust",
      "rs",
      "bash",
      "sh",
    ].includes(language)
  ) {
    return line;
  }

  const keywordRegex =
    /\b(const|let|var|function|return|class|import|export|from|default|async|await|if|else|for|while|try|catch|throw|new|this|true|false|null|undefined|fn|mut|pub|use|impl|trait|struct|enum|as|match|self|Self|def|elif|in|is|not|and|or|lambda)\b/g;
  const commentRegex = /(\/\/.*|#.*)/g;
  const stringRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g;
  const numberRegex = /\b(\d+)\b/g;
  const typeRegex =
    /\b(number|string|boolean|any|void|unknown|Promise|type|interface|React|useState|useEffect|useRef|useMemo|useCallback)\b/g;

  let parts: {
    type: "text" | "keyword" | "string" | "comment" | "number" | "type";
    value: string;
  }[] = [{ type: "text", value: line }];

  // comments
  parts = parts.flatMap((part) => {
    if (part.type !== "text") return [part];
    const sub: typeof parts = [];
    let lastIdx = 0;
    part.value.replace(commentRegex, (match, p1, offset) => {
      if (offset > lastIdx) {
        sub.push({ type: "text", value: part.value.slice(lastIdx, offset) });
      }
      sub.push({ type: "comment", value: match });
      lastIdx = offset + match.length;
      return match;
    });
    if (lastIdx < part.value.length) {
      sub.push({ type: "text", value: part.value.slice(lastIdx) });
    }
    return sub;
  });

  // strings
  parts = parts.flatMap((part) => {
    if (part.type !== "text") return [part];
    const sub: typeof parts = [];
    let lastIdx = 0;
    part.value.replace(stringRegex, (match, p1, offset) => {
      if (offset > lastIdx) {
        sub.push({ type: "text", value: part.value.slice(lastIdx, offset) });
      }
      sub.push({ type: "string", value: match });
      lastIdx = offset + match.length;
      return match;
    });
    if (lastIdx < part.value.length) {
      sub.push({ type: "text", value: part.value.slice(lastIdx) });
    }
    return sub;
  });

  // keywords, types, numbers
  parts = parts.flatMap((part) => {
    if (part.type !== "text") return [part];
    const combinedRegex =
      /\b(const|let|var|function|return|class|import|export|from|default|async|await|if|else|for|while|try|catch|throw|new|this|true|false|null|undefined|fn|mut|pub|use|impl|trait|struct|enum|as|match|self|Self|def|elif|in|is|not|and|or|lambda|number|string|boolean|any|void|unknown|Promise|type|interface|React|useState|useEffect|useRef|useMemo|useCallback|\d+)\b/g;

    const sub: typeof parts = [];
    let lastIdx = 0;
    part.value.replace(combinedRegex, (match, offset) => {
      if (offset > lastIdx) {
        sub.push({ type: "text", value: part.value.slice(lastIdx, offset) });
      }

      let type: (typeof parts)[0]["type"] = "text";
      if (keywordRegex.test(match)) {
        type = "keyword";
      } else if (typeRegex.test(match)) {
        type = "type";
      } else if (numberRegex.test(match)) {
        type = "number";
      }

      keywordRegex.lastIndex = 0;
      typeRegex.lastIndex = 0;
      numberRegex.lastIndex = 0;

      sub.push({ type, value: match });
      lastIdx = offset + match.length;
      return match;
    });
    if (lastIdx < part.value.length) {
      sub.push({ type: "text", value: part.value.slice(lastIdx) });
    }
    return sub;
  });

  return (
    <>
      {parts.map((p, idx) => {
        let className = "";
        if (p.type === "keyword") className = "text-violet font-semibold";
        else if (p.type === "type") className = "text-cyan-glow";
        else if (p.type === "string") className = "text-amber-300";
        else if (p.type === "comment") className = "text-muted-foreground/60 italic";
        else if (p.type === "number") className = "text-orange-400";
        return (
          <span key={idx} className={className}>
            {p.value}
          </span>
        );
      })}
    </>
  );
}

/**
 * Renders a full code block with numbers, line wrapping, and copy button.
 */
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code: ", err);
    }
  };

  const lines = code.split("\n");

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/10 bg-[#07090e] shadow-lg">
      <div className="flex items-center justify-between border-b border-white/5 bg-[#0a0d14] px-4 py-2 text-xs font-mono text-muted-foreground">
        <span>{lang || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:bg-white/[0.06] hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy Code
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto max-h-[400px] scrollbar">
        <div className="table w-full border-collapse">
          {lines.map((line, idx) => (
            <div key={idx} className="table-row min-h-[1.5rem]">
              <span className="table-cell select-none pr-4 text-right text-[10px] text-muted-foreground/30 font-mono w-8 border-r border-white/5">
                {idx + 1}
              </span>
              <span className="table-cell pl-4 font-mono text-xs whitespace-pre-wrap break-all leading-relaxed align-top">
                {highlightCodeLine(line, lang)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Main Markdown rendering component.
 */
export function MarkdownRenderer({ content }: { content: string }) {
  const blocks = parseMarkdown(content || "");

  return (
    <div className="space-y-4 text-foreground/90 leading-relaxed text-sm">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "header": {
            const Tag = `h${Math.min(block.level, 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
            const fontClasses =
              block.level === 1
                ? "text-xl font-bold font-display text-white pb-1 border-b border-white/10 mt-6 mb-2"
                : block.level === 2
                  ? "text-lg font-bold font-display text-white pb-0.5 border-b border-white/5 mt-5 mb-2"
                  : block.level === 3
                    ? "text-base font-semibold font-display text-white mt-4 mb-1.5"
                    : "text-sm font-semibold font-display text-white mt-3 mb-1";
            return (
              <Tag key={idx} className={fontClasses}>
                {renderInlineText(block.text)}
              </Tag>
            );
          }

          case "blockquote":
            return (
              <blockquote
                key={idx}
                className="my-3 border-l-4 border-violet bg-white/[0.02] px-4 py-2.5 rounded-r-lg italic text-muted-foreground/90 font-medium"
              >
                {renderInlineText(block.text)}
              </blockquote>
            );

          case "code-block":
            return <CodeBlock key={idx} code={block.content} lang={block.lang} />;

          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            const listClasses = block.ordered ? "list-decimal pl-6 space-y-1.5" : "space-y-1.5";
            return (
              <ListTag key={idx} className={listClasses}>
                {block.items.map((item, itemIdx) => {
                  if (item.checked !== undefined) {
                    return (
                      <li key={itemIdx} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 shrink-0 text-cyan-glow">
                          {item.checked ? (
                            <CheckSquare className="h-4.5 w-4.5 text-cyan-glow" />
                          ) : (
                            <Square className="h-4.5 w-4.5 text-muted-foreground/50" />
                          )}
                        </span>
                        <span className={item.checked ? "line-through text-muted-foreground" : ""}>
                          {renderInlineText(item.text)}
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={itemIdx} className="relative pl-5 text-sm">
                      {!block.ordered && (
                        <span className="absolute left-1.5 top-2.5 h-1.5 w-1.5 rounded-full bg-cyan-glow/80 shadow-[0_0_6px_oklch(0.85_0.13_200)]" />
                      )}
                      {block.ordered && (
                        <span className="absolute left-0 text-xs font-mono text-muted-foreground">
                          {itemIdx + 1}.
                        </span>
                      )}
                      <span>{renderInlineText(item.text)}</span>
                    </li>
                  );
                })}
              </ListTag>
            );
          }

          case "table":
            return (
              <div
                key={idx}
                className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.01] shadow"
              >
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.04]">
                      {block.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          className="px-4 py-2.5 font-semibold text-white uppercase tracking-wider text-[10px]"
                        >
                          {renderInlineText(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-4 py-2.5 text-muted-foreground/90 font-medium"
                          >
                            {renderInlineText(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "paragraph":
          default:
            if (!block.text.trim()) return null;
            return (
              <p key={idx} className="text-sm text-foreground/95 leading-relaxed">
                {renderInlineText(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
