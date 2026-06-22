import { NextResponse } from "next/server";
import { RealDebridClient, isAuthError } from "@/lib/clients/real-debrid";
import { getConfig } from "@/lib/db/queries";

export async function GET() {
  try {
    let apiKey = "";
    try {
      const config = await getConfig();
      const values = JSON.parse(config.configJson) as Record<string, string>;
      apiKey = values.real_debrid_api_key || "";
    } catch {
      // Config not seeded
    }

    if (!apiKey) {
      return NextResponse.json({ label: "Not configured", ok: false });
    }

    const client = new RealDebridClient(apiKey);
    const user = await client.getUser();
    const days = Math.floor(user.premium / 86400);

    if (days > 0) {
      return NextResponse.json({ label: `${days}d`, ok: true });
    }
    return NextResponse.json({ label: "Expired", ok: false });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ label: "Invalid key", ok: false });
    }
    return NextResponse.json({ label: "Offline", ok: false });
  }
}
