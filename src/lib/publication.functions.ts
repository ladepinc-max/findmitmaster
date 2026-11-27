import { createServerFn } from "@tanstack/react-start";
export const getGooglePublication = createServerFn({ method: "GET" }).handler(async () => {
  const { readGooglePublication } = await import("./publication.server");
  return readGooglePublication();
});