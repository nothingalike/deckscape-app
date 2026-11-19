import { publicCardArtworkUrl } from "./card-artwork";
import type { DeckExportSnapshot } from "./deck-export";

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const MAX_ARTWORK_PIXELS = 25_000_000;
const ARTWORK_TIMEOUT_MS = 5000;

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const truncate = (value: string, limit: number) =>
  value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;

export type DeckImageModel = {
  title: string;
  description: string;
  mainframe: string;
  factions: string;
  artworkUrl: string | null;
};

export function deckImageModel(snapshot: DeckExportSnapshot): DeckImageModel {
  const cards = new Map(snapshot.cards.map((card) => [card.id, card]));
  const mainframeEntry = snapshot.entries.find(
    (entry) => entry.section === "mainframe",
  );
  const mainframe = mainframeEntry
    ? (cards.get(mainframeEntry.card_id) ?? null)
    : null;
  const factions = [
    ...new Set(
      snapshot.entries.flatMap(
        (entry) => cards.get(entry.card_id)?.factions ?? [],
      ),
    ),
  ];
  return {
    title: truncate(clean(snapshot.name) || "Untitled deck", 96),
    description: truncate(
      clean(snapshot.description) || "A private Neuroscape deck draft.",
      170,
    ),
    mainframe: truncate(clean(mainframe?.name ?? "") || "Constructed deck", 54),
    factions: truncate(factions.join(" / ") || "NEUTRAL", 72),
    artworkUrl: publicCardArtworkUrl(mainframe),
  };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minimumSize: number,
  weight = 700,
) {
  let size = initialSize;
  do {
    context.font = `${weight} ${size}px system-ui, sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > minimumSize);
  return size;
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line)
      line = candidate;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join(" ");
  if (consumed.length < text.length && lines.length) {
    let last = lines.length - 1;
    while (
      lines[last].length > 1 &&
      context.measureText(`${lines[last]}…`).width > maxWidth
    )
      lines[last] = lines[last].slice(0, -1).trimEnd();
    lines[last] += "…";
  }
  return lines;
}

async function loadArtwork(url: string | null) {
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTWORK_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "force-cache",
      signal: controller.signal,
    });
    const type = response.headers.get("content-type")?.split(";")[0];
    if (
      !response.ok ||
      !type ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type)
    )
      return null;
    const blob = await response.blob();
    if (!blob.size || blob.size > MAX_ARTWORK_BYTES) return null;
    const bitmap = await createImageBitmap(blob);
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > MAX_ARTWORK_PIXELS
    ) {
      bitmap.close();
      return null;
    }
    return bitmap;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function drawArtwork(context: CanvasRenderingContext2D, artwork: ImageBitmap) {
  const target = { x: 730, y: 0, width: 470, height: HEIGHT };
  const scale = Math.max(
    target.width / artwork.width,
    target.height / artwork.height,
  );
  const width = artwork.width * scale;
  const height = artwork.height * scale;
  context.drawImage(
    artwork,
    target.x + (target.width - width) / 2,
    target.y + (target.height - height) / 2,
    width,
    height,
  );
}

export async function renderDeckImage(snapshot: DeckExportSnapshot) {
  const model = deckImageModel(snapshot);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot create deck images.");

  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#0c1012");
  background.addColorStop(1, "#17231d");
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const artwork = await loadArtwork(model.artworkUrl);
  try {
    if (artwork) drawArtwork(context, artwork);
    else {
      const placeholder = context.createLinearGradient(790, 80, 1120, 550);
      placeholder.addColorStop(0, "#1d2922");
      placeholder.addColorStop(1, "#101719");
      context.fillStyle = placeholder;
      roundedRect(context, 790, 70, 330, 470, 22);
      context.fill();
      context.strokeStyle = "#344139";
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = "#c3f66b";
      context.font = "700 120px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("D", 955, 350);
      context.textAlign = "left";
    }

    const overlay = context.createLinearGradient(520, 0, 1100, 0);
    overlay.addColorStop(0, "#0c1012");
    overlay.addColorStop(0.35, "rgba(12,16,18,.94)");
    overlay.addColorStop(1, "rgba(12,16,18,.2)");
    context.fillStyle = overlay;
    context.fillRect(510, 0, 690, HEIGHT);

    context.fillStyle = "#c3f66b";
    context.fillRect(0, HEIGHT - 16, WIDTH, 16);
    context.font = "700 25px system-ui, sans-serif";
    context.letterSpacing = "6px";
    context.fillText("DECKSCAPE", 64, 82);
    context.letterSpacing = "0px";
    context.fillStyle = "#91a29f";
    context.font = "700 15px system-ui, sans-serif";
    context.fillText("NEUROSCAPE DECK EXPORT", 270, 80);

    context.fillStyle = "#c3f66b";
    context.font = "700 18px system-ui, sans-serif";
    context.fillText(model.mainframe.toUpperCase(), 64, 205);
    context.fillStyle = "#91a29f";
    context.font = "700 14px system-ui, sans-serif";
    context.fillText(model.factions.toUpperCase(), 64, 234);

    fitText(context, model.title, 700, 68, 42);
    context.fillStyle = "#f1f5f3";
    context.fillText(model.title, 64, 320);

    context.fillStyle = "#aebdb9";
    context.font = "22px system-ui, sans-serif";
    wrapText(context, model.description, 690, 3).forEach((line, index) =>
      context.fillText(line, 64, 375 + index * 31),
    );

    context.fillStyle = "#91a29f";
    context.font = "16px system-ui, sans-serif";
    context.fillText(
      "PROMOTIONAL PREVIEW · USE JSON FOR AN EXACT BACKUP",
      64,
      558,
    );
  } finally {
    artwork?.close();
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The deck image could not be encoded.")),
      "image/png",
    ),
  );
}

export function deckImageFilename(name: string) {
  const slug = clean(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return `deckscape-${slug || "deck"}.png`;
}

export async function downloadDeckImage(snapshot: DeckExportSnapshot) {
  const blob = await renderDeckImage(snapshot);
  const result = await window.neuroscape.saveDeckImage(new Uint8Array(await blob.arrayBuffer()), deckImageFilename(snapshot.name));
  if (!result.ok) throw new Error(result.error.message);
  return result.data.saved;
}
