import React, { useState, useMemo } from 'react';
import { marked } from 'marked';
import { Check, Copy } from 'lucide-react';

interface MarkdownViewProps {
  content: string;
  isStreaming?: boolean;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, isStreaming }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCode = (codeText: string, btnId: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedId(btnId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const parts = useMemo(() => {
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const segments: Array<{ type: 'text' | 'code'; content: string; language?: string; id?: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    let index = 0;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: content.slice(lastIndex, match.index),
        });
      }
      segments.push({
        type: 'code',
        language: match[1] || 'plaintext',
        content: match[2],
        id: `code-${index++}`,
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex),
      });
    }

    return segments;
  }, [content]);

  if (parts.length === 0) {
    return (
      <div className="relative text-xs text-neutral-400">
        <span>Đang chờ phản hồi...</span>
        {isStreaming && <span className="inline-block w-1.5 h-3 ml-1 bg-neutral-900 dark:bg-neutral-100 animate-pulse align-middle" />}
      </div>
    );
  }

  return (
    <div className="text-neutral-900 dark:text-neutral-100 text-[14px] leading-relaxed space-y-2">
      {parts.map((part, idx) => {
        if (part.type === 'code') {
          const isCopied = copiedId === part.id;
          return (
            <div
              key={idx}
              className="my-2.5 rounded-xl overflow-hidden border border-neutral-300 dark:border-neutral-800 bg-neutral-100/80 dark:bg-neutral-950 shadow-xs"
            >
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-neutral-200/80 dark:bg-neutral-900 border-b border-neutral-300 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                <span className="uppercase tracking-wider font-semibold text-[11px]">
                  {part.language || 'code'}
                </span>
                <button
                  type="button"
                  onClick={() => part.id && handleCopyCode(part.content, part.id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors text-xs border border-neutral-300 dark:border-neutral-700 cursor-pointer"
                  title="Sao chép mã"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[11px]">Sao chép</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 overflow-x-auto text-[13px] font-mono leading-relaxed text-neutral-800 dark:text-neutral-200 m-0 bg-transparent">
                <code>{part.content}</code>
              </pre>
            </div>
          );
        }

        const html = marked.parse(part.content || '') as string;
        return (
          <div
            key={idx}
            className="markdown-body space-y-1.5 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-400 dark:[&_blockquote]:border-neutral-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-neutral-600 dark:[&_blockquote]:text-neutral-400 [&_blockquote]:my-1.5 [&_code]:px-1.5 [&_code]:py-0.2 [&_code]:rounded [&_code]:bg-neutral-200/70 dark:[&_code]:bg-neutral-800 [&_code]:text-neutral-900 dark:[&_code]:text-neutral-200 [&_code]:font-mono [&_code]:text-xs [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-neutral-300 dark:[&_th]:border-neutral-700 [&_th]:p-1.5 [&_th]:bg-neutral-100 dark:[&_th]:bg-neutral-850 [&_th]:text-left [&_td]:border [&_td]:border-neutral-300 dark:[&_td]:border-neutral-700 [&_td]:p-1.5 [&_a]:text-neutral-900 dark:[&_a]:text-neutral-100 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 ml-1 bg-neutral-900 dark:bg-neutral-100 rounded-xs animate-pulse align-middle" />
      )}
    </div>
  );
};
