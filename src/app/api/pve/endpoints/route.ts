/**
 * GET /api/pve/endpoints — list all Proxmox endpoints (tokens masked)
 * POST /api/pve/endpoints — create a new endpoint
 */

import { NextResponse } from "next/server";
import { listProxmoxEndpoints, createProxmoxEndpoint } from "@/lib/db/queries";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Mask all but the last 4 characters of a token */
function maskToken(token: string): string {
  if (token.length <= 4) return "****";
  return token.slice(-4).padStart(token.length, "*");
}

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  apiUrl: z.string().min(1, "API URL is required"),
  apiToken: z.string().min(1, "API token is required"),
  verifyTls: z.boolean().optional().default(true),
  enabled: z.boolean().optional().default(true),
  order: z.number().int().optional().default(0),
});

export async function GET() {
  try {
    const endpoints = await listProxmoxEndpoints();
    // Mask tokens for the list view
    const safe = endpoints.map((ep) => ({
      ...ep,
      apiToken: maskToken(ep.apiToken),
    }));
    return NextResponse.json(safe);
  } catch (error) {
    console.error("Failed to list Proxmox endpoints:", error);
    return NextResponse.json({ error: "Failed to list endpoints" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const created = await createProxmoxEndpoint(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to create Proxmox endpoint:", error);
    return NextResponse.json({ error: "Failed to create endpoint" }, { status: 500 });
  }
}
