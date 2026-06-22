/**
 * TVMaze lookup helper — anime detection via TVDB id.
 *
 * Used by plex-to-arr as a fallback when Sonarr's SkyHook
 * seriesType and genres don't conclusively identify anime.
 *
 * API: http://api.tvmaze.com/lookup/shows?thetvdb={tvdbId}
 */

interface TVMazeShow {
  name: string;
  type: string; // "Animation", "Scripted", etc.
  genres: string[];
  network?: { country?: { name: string } };
  webChannel?: { country?: { name: string } };
}

/**
 * Check if a show is anime by looking it up on TVMaze via its TVDB id.
 *
 * Returns true if:
 * 1. "Anime" is in the show's genres, OR
 * 2. The show type is "Animation" AND the network/webChannel country is "Japan"
 *
 * Returns false on any error or non-match (including 404 — show not mapped).
 */
export async function isAnime(tvdbId: number): Promise<boolean> {
  if (!tvdbId || tvdbId <= 0) return false;

  try {
    const res = await fetch(
      `http://api.tvmaze.com/lookup/shows?thetvdb=${tvdbId}`,
      { redirect: "follow", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return false;

    const show = (await res.json()) as TVMazeShow;

    // 1. "Anime" in genres
    if (show.genres?.some((g) => g.toLowerCase() === "anime")) {
      return true;
    }

    // 2. Type "Animation" + country "Japan"
    const isAnimation = show.type?.toLowerCase() === "animation";
    const networkCountry = show.network?.country?.name ?? "";
    const webChannelCountry = show.webChannel?.country?.name ?? "";
    const isJapan =
      networkCountry.toLowerCase() === "japan" ||
      webChannelCountry.toLowerCase() === "japan";

    return isAnimation && isJapan;
  } catch {
    return false;
  }
}
