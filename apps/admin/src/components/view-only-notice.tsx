import { Eye } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Shown to members on pages where only workspace admins can make changes. */
export function ViewOnlyNotice({ what }: { what: string }) {
  return (
    <Alert>
      <Eye />
      <AlertTitle>View only</AlertTitle>
      <AlertDescription>
        Only workspace admins can change {what}. Ask an admin if something needs updating.
      </AlertDescription>
    </Alert>
  );
}
