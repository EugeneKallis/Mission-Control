/** GET/PUT/DELETE /api/docker-logs/endpoints/:id */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteDozzleEndpoint,
  getDozzleEndpoint,
  updateDozzleEndpoint,
} from "@/lib/db/queries";
import { normalizeDozzleUrl } from "@/lib/docker-logs";
import { parseEndpointId } from "../_shared";

export const dynamic = "force-dynamic";

const urlSchema = z.string().trim().min(1).superRefine((value, ctx) => {
  try {
    normalizeDozzleUrl(value);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Invalid Dozzle URL",
    });
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  apiUrl: urlSchema.optional(),
  enabled: z.boolean().optional(),
  order: z.number().int().optional(),
});

async function getId(params: Promise<{ id: string }>) {
  const { id: raw } = await params;
  return parseEndpointId(raw);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await getId(params);
    if (id === null) return NextResponse.json({ error: "Invalid endpoint id" }, { status: 400 });
    const endpoint = await getDozzleEndpoint(id);
    if (!endpoint) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
    return NextResponse.json(endpoint, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to get Dozzle endpoint:", error);
    return NextResponse.json({ error: "Failed to get endpoint" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await getId(params);
    if (id === null) return NextResponse.json({ error: "Invalid endpoint id" }, { status: 400 });
    if (!(await getDozzleEndpoint(id))) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = {
      ...parsed.data,
      ...(parsed.data.apiUrl ? { apiUrl: normalizeDozzleUrl(parsed.data.apiUrl) } : {}),
    };
    return NextResponse.json(await updateDozzleEndpoint(id, data));
  } catch (error) {
    console.error("Failed to update Dozzle endpoint:", error);
    return NextResponse.json({ error: "Failed to update endpoint" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await getId(params);
    if (id === null) return NextResponse.json({ error: "Invalid endpoint id" }, { status: 400 });
    if (!(await getDozzleEndpoint(id))) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
    await deleteDozzleEndpoint(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete Dozzle endpoint:", error);
    return NextResponse.json({ error: "Failed to delete endpoint" }, { status: 500 });
  }
}
