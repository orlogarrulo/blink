/**
 * Entry point of the native app (Android/iOS via Capacitor).
 *
 * The website keeps using TanStack Start (SSR on Vercel). The studio itself is
 * 100% client-side (canvas, WebGL, localStorage, PDF built in the browser), so
 * the native shell bundles the same <BlinkApp /> as static files and runs
 * offline, without depending on the SSO-protected deployment.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BlinkApp } from "@/components/blink-app";
import { installNativeBridge } from "./bridge";
import "./app.css";

installNativeBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BlinkApp />
  </StrictMode>,
);
