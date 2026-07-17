/**
 * GET /api/pi/state — fetch available models, session stats, and state.
 * PUT /api/pi/state — set model and/or thinking level.
 *
 * Uses the singleton Pi process.
 */

import { NextRequest, NextResponse } from "next/server";
import { piProcessManager } from "@/lib/pi/process-manager";
import type { ThinkingLevel } from "@/lib/pi/event-types";

export async function GET(): Promise<NextResponse> {
  const process = await piProcessManager.getOrCreate();

  try {
    const modelsResponse = await process.sendAndWait({ type: "get_available_models" });
    if (!modelsResponse.success) {
      return NextResponse.json(
        { error: modelsResponse.error ?? "Failed to fetch models" },
        { status: 500 },
      );
    }

    // Pi returns { models: Model[] } — flatten to just the array
    const raw = modelsResponse.data;
    const models = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && "models" in raw
        ? (raw as { models: unknown[] }).models
        : [];

    const statsResponse = await process.sendAndWait({ type: "get_session_stats" });
    const stateResponse = await process.sendAndWait({ type: "get_state" });

    return NextResponse.json({
      models,
      stats: statsResponse.success ? (statsResponse.data ?? null) : null,
      state: stateResponse.success ? (stateResponse.data ?? null) : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to query Pi state" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const process = await piProcessManager.getOrCreate();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  if (body.modelId) {
    const provider = body.provider;
    if (!provider || typeof provider !== "string") {
      errors.push("'provider' is required when 'modelId' is set");
    } else {
      try {
        const res = await process.sendAndWait({
          type: "set_model",
          provider,
          modelId: body.modelId as string,
        });
        if (res.success) {
          results.model = { provider, modelId: body.modelId };
        } else {
          errors.push(res.error ?? "Failed to set model");
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Error setting model");
      }
    }
  }

  if (body.thinkingLevel) {
    const validLevels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    const level = body.thinkingLevel as string;
    if (!validLevels.includes(level as ThinkingLevel)) {
      errors.push(`Invalid thinking level '${level}'. Valid: ${validLevels.join(", ")}`);
    } else {
      try {
        const res = await process.sendAndWait({
          type: "set_thinking_level",
          level: level as ThinkingLevel,
        });
        if (res.success) {
          results.thinkingLevel = level;
        } else {
          errors.push(res.error ?? "Failed to set thinking level");
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Error setting thinking level");
      }
    }
  }

  if (errors.length > 0 && Object.keys(results).length === 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    results,
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
}
