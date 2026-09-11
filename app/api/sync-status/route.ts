import { NextResponse } from "next/server";
import { CACHE_KEYS, readCachedJSON, type SyncStatus } from "@/lib/blobCache";

export async function GET() {
  if (process.env.USE_MOCK_DATA !== "false") {
    return NextResponse.json({ mock: true });
  }
  const status = await readCachedJSON<SyncStatus>(CACHE_KEYS.syncStatus);
  return NextResponse.json({ mock: false, status });
}
