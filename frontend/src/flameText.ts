import type { FlameNode } from "./api";
import { isWails } from "./api";
import { ClipboardSetText } from "./wailsjs/runtime/runtime";

// Cap the copied tree: a full heap profile can have tens of thousands of
// frames, which is unwieldy on the clipboard and useless in an AI chat.
const MAX_LINES = 2000;

/**
 * flameSubtreeToText renders a flame graph segment and all of its children as
 * an indented text tree, e.g. for pasting into an AI chat:
 *
 *   main.handleMessage 1.20s (45.3%)
 *     main.processEvent 800ms (30.1%)
 *       encoding/json.Unmarshal 500ms (18.8%)
 *
 * Percentages are relative to the whole profile. Children are sorted by
 * descending value; zero-value frames are skipped.
 */
export function flameSubtreeToText(
  node: FlameNode,
  rootValue: number,
  format: (v: number) => string,
): string {
  const lines: string[] = [];
  let omitted = 0;

  const countNodes = (n: FlameNode): number =>
    1 + (n.children?.reduce((sum, c) => sum + countNodes(c), 0) ?? 0);

  const walk = (n: FlameNode, depth: number) => {
    if (lines.length >= MAX_LINES) {
      omitted += countNodes(n);
      return;
    }
    const pct = rootValue > 0 ? ` (${((n.value / rootValue) * 100).toFixed(1)}%)` : "";
    lines.push(`${"  ".repeat(depth)}${n.name} ${format(n.value)}${pct}`);
    if (!n.children) return;
    const children = [...n.children]
      .filter((c) => c.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    for (const child of children) walk(child, depth + 1);
  };
  walk(node, 0);

  if (omitted > 0) {
    lines.push(`… ${omitted} more frames omitted`);
  }
  return lines.join("\n");
}

// findFlameNode returns the first node with the given name (depth-first).
export function findFlameNode(root: FlameNode, name: string): FlameNode | null {
  const stack = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n.name === name) return n;
    if (n.children) {
      for (const child of n.children) stack.push(child);
    }
  }
  return null;
}

/**
 * copyToClipboard writes text to the system clipboard, preferring the Wails
 * runtime (navigator.clipboard is unreliable in WKWebView without focus).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (isWails()) {
    try {
      return await ClipboardSetText(text);
    } catch {
      // fall through to the browser API
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
