export interface CodeBlockRange {
  startLine: number;
  endLineExclusive: number;
  text: string;
}

export function resolveCodeBlockRange(lines: string[], startLine: number, endLine: number): CodeBlockRange {
  let start = clampLine(startLine, lines.length);
  let endExclusive = clampLine(endLine, lines.length);

  if (endExclusive <= start) endExclusive = Math.min(lines.length, start + 1);

  if (!isFence(lines[start])) {
    for (let i = start - 1; i >= 0; i--) {
      if (isFence(lines[i])) {
        start = i;
        break;
      }
      if (lines[i].trim() !== '') break;
    }
  }

  if (endExclusive < lines.length && isFence(lines[endExclusive])) {
    endExclusive += 1;
  }

  if (!isFence(lines[endExclusive - 1])) {
    for (let i = endExclusive; i < lines.length; i++) {
      if (isFence(lines[i])) {
        endExclusive = i + 1;
        break;
      }
    }
  }

  return {
    startLine: start,
    endLineExclusive: endExclusive,
    text: lines.slice(start, endExclusive).join('\n'),
  };
}

export function extractCodeBlockBody(blockText: string): string {
  const lines = blockText.split('\n');
  if (isFence(lines[0])) lines.shift();
  if (isFence(lines.at(-1))) lines.pop();
  return lines.join('\n');
}

export function replaceCodeBlockBody(blockText: string, body: string): string {
  const lines = blockText.split('\n');
  const openingFence = isFence(lines[0]) ? lines[0] : undefined;
  const closingFence = isFence(lines.at(-1)) ? lines.at(-1) : undefined;
  if (openingFence && closingFence) return [openingFence, body, closingFence].join('\n');
  return body;
}

function isFence(line: string | undefined): boolean {
  return Boolean(line?.trim().startsWith('```'));
}

function clampLine(line: number, lineCount: number): number {
  return Math.min(Math.max(0, line), lineCount);
}
