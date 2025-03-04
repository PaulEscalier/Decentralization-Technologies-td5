export type NodeState = {
  killed: boolean;
  x: Value | null;
  decided: boolean | null;
  k: number | null;
};

export type Message = {
  phase: 1 | 2;
  x: 0 | 1 | "?" | null;
  k: number;
  nodeId: number;
}

export type Value = 0 | 1 | "?";
