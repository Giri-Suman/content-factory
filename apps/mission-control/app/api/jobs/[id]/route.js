import { NextResponse } from "next/server";
import { readJob } from "../../../../lib/factory.js";

export async function GET(_req, { params }) {
  const job = readJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ job });
}
