import { NextResponse } from "next/server";
import { screenshotUploadPayloadSchema } from "@showroom/contracts";

import {
  generateDeviceScreenshotUploadUrl,
  recordScreenshotForCredential,
} from "@/lib/backend";

function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function POST(request: Request) {
  const credential = getDeviceCredentialFromRequest(request);
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    const deviceId = String(formData.get("deviceId") ?? "");
    const capturedAt = String(formData.get("capturedAt") ?? new Date().toISOString());

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Screenshot file is required" }, { status: 400 });
    }

    const upload = await generateDeviceScreenshotUploadUrl(credential);
    if (!upload) {
      return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
    }

    const uploadResponse = await fetch(upload.uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "image/jpeg",
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      return NextResponse.json({ error: "Unable to upload screenshot" }, { status: 502 });
    }

    const uploadPayload = (await uploadResponse.json()) as { storageId?: string };
    const screenshot = await recordScreenshotForCredential(credential, {
      capturedAt,
      mimeType: file.type === "image/jpeg" ? "image/jpeg" : "image/jpeg",
      bytes: file.size,
      storageId: uploadPayload.storageId,
    });

    if (!screenshot) {
      return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
    }

    return NextResponse.json({ screenshot });
  }

  const payload = screenshotUploadPayloadSchema.parse(await request.json());
  const screenshot = await recordScreenshotForCredential(
    credential,
    payload,
  );

  if (!screenshot) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  return NextResponse.json({
    screenshot,
  });
}
