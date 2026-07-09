/**
 * GET /api/chat/models — chat model catalog sorted by price (cheapest first).
 *
 * Each entry includes the provider, capabilities, price per 1M tokens,
 * context window and whether the provider's API key is configured in env.
 * Used by the model selector in the chat page.
 */

import { NextResponse } from "next/server";
import {
  modelsSortedByPrice,
  capabilityChips,
  priceSummary,
  getProvider,
  DEFAULT_MODEL_ID,
  type ChatModel,
} from "@/lib/chat/models";
import { isProviderConfigured } from "@/lib/chat/keys";

interface ModelEntry {
  id: string;
  modelId: string;
  provider: string;
  providerLabel: string;
  name: string;
  inputPricePerM: number;
  outputPricePerM: number;
  contextWindow: number;
  maxOutput: number;
  capabilities: string[];
  chips: { key: string; label: string; icon: string }[];
  price: string;
  configured: boolean;
}

function toEntry(m: ChatModel): ModelEntry {
  const provider = getProvider(m.provider);
  return {
    id: m.id,
    modelId: m.modelId,
    provider: m.provider,
    providerLabel: provider?.label ?? m.provider,
    name: m.name,
    inputPricePerM: m.inputPricePerM,
    outputPricePerM: m.outputPricePerM,
    contextWindow: m.contextWindow,
    maxOutput: m.maxOutput,
    capabilities: m.capabilities,
    chips: capabilityChips(m).map((c) => ({ key: c.key, label: c.label, icon: c.icon })),
    price: priceSummary(m),
    configured: isProviderConfigured(m),
  };
}

export async function GET() {
  try {
    const models = modelsSortedByPrice().map(toEntry);
    return NextResponse.json({
      defaultModelId: DEFAULT_MODEL_ID,
      models,
    });
  } catch (error) {
    console.error("Failed to list chat models:", error);
    return NextResponse.json(
      { error: "Failed to list chat models" },
      { status: 500 },
    );
  }
}