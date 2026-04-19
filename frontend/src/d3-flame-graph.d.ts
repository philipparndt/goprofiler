declare module "d3-flame-graph" {
  interface FlameGraphNode {
    data: { name: string; value: number; samples?: number };
    value: number;
    highlight?: boolean;
  }

  interface FlameGraphTooltip {
    show(event: MouseEvent, d: FlameGraphNode): void;
    hide(): void;
  }

  interface FlameGraph {
    width(w: number): this;
    cellHeight(h: number): this;
    inverted(v: boolean): this;
    minFrameSize(s: number): this;
    transitionDuration(d: number): this;
    tooltip(v: boolean | FlameGraphTooltip): this;
    selfValue(v: boolean): this;
    setColorMapper(fn: (d: FlameGraphNode, originalColor: string) => string): this;
    onClick(handler: (d: FlameGraphNode) => void): this;
    search(term: string): void;
    resetZoom(): void;
    (selection: any): void;
  }

  export default function flamegraph(): FlameGraph;
  export function colorMapper(d: FlameGraphNode): string;
  export function defaultFlamegraphTooltip(): FlameGraphTooltip;
}
