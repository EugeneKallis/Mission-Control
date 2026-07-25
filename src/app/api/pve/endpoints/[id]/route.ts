/**
 * GET /api/pve/endpoints/:id — get single endpoint (token masked)
 * PUT /api/pve/endpoints/:id — update endpoint (blank token = keep existing)
 * DELETE /api/pve/endpoints/:id — delete endpoint
 */

import { NextResponse } from "next/server";
import { getProxmoxEndpoint, updateProxmoxEndpoint, deleteProxmoxEndpoint } from "@/lib/db/queries";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  apiUrl: z.string().min(1).optional(),
  apiToken: z.string().optional(), // empty string = keep existing
  verifyTls: z.boolean().optional(),
  enabled: z.boolean().optional(),
  order: z.number().int().optional(),
});

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: raw } = await params;
    const id = parseId(raw);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const ep = await getProxmoxEndpoint(id);
    if (!ep) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(ep);
  } catch (error) {
    console.error("Failed to get Proxmox endpoint:", error);
    return NextResponse.json({ error: "Failed to get endpoint" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: raw } = await params;
    const id = parseId(raw);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await getProxmoxEndpoint(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // If apiToken is empty string or undefined, keep existing
    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.apiUrl !== undefined) updateData.apiUrl = parsed.data.apiUrl;
    if (parsed.data.apiToken && parsed.data.apiToken.length > 0) {
      updateData.apiToken = parsed.data.apiToken;
    }
    if (parsed.data.verifyTls !== undefined) updateData.verifyTls = parsed.data.verifyTls;
    if (parsed.data.enabled !== undefined) updateData.enabled = parsed.data.enabled;
    if (parsed.data.order !== undefined) updateData.order = parsed.data.order;

    const updated = await updateProxmoxEndpoint(id, updateData);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update Proxmox endpoint:", error);
    return NextResponse.json({ error: "Failed to update endpoint" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: raw } = await params;
    const id = parseId(raw);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await deleteProxmoxEndpoint(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete Proxmox endpoint:", error);
    return NextResponse.json({ error: "Failed to delete endpoint" }, { status: 500 });
  }
}
