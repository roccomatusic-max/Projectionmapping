import { contextBridge, ipcRenderer } from "electron";

export interface AuditoriumApi {
  openPlan(): Promise<{ filePath: string; text: string } | null>;
  savePlan(text: string, filePath: string | null, suggestedName: string): Promise<{ filePath: string } | null>;
  appInfo(): Promise<{ version: string; platform: string; electron: string }>;
  onMenu(handler: (action: "new" | "open" | "save" | "saveAs" | "help") => void): () => void;
}

const api: AuditoriumApi = {
  openPlan: () => ipcRenderer.invoke("plan:open"),
  savePlan: (text, filePath, suggestedName) => ipcRenderer.invoke("plan:save", { text, filePath, suggestedName }),
  appInfo: () => ipcRenderer.invoke("app:info"),
  onMenu: (handler) => {
    const channels = ["new", "open", "save", "saveAs", "help"] as const;
    const listeners = channels.map((c) => {
      const fn = () => handler(c);
      ipcRenderer.on(`menu:${c}`, fn);
      return [c, fn] as const;
    });
    return () => {
      for (const [c, fn] of listeners) ipcRenderer.removeListener(`menu:${c}`, fn);
    };
  },
};

contextBridge.exposeInMainWorld("auditorium", api);
