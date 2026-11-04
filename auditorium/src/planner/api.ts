import type { AuditoriumApi } from "../../electron/preload";

declare global {
  interface Window {
    auditorium?: AuditoriumApi;
  }
}

/**
 * Access to the Electron side. When the page is opened in a plain browser
 * (npm run dev) there is no Electron, so file dialogs fall back to the
 * browser's download / file-picker.
 */
export const api: AuditoriumApi = window.auditorium ?? {
  async openPlan() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        resolve({ filePath: file.name, text: await file.text() });
      };
      input.click();
    });
  },
  async savePlan(text, _filePath, suggestedName) {
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${suggestedName || "auditorium-plan"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return { filePath: a.download };
  },
  async appInfo() {
    return { version: "dev (browser)", platform: "browser", electron: "none" };
  },
  onMenu() {
    return () => {};
  },
};
