import { lstat, realpath } from "fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "path";

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

/** Resolve an indexed relative path without allowing deletion outside its root. */
export async function resolveSafeDeletePath(
  root: string,
  indexedPath: string,
): Promise<string | null> {
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, indexedPath);

  if (candidate === absoluteRoot || !isWithin(absoluteRoot, candidate)) return null;

  try {
    await lstat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
    return null;
  }

  try {
    const [canonicalRoot, canonicalParent] = await Promise.all([
      realpath(absoluteRoot),
      realpath(dirname(candidate)),
    ]);
    return isWithin(canonicalRoot, canonicalParent) ? candidate : null;
  } catch {
    return null;
  }
}
