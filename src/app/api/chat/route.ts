import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages } = body as {
      messages: Array<{ id: string; role: string; content: string; timestamp: number }>;
    };

    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    return NextResponse.json({
      role: "assistant",
      content: "Mock response. AI coming soon.",
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
