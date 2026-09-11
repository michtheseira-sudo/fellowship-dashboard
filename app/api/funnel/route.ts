import { NextRequest, NextResponse } from "next/server";
import { getFunnelData } from "@/lib/dataProvider";
import type { Season } from "@/lib/types";

export async function GET(req: NextRequest) {
  const season = (req.nextUrl.searchParams.get("season") as Season) || "Summer";
  try {
    const data = await getFunnelData(season);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
