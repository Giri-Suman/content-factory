import { NextResponse } from "next/server";
import { listScripts } from "../../../lib/factory.js";

export async function GET() {
  return NextResponse.json({ scripts: listScripts() });
}
