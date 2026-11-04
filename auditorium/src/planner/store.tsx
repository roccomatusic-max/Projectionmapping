import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Plan } from "../shared/types";
import { defaultPlan } from "../shared/defaults";
import { api } from "./api";

const DRAFT_KEY = "auditorium.planner.draft.v1";

interface FileState {
  filePath: string | null;
  dirty: boolean;
  lastSavedAt: number | null;
}

interface Store {
  plan: Plan;
  /** Mutate a copy of the plan; the copy becomes the new state. */
  update: (fn: (draft: Plan) => void, label?: string) => void;
  replace: (plan: Plan) => void;
  undo: () => void;
  canUndo: boolean;
  file: FileState;
  newPlan: () => void;
  openPlan: () => Promise<void>;
  savePlan: (as?: boolean) => Promise<void>;
  status: string;
  setStatus: (s: string) => void;
}

const Ctx = createContext<Store | null>(null);

function loadDraft(): Plan | null {
  try {
    const text = localStorage.getItem(DRAFT_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text) as Plan;
    if (parsed?.schema !== "auditorium-plan") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Accept a parsed JSON object as a plan, or throw a readable error. */
export function validatePlan(obj: unknown): Plan {
  if (!obj || typeof obj !== "object") throw new Error("File is not a plan: not a JSON object.");
  const p = obj as Partial<Plan>;
  if (p.schema !== "auditorium-plan") throw new Error('File is not a plan: missing "schema": "auditorium-plan".');
  if (!p.room || !p.room.walls || !p.room.walls.left || !p.room.walls.right) throw new Error("Plan has no room walls.");
  if (!Array.isArray(p.projectors)) throw new Error("Plan has no projector list.");
  const base = defaultPlan();
  return {
    ...base,
    ...p,
    surface: { ...base.surface, ...(p.surface ?? {}) },
    audience: { ...base.audience, ...(p.audience ?? {}) },
    obstructions: p.obstructions ?? [],
  } as Plan;
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<Plan>(() => loadDraft() ?? defaultPlan());
  const [file, setFile] = useState<FileState>({ filePath: null, dirty: false, lastSavedAt: null });
  const [status, setStatus] = useState("Ready");
  const history = useRef<Plan[]>([]);
  const [historyLen, setHistoryLen] = useState(0);

  // Keep a draft in localStorage so a reload never loses work.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(plan));
    } catch {
      /* storage full or unavailable: ignore */
    }
  }, [plan]);

  const pushHistory = useCallback((p: Plan) => {
    history.current.push(p);
    if (history.current.length > 60) history.current.shift();
    setHistoryLen(history.current.length);
  }, []);

  const update = useCallback(
    (fn: (draft: Plan) => void) => {
      setPlan((prev) => {
        const draft = structuredClone(prev);
        fn(draft);
        pushHistory(prev);
        return draft;
      });
      setFile((f) => ({ ...f, dirty: true }));
    },
    [pushHistory],
  );

  const replace = useCallback(
    (p: Plan) => {
      setPlan((prev) => {
        pushHistory(prev);
        return p;
      });
      setFile((f) => ({ ...f, dirty: true }));
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    const prev = history.current.pop();
    setHistoryLen(history.current.length);
    if (prev) {
      setPlan(prev);
      setFile((f) => ({ ...f, dirty: true }));
      setStatus("Undone");
    }
  }, []);

  const newPlan = useCallback(() => {
    if (file.dirty && !window.confirm("Start a new plan? Unsaved changes will be lost.")) return;
    setPlan(defaultPlan());
    history.current = [];
    setHistoryLen(0);
    setFile({ filePath: null, dirty: false, lastSavedAt: null });
    setStatus("New plan");
  }, [file.dirty]);

  const openPlan = useCallback(async () => {
    if (file.dirty && !window.confirm("Open another plan? Unsaved changes will be lost.")) return;
    try {
      const res = await api.openPlan();
      if (!res) return;
      const parsed = validatePlan(JSON.parse(res.text));
      setPlan(parsed);
      history.current = [];
      setHistoryLen(0);
      setFile({ filePath: res.filePath, dirty: false, lastSavedAt: Date.now() });
      setStatus(`Opened ${res.filePath}`);
    } catch (err) {
      setStatus(`Could not open: ${(err as Error).message}`);
      window.alert(`Could not open that file.\n\n${(err as Error).message}`);
    }
  }, [file.dirty]);

  const savePlan = useCallback(
    async (as = false) => {
      try {
        const text = JSON.stringify(plan, null, 2);
        const res = await api.savePlan(text, as ? null : file.filePath, plan.name.replace(/[^\w.-]+/g, "-"));
        if (!res) return;
        setFile({ filePath: res.filePath, dirty: false, lastSavedAt: Date.now() });
        setStatus(`Saved ${res.filePath}`);
      } catch (err) {
        setStatus(`Could not save: ${(err as Error).message}`);
        window.alert(`Could not save.\n\n${(err as Error).message}`);
      }
    },
    [plan, file.filePath],
  );

  const value = useMemo<Store>(
    () => ({
      plan,
      update,
      replace,
      undo,
      canUndo: historyLen > 0,
      file,
      newPlan,
      openPlan,
      savePlan,
      status,
      setStatus,
    }),
    [plan, update, replace, undo, historyLen, file, newPlan, openPlan, savePlan, status],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlan(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("usePlan outside PlanProvider");
  return s;
}
