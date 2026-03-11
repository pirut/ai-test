import { NextResponse } from "next/server";

import { registerTemporaryDevice } from "@/lib/backend";

export async function POST() {
  return NextResponse.json(await registerTemporaryDevice(), { status: 201 });
}
