declare module "d3-flame-graph" {
  interface FlameGraphNode {
    data: { name: string; value: number };
    highlight?: boolean;
  }

  interface FlameGraph {
    width(w: number): this;
    cellHeight(h: number): this;
    inverted(v: boolean): this;
    minFrameSize(s: number): this;
    transitionDuration(d: number): this;
    tooltip(v: boolean): this;
    selfValue(v: boolean): this;
    setColorMapper(fn: (d: FlameGraphNode, originalColor: string) => string): this;
    search(term: string): void;
    resetZoom(): void;
    (selection: any): void;
  }

  export default function flamegraph(): FlameGraph;
  export function colorMapper(d: FlameGraphNode): string;
  export function tooltip(enabled: boolean): void;
}
