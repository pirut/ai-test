"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

import { ClaimDeviceForm } from "@/components/claim-device-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export function AddScreenDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Add screen
      </SheetTrigger>
      <SheetContent className="dashboard-theme w-full p-0 sm:max-w-md">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="text-xl font-semibold">Add a screen</SheetTitle>
          <SheetDescription className="leading-6">
            Enter the 6-character code shown on the screen. We&apos;ll wait here until the screen connects.
          </SheetDescription>
        </SheetHeader>
        <Separator />
        <div className="p-6">
          <ClaimDeviceForm
            // Remount on every open so the panel always starts at the form.
            key={open ? "open" : "closed"}
            embedded
            onClaimed={() => router.refresh()}
            onDone={() => {
              router.refresh();
              setOpen(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
