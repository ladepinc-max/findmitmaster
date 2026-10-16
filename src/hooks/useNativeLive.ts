/**
 * Native-safe live-stream camera/mic acquisition.
 *
 * Don't use the Permissions API query — it fails inside the APK WebView.
 * Go straight to getUserMedia; MainActivity.java auto-grants the WebView
 * permission request. On native, if that still fails, force the native
 * permission dialog via the Capacitor camera plugin and retry once.
 */
export function useNativeLive() {
  const requestPermissionsAndGoLive = async (): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
    } catch (e) {
      console.log("Permission error:", e);
      const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor;
      if (cap?.isNativePlatform?.()) {
        try {
          const modName = "@capacitor/camera";
          const mod = (await import(/* @vite-ignore */ modName)) as {
            Camera?: { requestPermissions(opts?: unknown): Promise<unknown> };
          };
          await mod.Camera?.requestPermissions();
          // Try again after the native dialog resolves.
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (retryErr) {
          throw retryErr;
        }
      }
      throw e;
    }
  };
  return { requestPermissionsAndGoLive };
}
