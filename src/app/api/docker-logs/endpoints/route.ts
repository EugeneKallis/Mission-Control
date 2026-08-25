/** GET/POST /api/docker-logs/endpoints */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createDozzleEndpoint,
  listDozzleEndpoints,
} from "@/lib/db/queries";
import { normalizeDozzleUrl } from "@/lib/docker-logs";

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

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  apiUrl: urlSchema,
  enabled: z.boolean().optional().default(true),
  order: z.number().int().optional().default(0),
});

export async function GET() {
  try {
    return NextResponse.json(await listDozzleEndpoints(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to list Dozzle endpoints:", error);
    return NextResponse.json({ error: "Failed to list endpoints" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const created = await createDozzleEndpoint({
      ...parsed.data,
      apiUrl: normalizeDozzleUrl(parsed.data.apiUrl),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to create Dozzle endpoint:", error);
    return NextResponse.json({ error: "Failed to create endpoint" }, { status: 500 });
  }
}
