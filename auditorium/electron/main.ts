import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

// Phase 1: a single Planner window. The Player (output windows on each
// display) is added in phase 3 and lives beside this in the same process.

let plannerWindow: BrowserWindow | null = null;

function rendererPath(page: string): string {
  return path.join(__dirname, "..", "dist", page);
}

function createPlannerWindow(): void {
  plannerWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: "Auditorium Projection Planner",
    backgroundColor: "#15171c",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  plannerWindow.loadFile(rendererPath("planner.html"));
  plannerWindow.on("closed", () => {
    plannerWindow = null;
  });
}

function send(channel: string, ...args: unknown[]): void {
  plannerWindow?.webContents.send(channel, ...args);
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        { label: "New plan", accelerator: "CmdOrCtrl+N", click: () => send("menu:new") },
        { label: "Open plan…", accelerator: "CmdOrCtrl+O", click: () => send("menu:open") },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => send("menu:save") },
        { label: "Save as…", accelerator: "CmdOrCtrl+Shift+S", click: () => send("menu:saveAs") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "How the numbers work", click: () => send("menu:help") },
        {
          label: "Open README",
          click: () => {
            void shell.openPath(path.join(__dirname, "..", "README.md"));
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC: plan files -------------------------------------------------------

const PLAN_FILTERS = [{ name: "Auditorium plan", extensions: ["json"] }];

ipcMain.handle("plan:open", async () => {
  if (!plannerWindow) return null;
  const result = await dialog.showOpenDialog(plannerWindow, {
    title: "Open plan",
    filters: PLAN_FILTERS,
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const text = await fs.readFile(filePath, "utf8");
  return { filePath, text };
});

ipcMain.handle("plan:save", async (_event, args: { text: string; filePath: string | null; suggestedName: string }) => {
  if (!plannerWindow) return null;
  let filePath = args.filePath;
  if (!filePath) {
    const result = await dialog.showSaveDialog(plannerWindow, {
      title: "Save plan",
      defaultPath: `${args.suggestedName || "auditorium-plan"}.json`,
      filters: PLAN_FILTERS,
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
  }
  await fs.writeFile(filePath, args.text, "utf8");
  return { filePath };
});

ipcMain.handle("app:info", () => ({
  version: app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
}));

// ---- lifecycle -------------------------------------------------------------

app.whenReady().then(() => {
  buildMenu();
  createPlannerWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createPlannerWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
