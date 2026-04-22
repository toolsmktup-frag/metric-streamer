import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,:;!?)\]}'"])/gi;

/**
 * Splits text into segments, converting URLs into clickable anchor tags.
 * Preserves whitespace and inherits color from parent (text-current).
 */
export function linkify(text: string | null | undefined): React.ReactNode[] {
  if (!text) return [];
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Reset regex state
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const url = match[0];
    const start = match.index;
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }
    parts.push(
      <a
        key={`${start}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="underline underline-offset-2 hover:opacity-80 break-all text-current"
      >
        {url}
      </a>
    );
    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
