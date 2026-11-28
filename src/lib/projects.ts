/**
 * "Os meus projetos": designs saved on this device (localStorage "blink-projetos").
 * Only design parameters and the ficha fields are kept; uploaded art is not stored.
 * Interim until a server account exists (needs a database and an auth secret).
 */
export type SavedProject = {
  id: string;
  name: string;
  savedAt: string;
  state: Record<string, unknown>;
};

const KEY = "blink-projetos";
const MAX = 50;

export function listProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedProject[]) : [];
    return Array.isArray(list) ? list.filter((item) => item && typeof item.id === "string" && item.state && typeof item.state === "object") : [];
  } catch {
    return [];
  }
}

function write(list: SavedProject[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // storage full or blocked
  }
}

/** Save (or overwrite by name) and return the new list, newest first. */
export function saveProject(name: string, state: Record<string, unknown>): SavedProject[] {
  const clean = name.trim().slice(0, 60) || "Sem nome";
  const list = listProjects().filter((item) => item.name !== clean);
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  const next = [{ id, name: clean, savedAt: new Date().toISOString(), state }, ...list];
  write(next);
  return next.slice(0, MAX);
}

export function deleteProject(id: string): SavedProject[] {
  const next = listProjects().filter((item) => item.id !== id);
  write(next);
  return next;
}
