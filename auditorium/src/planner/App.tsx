import { useEffect, useState } from "react";
import { api } from "./api";
import { useAnalysis } from "./analysis";
import { AudiencePanel } from "./components/AudiencePanel";
import { ObstructionsPanel } from "./components/ObstructionsPanel";
import { ProjectorsPanel } from "./components/ProjectorsPanel";
import { RoomPanel } from "./components/RoomPanel";
import { SurfacePanel } from "./components/SurfacePanel";
import { usePlan } from "./store";
import { ElevationView } from "./views/ElevationView";
import { HelpPanel } from "./views/HelpPanel";
import { ResultsPanel } from "./views/ResultsPanel";
import { TopDownView } from "./views/TopDownView";

type SideTab = "room" | "audience" | "projectors" | "obstructions" | "surface";
type ViewTab = "top" | "left" | "right" | "help";

export function App() {
  const store = usePlan();
  const { plan, update, file, status } = store;
  const analysis = useAnalysis(plan);
  const [side, setSide] = useState<SideTab>("projectors");
  const [view, setView] = useState<ViewTab>("top");
  const [selectedId, setSelectedId] = useState<string | null>(plan.projectors[0]?.id ?? null);
  const [info, setInfo] = useState<{ version: string; electron: string } | null>(null);

  useEffect(() => {
    api.appInfo().then(setInfo).catch(() => {});
  }, []);

  // Menu actions from the Electron main process and keyboard shortcuts.
  useEffect(() => {
    const off = api.onMenu((action) => {
      if (action === "new") store.newPlan();
      if (action === "open") void store.openPlan();
      if (action === "save") void store.savePlan(false);
      if (action === "saveAs") void store.savePlan(true);
      if (action === "help") setView("help");
    });
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        store.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  }, [store]);

  const title = `${plan.name}${file.dirty ? " •" : ""}`;
  useEffect(() => {
    document.title = `${title} — Auditorium Projection Planner`;
  }, [title]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">▣</span>
          <span>Planner</span>
        </div>
        <input
          className="input plan-name"
          value={plan.name}
          onChange={(e) =>
            update((d) => {
              d.name = e.target.value;
            })
          }
          title="Plan name"
        />
        {file.dirty && <span className="dirty" title="Unsaved changes">•</span>}
        <div className="spacer" />
        <div className="seg">
          <button className={plan.units === "imperial" ? "on" : ""} onClick={() => update((d) => void (d.units = "imperial"))}>
            ft / in
          </button>
          <button className={plan.units === "metric" ? "on" : ""} onClick={() => update((d) => void (d.units = "metric"))}>
            metric
          </button>
        </div>
        <button className="btn" onClick={store.undo} disabled={!store.canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button className="btn" onClick={store.newPlan}>
          New
        </button>
        <button className="btn" onClick={() => void store.openPlan()}>
          Open…
        </button>
        <button className="btn primary" onClick={() => void store.savePlan(false)}>
          Save
        </button>
        <button className="btn" onClick={() => void store.savePlan(true)}>
          Save as…
        </button>
      </header>

      <aside className="sidebar">
        <nav className="tabs">
          {(
            [
              ["room", "Room"],
              ["audience", "Audience"],
              ["projectors", "Projectors"],
              ["obstructions", "Obstructions"],
              ["surface", "Surface"],
            ] as [SideTab, string][]
          ).map(([id, label]) => (
            <button key={id} className={side === id ? "on" : ""} onClick={() => setSide(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-body">
          {side === "room" && <RoomPanel />}
          {side === "audience" && <AudiencePanel />}
          {side === "projectors" && <ProjectorsPanel selectedId={selectedId} onSelect={setSelectedId} />}
          {side === "obstructions" && <ObstructionsPanel />}
          {side === "surface" && <SurfacePanel />}
        </div>
      </aside>

      <main className="main">
        <nav className="tabs view-tabs">
          {(
            [
              ["top", "Top-down"],
              ["left", "Left wall"],
              ["right", "Right wall"],
              ["help", "How the numbers work"],
            ] as [ViewTab, string][]
          ).map(([id, label]) => (
            <button key={id} className={view === id ? "on" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="view">
          {view === "top" && <TopDownView plan={plan} analysis={analysis} selectedId={selectedId} />}
          {view === "left" && <ElevationView plan={plan} analysis={analysis} wall="left" selectedId={selectedId} />}
          {view === "right" && <ElevationView plan={plan} analysis={analysis} wall="right" selectedId={selectedId} />}
          {view === "help" && <HelpPanel />}
        </div>
        {view !== "help" && (
          <ResultsPanel
            plan={plan}
            analysis={analysis}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setSide("projectors");
            }}
          />
        )}
      </main>

      <footer className="statusbar">
        <span>{status}</span>
        <span className="spacer" />
        <span className="muted">{file.filePath ?? "not saved to a file yet (draft kept automatically)"}</span>
        {info && <span className="muted"> · v{info.version} · Electron {info.electron}</span>}
      </footer>
    </div>
  );
}
