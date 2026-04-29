// Helpers for the /dev/trace single-outer authoring path. The current
// editing UI operates on one outer ring at a time (the first polygon
// entry's `outer`); these helpers spare callers from spelling out the
// `polygons[0].outer` shape on every read/write.
//
// Multi-ring authoring (sub-polygons + holes) ships in a follow-up
// extension of this file.

import type { Part, Polygon, Vertex } from "./types";

export function firstOuter(part: Part): Vertex[] {
  return part.polygons[0]?.outer ?? [];
}

export function withFirstOuter(part: Part, nextOuter: Vertex[]): Part {
  const head: Polygon = {
    outer: nextOuter,
    holes: part.polygons[0]?.holes,
  };
  return { ...part, polygons: [head, ...part.polygons.slice(1)] };
}
