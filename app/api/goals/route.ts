import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const GOALS_PATH = path.join(process.cwd(), "config", "goals.json");

export async function GET() {
  const raw = fs.readFileSync(GOALS_PATH, "utf-8");
  return NextResponse.json(JSON.parse(raw));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Basic shape check before writing - keeps a bad request from corrupting the file.
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid goals payload" }, { status: 400 });
  }
  fs.writeFileSync(GOALS_PATH, JSON.stringify(body, null, 2));
  return NextResponse.json({ ok: true });
}
