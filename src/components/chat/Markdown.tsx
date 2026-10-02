"use client";

import React, { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "../CodeBlock";

// Renders assistant Markdown (GFM: tables, task lists, strikethrough, autolinks)
const Markdown = memo(function Markdown({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className={streaming ? "prose-iris is-streaming" : "prose-iris"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          code: ({ className, children, node, ...props }) => {
            const text = String(children ?? "");
            const lang = /language-([\w+#-]+)/.exec(className || "")?.[1];
            // Fenced blocks have a language or span multiple lines
            if (lang || text.includes("\n")) {
              return <CodeBlock language={lang} value={text.replace(/\n$/, "")} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          table: ({ node, ...props }) => (
            <div className="table-scroll my-4 max-w-full overflow-x-auto rounded-xl border border-line">
              <table {...props} />
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
