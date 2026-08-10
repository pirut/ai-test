import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Consume the body so local browser upload behavior matches the real Convex
  // storage request closely enough for interaction and progress testing.
  await request.arrayBuffer();
  const { assetId } = await context.params;
  return NextResponse.json({ storageId: `mock-${assetId}` });
}
