// Command dispatcher — the ONE rail every canvas mutation rides (spawn, delete,
// move, data edit, reveal, stage/deal, zone op, flip, swap …). Undo/redo works
// because commands store ABSOLUTE before/after snapshots: `do()` re-applies the
// after-state (redo-safe), `undo()` restores the before-state. Factories that
// derive a patch from current data evaluate ONCE at construction, reading the
// store fresh (keeps the lost-update fix from the updateFn era).
//
// Coalescing: commands with the same `coalesceKey` dispatched within the window
// merge into one undo step (keystroke bursts, slider drags). Node DRAGS are one
// step by construction — the route dispatches a single move command per drag on
// drag-stop. Text editors own Ctrl+Z while focused: the hotkey layer skips the
// bus when an input/textarea/contenteditable has focus (see isTypingTarget).

export interface Command {
  label: string;
  do(): void;
  undo(): void;
  coalesceKey?: string;
}

export class CommandBus {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private lastKey: string | null = null;
  private lastAt = 0;
  /** Max retained steps (drops oldest). */
  limit = 200;
  /** Same-key dispatches inside this window merge into one undo step. */
  coalesceMs = 1200;
  /** Fired on every dispatch/undo/redo — the scene-tab dirty tracker. */
  onMutate: (() => void) | null = null;

  dispatch(cmd: Command): void {
    cmd.do();
    this.onMutate?.();
    const now = Date.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (cmd.coalesceKey && cmd.coalesceKey === this.lastKey && now - this.lastAt < this.coalesceMs && top) {
      // merge: first undo wins (restores pre-burst state), latest do wins (redo → final state)
      this.undoStack[this.undoStack.length - 1] = {
        label: cmd.label,
        do: () => cmd.do(),
        undo: () => top.undo(),
        coalesceKey: cmd.coalesceKey,
      };
    } else {
      this.undoStack.push(cmd);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.lastKey = cmd.coalesceKey ?? null;
    this.lastAt = now;
    this.redoStack = [];
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    this.lastKey = null;
    this.onMutate?.();
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.do();
    this.undoStack.push(cmd);
    this.lastKey = null;
    this.onMutate?.();
    return true;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  /** Scene load / new scene: history refers to nodes that no longer exist. */
  clear(): void { this.undoStack = []; this.redoStack = []; this.lastKey = null; }
  depth(): { undo: number; redo: number } { return { undo: this.undoStack.length, redo: this.redoStack.length }; }
}

/** The canvas's bus — one per app (the canvas route is a singleton page). */
export const bus = new CommandBus();

/** True when a text editor owns the keyboard — hotkeys (incl. Ctrl+Z) stand down. */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

// ---------------------------------------------------------------------------
// Factories. `Rf` is the slice of ReactFlowInstance the commands need — typed
// narrow so tests can pass a plain fake.
// ---------------------------------------------------------------------------
export interface RfLike {
  getNode(id: string): { id: string; position: { x: number; y: number }; data: Record<string, unknown> } | undefined;
  updateNodeData(id: string, patch: Record<string, unknown>): void;
  setNodes(updater: (nodes: any[]) => any[]): void;
  addNodes(nodes: any[]): void;
  getEdges(): any[];
  setEdges(updater: (edges: any[]) => any[]): void;
}

const pick = (obj: Record<string, unknown>, keys: string[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
};

/** Absolute data patch: undo restores the previous values of exactly the patched keys. */
export function patchDataCmd(rf: RfLike, id: string, patch: Record<string, unknown>, label: string, coalesceKey?: string): Command | null {
  const node = rf.getNode(id);
  if (!node) return null;
  const before = structuredClone(pick(node.data, Object.keys(patch)));
  const after = structuredClone(patch);
  return {
    label,
    coalesceKey,
    do: () => rf.updateNodeData(id, structuredClone(after)),
    undo: () => rf.updateNodeData(id, structuredClone(before)),
  };
}

/** Functional patch: fn(currentData) evaluated ONCE now, against the live store. */
export function patchDataFnCmd(rf: RfLike, id: string, fn: (data: Record<string, unknown>) => Record<string, unknown>, label: string, coalesceKey?: string): Command | null {
  const node = rf.getNode(id);
  if (!node) return null;
  const patch = fn(node.data);
  return patchDataCmd(rf, id, patch, label, coalesceKey);
}

/** Spawn: undo removes the nodes (and any edges they grew in the meantime). */
export function addNodesCmd(rf: RfLike, nodes: any[], label: string): Command {
  const snapshot = structuredClone(nodes);
  const ids = new Set(nodes.map((n: { id: string }) => n.id));
  return {
    label,
    do: () => rf.addNodes(structuredClone(snapshot)),
    undo: () => {
      rf.setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
      rf.setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    },
  };
}

/** Delete: undo restores the exact nodes AND their edges. */
export function removeNodesCmd(rf: RfLike, ids: string[], label: string): Command | null {
  const idSet = new Set(ids);
  const nodes: any[] = [];
  for (const id of ids) {
    const n = rf.getNode(id);
    if (n) nodes.push(structuredClone(n));
  }
  if (nodes.length === 0) return null;
  const edges = structuredClone(rf.getEdges().filter((e) => idSet.has(e.source) || idSet.has(e.target)));
  return {
    label,
    do: () => {
      rf.setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
      rf.setEdges((eds) => eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
    },
    undo: () => {
      rf.addNodes(structuredClone(nodes));
      rf.setEdges((eds) => [...eds, ...structuredClone(edges)]);
    },
  };
}

/** Several commands as ONE undo step (hide-all, sweep, tidy…). */
export function compositeCmd(cmds: (Command | null)[], label: string): Command | null {
  const real = cmds.filter((c): c is Command => !!c);
  if (real.length === 0) return null;
  return {
    label,
    do: () => { for (const c of real) c.do(); },
    undo: () => { for (const c of [...real].reverse()) c.undo(); },
  };
}

/** One drag (possibly multi-select) = one undo step. Positions are absolute. */
export function moveNodesCmd(
  rf: RfLike,
  moves: { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[],
  label: string,
): Command | null {
  const real = moves.filter((m) => m.from.x !== m.to.x || m.from.y !== m.to.y);
  if (real.length === 0) return null;
  const apply = (key: "from" | "to") => {
    const byId = new Map(real.map((m) => [m.id, m[key]]));
    rf.setNodes((nds) => nds.map((n) => (byId.has(n.id) ? { ...n, position: { ...byId.get(n.id)! } } : n)));
  };
  return { label, do: () => apply("to"), undo: () => apply("from") };
}
