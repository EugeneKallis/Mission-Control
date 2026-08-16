export const LOCAL_ARRS = {
  sonarrlocal: { label: "Sonarr Local", type: "sonarr", path: "series", itemLabel: "shows" },
  radarrlocal: { label: "Radarr Local", type: "radarr", path: "movie", itemLabel: "movies" },
} as const;

export type LocalArrSlug = keyof typeof LOCAL_ARRS;

export interface LocalArrItem {
  id: number;
  title: string;
  sizeOnDisk: number;
  fileCount: number;
  href: string;
}

export interface LocalArrLibrary {
  instance: LocalArrSlug;
  label: string;
  itemLabel: string;
  items: LocalArrItem[];
  totalItems: number;
  totalSize: number;
}

export function isLocalArrSlug(value: string): value is LocalArrSlug {
  // Object.hasOwn, not `in`: the `in` operator walks the prototype chain and
  // would accept "toString" / "constructor" as a slug.
  return Object.hasOwn(LOCAL_ARRS, value);
}
