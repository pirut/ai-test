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
            Enter the six-digit claim code shown by the Pi. The screen will join this fleet and begin receiving content.
          </SheetDescription>
        </SheetHeader>
        <Separator />
        <div className="p-6">
          <ClaimDeviceForm
            embedded
            onClaimed={() => {
              router.refresh();
              setOpen(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
