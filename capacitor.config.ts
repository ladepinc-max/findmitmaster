import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "world.findmit.app",
  appName: "Findmit",
  webDir: "dist",
  server: {
    // The app is server-rendered, so the APK loads the live site; the service
    // worker caches hashed assets on the phone so repeat opens are near-instant.
    url: "https://findmit.live",
    cleartext: false,
    // CRITICAL for WebRTC: getUserMedia requires a secure context.
    androidScheme: "https",
    iosScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    Camera: { presentationStyle: "fullscreen" },
  },
};

export default config;
