import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell for BLINK. The web assets are bundled (webDir: www, built by
 * `npm run build:native`), so the app works offline and does not depend on the
 * SSO-protected Vercel deployment. No secrets live here.
 */
const config: CapacitorConfig = {
  appId: "com.orlogarrulo.blink",
  appName: "BLINK",
  webDir: "www",
  backgroundColor: "#F6F0E6",
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#F6F0E6",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#F6F0E6",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#F6F0E6",
      overlaysWebView: true,
    },
    SystemBars: {
      insetsHandling: "css",
    },
  },
};

export default config;
