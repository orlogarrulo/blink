/**
 * Native half of src/lib/native-bridge.ts. Bundled only into the Capacitor app.
 *
 * - Upload labels → native sheet: camera, gallery or files (PDF/PNG/JPG/WebP/SVG).
 * - PDF → written to the device (Documents, Cache as fallback) + system share sheet.
 * - Android back button → closes the open overlay, otherwise leaves the app.
 * - Status bar and splash screen.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { ActionSheet, ActionSheetButtonStyle } from "@capacitor/action-sheet";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { NATIVE_BACK_EVENT, type NativeBridge } from "@/lib/native-bridge";

type Lang = "pt" | "fr" | "en";
const COPY: Record<Lang, { title: string; camera: string; gallery: string; files: string; cancel: string; share: string }> = {
  pt: { title: "Adicionar arte", camera: "Tirar foto", gallery: "Galeria", files: "Ficheiros (PDF, SVG…)", cancel: "Cancelar", share: "Partilhar ficha" },
  fr: { title: "Ajouter une illustration", camera: "Prendre une photo", gallery: "Galerie", files: "Fichiers (PDF, SVG…)", cancel: "Annuler", share: "Partager la fiche" },
  en: { title: "Add artwork", camera: "Take photo", gallery: "Gallery", files: "Files (PDF, SVG…)", cancel: "Cancel", share: "Share sheet" },
};

function lang(): Lang {
  const saved = (localStorage.getItem("blink-lang") || navigator.language || "pt").slice(0, 2).toLowerCase();
  return saved === "fr" || saved === "en" ? saved : "pt";
}

async function toFile(webPath: string, name: string, type?: string): Promise<File> {
  const blob = await (await fetch(webPath)).blob();
  return new File([blob], name, { type: type || blob.type || "image/jpeg" });
}

function base64ToFile(data: string, name: string, type: string): File {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new File([bytes], name, { type });
}

function isCancel(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error).toLowerCase();
  return message.includes("cancel");
}

async function pickFiles(accept: string, multiple: boolean): Promise<File[] | null> {
  const t = COPY[lang()];
  const { index } = await ActionSheet.showActions({
    title: t.title,
    options: [
      { title: t.camera },
      { title: t.gallery },
      { title: t.files },
      { title: t.cancel, style: ActionSheetButtonStyle.Cancel },
    ],
  });
  try {
    if (index === 0) {
      const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 92, correctOrientation: true });
      if (!photo.webPath) return null;
      return [await toFile(photo.webPath, `foto-${Date.now()}.${photo.format || "jpeg"}`, `image/${photo.format === "png" ? "png" : "jpeg"}`)];
    }
    if (index === 1) {
      const { photos } = await Camera.pickImages({ quality: 92, limit: multiple ? 3 : 1, correctOrientation: true });
      return Promise.all(photos.map((p, i) => toFile(p.webPath, `galeria-${i + 1}.${p.format || "jpeg"}`, `image/${p.format === "png" ? "png" : p.format === "webp" ? "webp" : "jpeg"}`)));
    }
    if (index === 2) {
      const types = accept.split(",").map((s) => s.trim()).filter(Boolean);
      const { files } = await FilePicker.pickFiles({ types, limit: multiple ? 3 : 1, readData: true });
      return files.filter((f) => f.data).map((f) => base64ToFile(f.data!, f.name, f.mimeType || "application/octet-stream"));
    }
    return null;
  } catch (error) {
    if (isCancel(error)) return null;
    throw error;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function saveFile(blob: Blob, name: string): Promise<void> {
  const data = await blobToBase64(blob);
  const safe = name.replace(/[^\w.-]+/g, "-");
  let uri: string;
  try {
    // Documents: visible in the iOS Files app (UIFileSharingEnabled) and in Android's Documents folder.
    uri = (await Filesystem.writeFile({ path: `BLINK/${safe}`, data, directory: Directory.Documents, recursive: true })).uri;
  } catch {
    uri = (await Filesystem.writeFile({ path: safe, data, directory: Directory.Cache, recursive: true })).uri;
  }
  try {
    await Share.share({ title: safe, dialogTitle: COPY[lang()].share, files: [uri] });
  } catch (error) {
    if (!isCancel(error)) throw error;
  }
}

export function installNativeBridge() {
  const bridge: NativeBridge = { pickFiles, saveFile };
  window.__blinkNative = bridge;
  document.documentElement.classList.add("native", `native-${Capacitor.getPlatform()}`);

  void App.addListener("backButton", ({ canGoBack }) => {
    const event = new Event(NATIVE_BACK_EVENT, { cancelable: true });
    window.dispatchEvent(event);
    if (event.defaultPrevented) return;
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });

  if (Capacitor.isNativePlatform()) {
    void StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
    window.addEventListener("load", () => void SplashScreen.hide().catch(() => undefined), { once: true });
  }
}
