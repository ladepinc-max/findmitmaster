/**
 * WHIP publisher — sends one camera+mic copy to Cloudflare Stream Live.
 *
 * Cloudflare turns that single upload into HLS for the whole class, so the
 * teacher's phone never uploads more than ~600 kbps no matter how many
 * students are watching.
 */

export interface WhipBroadcast {
  stop: () => Promise<void>;
}

/** Ask Cloudflare (or reuse) the live input for this class. */
export async function ensureLiveInput(name: string, existingUid?: string | null) {
  const res = await fetch("/api/cf-live-input", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, existingUid: existingUid ?? null }),
  });
  if (!res.ok) throw new Error("Could not prepare the class broadcast");
  return (await res.json()) as {
    uid: string;
    whipUrl: string | null;
    hlsUrl: string | null;
    whepUrl: string | null;
  };
}

/** Publish a MediaStream to a WHIP endpoint; resolves once Cloudflare accepts. */
export async function startWhipBroadcast(
  stream: MediaStream,
  whipUrl: string,
): Promise<WhipBroadcast> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
    bundlePolicy: "max-bundle",
  });

  for (const track of stream.getTracks()) {
    const sender = pc.addTransceiver(track, { direction: "sendonly" }).sender;
    if (track.kind === "video") {
      const params = sender.getParameters();
      params.encodings = [{ maxBitrate: 700_000, maxFramerate: 30 }];
      params.degradationPreference = "maintain-framerate";
      try {
        await sender.setParameters(params);
      } catch {
        /* browser refused the encoding hint */
      }
    }
  }

  await pc.setLocalDescription(await pc.createOffer());
  // Wait for ICE so the single POST carries a complete offer.
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((resolve) => {
      const done = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", done);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", done);
      window.setTimeout(resolve, 2500);
    });
  }

  const res = await fetch(whipUrl, {
    method: "POST",
    headers: { "content-type": "application/sdp" },
    body: pc.localDescription?.sdp ?? "",
  });
  if (!res.ok) {
    pc.close();
    throw new Error("Cloudflare refused the broadcast");
  }
  const answer = await res.text();
  const resource = res.headers.get("location");
  await pc.setRemoteDescription({ type: "answer", sdp: answer });

  return {
    stop: async () => {
      if (resource) {
        try {
          await fetch(new URL(resource, whipUrl).toString(), { method: "DELETE" });
        } catch {
          /* session already gone */
        }
      }
      pc.close();
    },
  };
}
