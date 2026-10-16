/**
 * Lightweight on-device face comparison used by the teacher application.
 * It compares the face area of the Ghana card photo with the live selfie by
 * matching their tone/brightness signatures and returns a 0-100 score.
 */

type Box = { x: number; y: number; w: number; h: number };

async function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not read the image"));
    image.src = url;
  });
  return image;
}

function signature(image: HTMLImageElement, box: Box) {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(
    image,
    box.x * image.naturalWidth,
    box.y * image.naturalHeight,
    box.w * image.naturalWidth,
    box.h * image.naturalHeight,
    0,
    0,
    size,
    size,
  );
  const { data } = ctx.getImageData(0, 0, size, size);
  const gray = new Array(16).fill(0) as number[];
  let skin = 0;
  let count = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const bin = Math.min(15, Math.floor(lum / 16));
    gray[bin] = (gray[bin] ?? 0) + 1;
    if (r > 60 && g > 35 && b > 20 && r >= g && g >= b && r - b > 12) skin += 1;
    rSum += r;
    gSum += g;
    bSum += b;
    count += 1;
  }
  return {
    hist: gray.map((value) => value / count),
    skin: skin / count,
    tone: [rSum / count / 255, gSum / count / 255, bSum / count / 255] as const,
  };
}

/** Returns a 0-100 similarity score between the card photo and the selfie. */
export async function compareFaces(cardFront: Blob, selfie: Blob): Promise<number> {
  const [cardImage, selfieImage] = await Promise.all([loadImage(cardFront), loadImage(selfie)]);
  // Ghana cards carry the portrait on the left third; selfies centre the face.
  const card = signature(cardImage, { x: 0.04, y: 0.2, w: 0.34, h: 0.62 });
  const face = signature(selfieImage, { x: 0.22, y: 0.14, w: 0.56, h: 0.64 });

  let intersection = 0;
  for (let i = 0; i < card.hist.length; i += 1) {
    intersection += Math.min(card.hist[i] ?? 0, face.hist[i] ?? 0);
  }
  const toneDistance = Math.sqrt(
    card.tone.reduce((sum, value, index) => sum + (value - (face.tone[index] ?? 0)) ** 2, 0) / 3,
  );
  const toneScore = Math.max(0, 1 - toneDistance * 2.2);
  const skinScore = 1 - Math.min(1, Math.abs(card.skin - face.skin) * 1.6);

  const score = 100 * (0.45 * intersection + 0.3 * toneScore + 0.25 * skinScore);
  return Math.max(0, Math.min(99, Math.round(score)));
}
