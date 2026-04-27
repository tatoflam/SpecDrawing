// Dev-only: regenerate mask + shading PNGs for parts whose polygon (or mask /
// shading filename) changed since the last successful PUT to /api/dev/parts.
//
// Diff baseline = parts.json.bak (the immediately previous version). If no
// .bak is present (first PUT after a clean checkout), regenerate every part.
//
// POST body: none.
// Response: { regenerated: PartId[], durationMs: number }

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { partsManifestSchema, type Part, type PartsManifest } from "@/lib/parts/types";
import { sceneSchema } from "@/lib/scenes/types";
import { regenPartsAssets } from "@/lib/dev/regenAssets";

const SCENE_DIR = resolve(process.cwd(), "public/assets/base/main");
const LIVE = resolve(SCENE_DIR, "parts.json");
const BAK = resolve(SCENE_DIR, "parts.json.bak");
const SCENE_JSON = resolve(SCENE_DIR, "scene.json");
const BASE_JPG = resolve(SCENE_DIR, "base.jpg");

function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }
  return null;
}

function partAssetsDiffer(a: Part, b: Part): boolean {
  if (a.mask !== b.mask) return true;
  if ((a.shading ?? "") !== (b.shading ?? "")) return true;
  if (a.polygon.length !== b.polygon.length) return true;
  for (let i = 0; i < a.polygon.length; i++) {
    if (a.polygon[i][0] !== b.polygon[i][0]) return true;
    if (a.polygon[i][1] !== b.polygon[i][1]) return true;
  }
  return false;
}

function selectChangedParts(
  prev: PartsManifest | null,
  next: PartsManifest,
): Part[] {
  if (!prev) return next.parts.slice();
  const prevById = new Map(prev.parts.map((p) => [p.id, p]));
  const out: Part[] = [];
  for (const p of next.parts) {
    const previous = prevById.get(p.id);
    if (!previous || partAssetsDiffer(previous, p)) {
      out.push(p);
    }
  }
  return out;
}

async function readManifest(path: string): Promise<PartsManifest | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return partsManifestSchema.parse(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function POST() {
  const guard = devOnly();
  if (guard) return guard;

  const t0 = Date.now();
  try {
    const next = await readManifest(LIVE);
    if (!next) {
      return NextResponse.json(
        { error: "no-live-parts", message: "parts.json not found" },
        { status: 404 },
      );
    }
    const prev = await readManifest(BAK);
    const toRegen = selectChangedParts(prev, next);
    if (!toRegen.length) {
      return NextResponse.json({
        regenerated: [],
        durationMs: Date.now() - t0,
      });
    }

    const sceneRaw = await readFile(SCENE_JSON, "utf-8");
    const scene = sceneSchema.parse(JSON.parse(sceneRaw));
    const { data: baseRgb, info } = await sharp(BASE_JPG)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== scene.width || info.height !== scene.height) {
      return NextResponse.json(
        {
          error: "dimension-mismatch",
          message: `base.jpg (${info.width}×${info.height}) does not match scene.json (${scene.width}×${scene.height})`,
        },
        { status: 500 },
      );
    }

    await regenPartsAssets({
      sceneDir: SCENE_DIR,
      width: scene.width,
      height: scene.height,
      baseRgb,
      parts: toRegen,
    });

    return NextResponse.json({
      regenerated: toRegen.map((p) => p.id),
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "regen-failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
