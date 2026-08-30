import { NextResponse } from "next/server";
import { z } from "zod";
import {
  acknowledgeAllReleases,
  acknowledgeRelease,
  addMaintenanceWindow,
  createDatabaseBackup,
  deleteMaintenanceWindow,
  getOperationsSnapshot,
  markRestoreVerified,
  refreshOperationsChecks,
  saveOperationsConfig,
  type OperationsSource,
} from "@/lib/operations";

export const dynamic = "force-dynamic";

const sourceSchema = z.enum(["backup", "deployments", "releases", "adguard", "tls", "pve", "logs", "blfinder", "energy"]);
const configSchema = z.object({
  backupDir: z.string().trim().min(1).optional(),
  backupRetention: z.coerce.number().int().min(2).max(90).optional(),
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
  z.object({ action: z.literal("backup") }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("restore-verified") }),
  z.object({ action: z.literal("ack-release"), repo: z.string().min(1), tag: z.string().min(1) }),
  z.object({ action: z.literal("ack-all-releases") }),
  z.object({
    action: z.literal("add-maintenance"),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().min(1).max(300),
    sources: z.array(sourceSchema).min(1),
  }),
  z.object({ action: z.literal("delete-maintenance"), id: z.string().uuid() }),
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
    return response({ error: message }, { status: message.includes("Backup directory") ? 400 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) return response({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    const data = parsed.data;
    switch (data.action) {
      case "backup":
        await createDatabaseBackup();
        break;
      case "refresh":
        await refreshOperationsChecks();
        break;
      case "restore-verified":
        await markRestoreVerified();
        break;
      case "ack-release":
        await acknowledgeRelease(data.repo, data.tag);
        break;
      case "ack-all-releases":
        await acknowledgeAllReleases();
        break;
      case "add-maintenance":
        await addMaintenanceWindow({
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          reason: data.reason,
          sources: data.sources as OperationsSource[],
        });
        break;
      case "delete-maintenance":
        await deleteMaintenanceWindow(data.id);
        break;
    }
    return response(await getOperationsSnapshot());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operations action failed";
    return response({ error: message }, { status: 500 });
  }
}
