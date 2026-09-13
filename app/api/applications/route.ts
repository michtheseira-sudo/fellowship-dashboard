import { NextResponse } from "next/server";
import { getApplicationsData } from "@/lib/dataProvider";

export async function GET() {
  try {
    const data = await getApplicationsData();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
