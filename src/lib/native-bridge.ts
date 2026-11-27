/**
 * Web-safe hook into the native (Capacitor) shell.
 *
 * The web build never imports Capacitor: `native/bridge.ts` (bundled only by
 * `vite.native.config.ts`) installs `window.__blinkNative`. On the website the
 * object is absent and every caller keeps its normal browser behaviour.
 */
export type NativeBridge = {
  /** Native chooser (camera, gallery, files). `null` when the user cancels. */
  pickFiles: (accept: string, multiple: boolean) => Promise<File[] | null>;
  /** Save the file on the device and open the system share sheet. */
  saveFile: (blob: Blob, name: string) => Promise<void>;
};

declare global {
  interface Window {
    __blinkNative?: NativeBridge;
  }
}

export function nativeBridge(): NativeBridge | null {
  return typeof window === "undefined" ? null : (window.__blinkNative ?? null);
}

/** Event fired by the Android back button. Call preventDefault() when it was handled (e.g. a modal closed). */
export const NATIVE_BACK_EVENT = "blink:native-back";
