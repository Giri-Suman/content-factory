import { NextResponse } from "next/server";
import { readConfig, writeConfig, readEnvKeys } from "../../../lib/factory.js";

export async function GET() {
  return NextResponse.json({ config: readConfig(), env: readEnvKeys() });
}

export async function PUT(request) {
  const body = await request.json();
  const config = readConfig();
  if (body.categories && typeof body.categories === "object") {
    for (const key of Object.keys(config.categories)) {
      if (typeof body.categories[key] === "boolean") config.categories[key] = body.categories[key];
    }
  }
  writeConfig(config);
  return NextResponse.json({ ok: true, config });
}
