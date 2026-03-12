import { auth } from "@clerk/nextjs/server";
import type { FileRouter } from "uploadthing/next";
import { createRouteHandler, createUploadthing } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";

const f = createUploadthing();

export const uploadRouter = {
  mediaUploader: f({
    image: {
      maxFileCount: 10,
      maxFileSize: "16MB",
    },
    video: {
      maxFileCount: 10,
      maxFileSize: "256MB",
    },
  })
    .input(
      z.object({
        title: z.string().optional(),
        tags: z.array(z.string()).default([]),
      }),
    )
    .middleware(async () => {
      const session = await auth();

      if (!session.userId || !session.orgId || !session.has({ role: "org:admin" })) {
        throw new UploadThingError("Unauthorized");
      }

      return {
        orgId: session.orgId,
        userId: session.userId,
      };
    })
    .onUploadComplete(async ({ file, metadata }) => {
      return {
        orgId: metadata.orgId,
        uploadedBy: metadata.userId,
        key: file.key,
        url: file.ufsUrl,
        fileHash: file.fileHash,
      };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;

export const { GET, POST } = createRouteHandler({
  router: uploadRouter,
});
