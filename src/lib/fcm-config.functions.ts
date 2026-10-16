import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the public Firebase web configuration used for FCM token
 * registration. The Firebase Web API key is public by design (it only
 * identifies the project client-side); it is stored as a secret and
 * relayed here so it never sits in source control.
 */
export const getFcmWebConfig = createServerFn({ method: "GET" }).handler(async () => {
  return {
    apiKey: process.env["GOOGLE_API_KEY"] ?? "",
    projectId: process.env["FIREBASE_PROJECT_ID"] ?? "findmeet-8cfda",
    appId:
      process.env["FIREBASE_APP_ID"] ??
      "1:865517381931:web:154fe0f9c94bd432e8fbd6e",
  };
});
