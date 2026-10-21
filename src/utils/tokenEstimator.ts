/**
 * Token estimation utility for AI requests and responses.
 * Provides accurate heuristic counting for Vietnamese, English, and programming code.
 */

export function estimateTokens(text: string): number {
  if (!text) return 0;

  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  let tokens = 0;

  // Check for code blocks
  const hasCode = trimmed.includes('```') || trimmed.includes('{') || trimmed.includes('function') || trimmed.includes('const ');
  
  // Check for Vietnamese characters
  const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  const isVietnamese = vietnameseRegex.test(trimmed);

  if (hasCode) {
    // Code typically averages ~3.2 characters per token due to symbols and indentation
    tokens = Math.ceil(trimmed.length / 3.2);
  } else if (isVietnamese) {
    // Vietnamese words/syllables: words split by spaces typically take ~1.35 tokens on average
    const words = trimmed.split(/\s+/).filter(Boolean);
    tokens = Math.ceil(words.length * 1.35) + Math.ceil(trimmed.length / 10);
  } else {
    // Standard English: ~4 characters per token or ~1.3 tokens per word
    const words = trimmed.split(/\s+/).filter(Boolean);
    tokens = Math.ceil(words.length * 1.3);
  }

  return Math.max(tokens, 1);
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return `${tokens}`;
}
