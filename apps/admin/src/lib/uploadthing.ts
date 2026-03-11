"use client";

import { generateReactHelpers, generateUploadDropzone } from "@uploadthing/react";

import type { UploadRouter } from "@/app/api/uploadthing/core";

export const { useUploadThing } = generateReactHelpers<UploadRouter>();
export const UploadDropzone = generateUploadDropzone<UploadRouter>();
