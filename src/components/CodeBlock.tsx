"use client";

import React, { useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { LuCheck, LuCopy, LuDownload, LuWrapText } from "react-icons/lu";
import { useSettings } from "./providers/settings";
import { cn, Tooltip } from "./ui/primitives";

// Strip the theme's own backgrounds so the block uses our surface colors
const clean = (theme: Record<string, React.CSSProperties>) => ({
  ...theme,
  'pre[class*="language-"]': {
    ...theme['pre[class*="language-"]'],
    background: "transparent",
    margin: 0,
    fontFamily: "var(--mono)",
  },
  'code[class*="language-"]': {
    ...theme['code[class*="language-"]'],
    background: "transparent",
    fontFamily: "var(--mono)",
  },
});
const darkTheme = clean(oneDark);
const lightTheme = clean(oneLight);

const EXT: Record<string, string> = {
  javascript: "js", js: "js", typescript: "ts", ts: "ts", tsx: "tsx", jsx: "jsx",
  python: "py", py: "py", ruby: "rb", go: "go", rust: "rs", java: "java",
  kotlin: "kt", swift: "swift", c: "c", cpp: "cpp", csharp: "cs", cs: "cs",
  php: "php", html: "html", css: "css", scss: "scss", json: "json", yaml: "yml",
  yml: "yml", bash: "sh", sh: "sh", shell: "sh", zsh: "sh", powershell: "ps1",
  sql: "sql", markdown: "md", md: "md", xml: "xml", toml: "toml", dockerfile: "Dockerfile",
};

const LABELS: Record<string, string> = {
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript",
  tsx: "TSX", jsx: "JSX", py: "Python", python: "Python", sh: "Shell", bash: "Bash",
  shell: "Shell", cpp: "C++", cs: "C#", csharp: "C#", html: "HTML", css: "CSS",
  json: "JSON", sql: "SQL", yaml: "YAML", yml: "YAML", md: "Markdown", text: "Text",
  plaintext: "Text", powershell: "PowerShell", ps1: "PowerShell",
};

interface CodeBlockProps {
  language?: string;
  value: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const { resolvedTheme } = useSettings();
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);

  const lang = (language || "text").toLowerCase();
  const label = LABELS[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
  const lineCount = useMemo(() => value.split("\n").length, [value]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const download = () => {
    const ext = EXT[lang] ?? "txt";
    const blob = new Blob([value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ext === "Dockerfile" ? "Dockerfile" : `snippet.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="not-prose group/code my-4 overflow-hidden rounded-xl border border-line bg-code">
      <div className="flex h-10 items-center justify-between border-b border-line bg-surface/60 pl-4 pr-1.5">
        <span className="font-mono text-xs text-fg-muted">{label}</span>
        <div className="flex items-center gap-0.5">
          <Tooltip label={wrap ? "Don't wrap lines" : "Wrap lines"}>
            <button
              type="button"
              onClick={() => setWrap((w) => !w)}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg",
                wrap && "text-fg"
              )}
              aria-label="Toggle line wrap"
            >
              <LuWrapText size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Download">
            <button
              type="button"
              onClick={download}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
              aria-label="Download code"
            >
              <LuDownload size={14} />
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg"
            aria-label="Copy code"
          >
            {copied ? <LuCheck size={14} className="text-accent" /> : <LuCopy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto text-[13px] leading-6">
        <SyntaxHighlighter
          language={lang}
          style={resolvedTheme === "dark" ? darkTheme : lightTheme}
          showLineNumbers={lineCount > 4}
          lineNumberStyle={{ minWidth: "2.25em", paddingRight: "1em", color: "var(--fg-subtle)", opacity: 0.6 }}
          wrapLongLines={wrap}
          customStyle={{ background: "transparent", margin: 0, padding: "14px 16px", fontSize: "13px" }}
          codeTagProps={{ style: { fontFamily: "var(--mono)" } }}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default CodeBlock;
