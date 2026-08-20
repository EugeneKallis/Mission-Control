import { NextRequest, NextResponse } from "next/server";
import { ArrClient } from "@/lib/clients/arr";
import { resolveConfig } from "@/lib/config";
import { ARR_INSTANCE_DEFINITIONS } from "@/lib/arr-config";
import { isLocalArrSlug, LOCAL_ARRS, type LocalArrItem, type LocalArrLibrary } from "@/lib/local-arrs";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const requestedSlug = request.nextUrl.searchParams.get("instance") ?? "sonarrlocal";
  if (!isLocalArrSlug(requestedSlug)) {
    return NextResponse.json({ error: "Unknown local Arr instance" }, { status: 400, headers: noStore });
  }

  const arr = LOCAL_ARRS[requestedSlug];
  const definition = ARR_INSTANCE_DEFINITIONS.find((item) => item.slug === requestedSlug);

  try {
    const config = await resolveConfig();
    const instance = config.arrInstances.find((item) => item.name === definition?.name);
    if (!instance) {
      return NextResponse.json({ error: `${arr.label} is not configured` }, { status: 503, headers: noStore });
    }
    if (!instance.apiKey) {
      return NextResponse.json({ error: `No API key configured for ${arr.label}` }, { status: 503, headers: noStore });
    }

    const client = new ArrClient(instance);
    const baseUrl = instance.url.replace(/\/+$/, "");
    let items: LocalArrItem[];

    if (arr.type === "sonarr") {
      const series = await client.listSeries();
      items = series.map((show) => ({
        id: show.id,
        title: show.title,
        sizeOnDisk: show.statistics?.sizeOnDisk ?? 0,
        fileCount: show.statistics?.episodeFileCount ?? 0,
        href: `${baseUrl}/${arr.path}/${show.titleSlug || show.id}`,
      }));
    } else {
      const movies = await client.listMovies();
      items = movies.map((movie) => ({
        id: movie.id,
        title: movie.title,
        sizeOnDisk: movie.statistics?.sizeOnDisk ?? movie.sizeOnDisk ?? 0,
        fileCount: movie.statistics?.movieFileCount ?? (movie.hasFile ? 1 : 0),
        href: `${baseUrl}/${arr.path}/${movie.titleSlug || movie.id}`,
      }));
    }

    const body: LocalArrLibrary = {
      instance: requestedSlug,
      label: arr.label,
      itemLabel: arr.itemLabel,
      items,
      totalItems: items.length,
      totalSize: items.reduce((total, item) => total + item.sizeOnDisk, 0),
    };

    return NextResponse.json(body, { headers: noStore });
  } catch (error) {
    console.error(`[local-arrs] Failed to fetch ${arr.label}:`, error);
    return NextResponse.json(
      { error: `Failed to load ${arr.label}` },
      { status: 502, headers: noStore },
    );
  }
}
