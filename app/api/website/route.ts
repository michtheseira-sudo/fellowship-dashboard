import { NextResponse } from "next/server";
import { getWebsiteData } from "@/lib/dataProvider";

export async function GET() {
  try {
    const data = await getWebsiteData();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
