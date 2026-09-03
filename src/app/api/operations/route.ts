import { NextResponse } from "next/server";
import { z } from "zod";
import {
  acknowledgeAllReleases,
  acknowledgeRelease,
  getOperationsSnapshot,
  refreshOperationsChecks,
  saveOperationsConfig,
} from "@/lib/operations";
 

export const dynamic = "force-dynamic";

const configSchema = z.object({
  githubRepos: z.array(z.string()).max(50).optional(),
  adguardUrl: z.string().trim().refine((value) => value === "" || /^https?:\/\//.test(value), "AdGuard URL must start with http:// or https://").optional(),
  adguardUsername: z.string().max(200).optional(),
  adguardPassword: z.string().max(500).optional(),
  tlsTargets: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    host: z.string().trim().min(1).max(253),
    port: z.coerce.number().int().min(1).max(65_535),
  })).max(50).optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("ack-release"), repo: z.string().min(1), tag: z.string().min(1) }),
  z.object({ action: z.literal("ack-all-releases") }),
]);

function response(body: unknown, init?: ResponseInit) {
  const result = NextResponse.json(body, init);
  result.headers.set("Cache-Control", "no-store");
  return result;
}

export async function GET(request: Request) {
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return response(await getOperationsSnapshot(refresh));
  } catch (error) {
    console.error("GET /api/operations failed:", error);
    return response({ error: error instanceof Error ? error.message : "Failed to load operations" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = configSchema.safeParse(await request.json());
    if (!parsed.success) return response({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    await saveOperationsConfig(parsed.data);
    return response(await getOperationsSnapshot());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save operations config";
    return response({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) return response({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    const data = parsed.data;
    switch (data.action) {
      case "refresh":
        await refreshOperationsChecks();
        break;
      case "ack-release":
        await acknowledgeRelease(data.repo, data.tag);
        break;
      case "ack-all-releases":
        await acknowledgeAllReleases();
        break;
    }
    return response(await getOperationsSnapshot());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operations action failed";
    return response({ error: message }, { status: 500 });
  }
}
