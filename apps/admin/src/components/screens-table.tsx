"use client";

import type { DeviceSummary } from "@showroom/contracts";
import { ExternalLink, LayoutGrid, List, MoreHorizontal, Monitor, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { RemoveScreenDialog } from "@/components/remove-screen-dialog";
import { ScreenThumbnail } from "@/components/screen-thumbnail";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type DeviceIssue,
  compareByUrgency,
  countByStatus,
  deviceIssues,
  needsAttention,
  statusLabels,
} from "@/lib/device-health";
import { cn, formatRelativeTimestamp } from "@/lib/utils";

export type ScreenFilter = "all" | "attention" | "online" | "stale" | "offline" | "unclaimed";
type Layout = "list" | "grid";

function IssueBadges({ issues, limit = 2 }: { issues: DeviceIssue[]; limit?: number }) {
  if (!issues.length) return <Badge variant="success">Healthy</Badge>;
  const shown = issues.slice(0, limit);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((issue) => (
        <Badge
          key={issue.label}
          variant={issue.severity === "critical" ? "danger" : issue.severity === "warning" ? "warning" : "secondary"}
        >
          {issue.label}
        </Badge>
      ))}
      {issues.length > limit ? <Badge variant="outline">+{issues.length - limit}</Badge> : null}
    </span>
  );
}

export function ScreensTable({
  devices: serverDevices,
  canAdmin,
  initialFilter = "all",
  initialLayout = "list",
}: {
  devices: DeviceSummary[];
  canAdmin: boolean;
  initialFilter?: ScreenFilter;
  initialLayout?: Layout;
}) {
  // Server data refreshes in the background; remember removals so a removed
  // screen doesn't flash back before the next refresh lands.
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ScreenFilter>(initialFilter);
  const [layout, setLayout] = useState<Layout>(initialLayout);
  const [removeTarget, setRemoveTarget] = useState<DeviceSummary | null>(null);

  const devices = useMemo(
    () => serverDevices.filter((device) => !removedIds.has(device.id)).sort(compareByUrgency),
    [removedIds, serverDevices],
  );
  const counts = countByStatus(devices);
  const attentionCount = devices.filter(needsAttention).length;

  const filterOptions: { value: ScreenFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: devices.length },
    { value: "attention", label: "Needs attention", count: attentionCount },
    { value: "online", label: statusLabels.online, count: counts.online },
    { value: "stale", label: statusLabels.stale, count: counts.stale },
    { value: "offline", label: statusLabels.offline, count: counts.offline },
    { value: "unclaimed", label: statusLabels.unclaimed, count: counts.unclaimed },
  ];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return devices.filter((device) => {
      const matchesFilter =
        filter === "all" || (filter === "attention" ? needsAttention(device) : device.status === filter);
      const matchesQuery =
        !needle ||
        [device.name, device.siteName, device.currentPlaylistName ?? ""].some((value) =>
          value.toLowerCase().includes(needle),
        );
      return matchesFilter && matchesQuery;
    });
  }, [devices, filter, query]);

  const actionsMenu = (device: DeviceSummary) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label={`Actions for ${device.name}`} size="icon-sm" variant="ghost" />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href={`/screens/${device.id}`} />}>
            <ExternalLink />
            Open screen
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {canAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={() => setRemoveTarget(device)}>
                <Trash2 />
                Remove screen
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 border-b">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <InputGroup className="sm:max-w-sm">
              <InputGroupInput
                aria-label="Search screens"
                placeholder="Search by name, site, or playlist"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <InputGroupAddon><Search /></InputGroupAddon>
            </InputGroup>
            <div className="flex items-center gap-1 rounded-lg border p-0.5 sm:ml-auto" role="group" aria-label="Layout">
              <Button
                aria-label="List view"
                aria-pressed={layout === "list"}
                size="icon-sm"
                variant={layout === "list" ? "secondary" : "ghost"}
                onClick={() => setLayout("list")}
              >
                <List />
              </Button>
              <Button
                aria-label="Grid view"
                aria-pressed={layout === "grid"}
                size="icon-sm"
                variant={layout === "grid" ? "secondary" : "ghost"}
                onClick={() => setLayout("grid")}
              >
                <LayoutGrid />
              </Button>
            </div>
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter screens">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === option.value
                    ? "border-primary/40 bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  option.count === 0 && filter !== option.value && "opacity-60",
                )}
              >
                {option.label}
                <span className="tabular-nums opacity-70">{option.count}</span>
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className={layout === "list" ? "px-0" : undefined}>
          {!filtered.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Monitor /></EmptyMedia>
                <EmptyTitle>{devices.length ? "No matching screens" : "No screens yet"}</EmptyTitle>
                <EmptyDescription>
                  {devices.length
                    ? "Try a different search or filter."
                    : "Use Add screen and enter the code shown on a new Pi."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : layout === "grid" ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((device) => (
                <li key={device.id} className="flex min-w-0 flex-col gap-2">
                  <Link href={`/screens/${device.id}`} className="group flex flex-col gap-2">
                    <ScreenThumbnail device={device} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium group-hover:underline">{device.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {device.siteName} · {device.currentPlaylistName ?? "No playlist"}
                        </p>
                      </div>
                      <StatusPill status={device.status} />
                    </div>
                  </Link>
                  <IssueBadges issues={deviceIssues(device)} limit={2} />
                </li>
              ))}
            </ul>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Screen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Now playing</TableHead>
                  <TableHead className="hidden md:table-cell">Health</TableHead>
                  <TableHead className="hidden sm:table-cell">Last seen</TableHead>
                  <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="pl-4">
                      <Link href={`/screens/${device.id}`} className="flex min-w-0 items-center gap-3 hover:underline">
                        <ScreenThumbnail device={device} className="hidden w-16 shrink-0 sm:block" compact />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{device.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{device.siteName}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell><StatusPill status={device.status} /></TableCell>
                    <TableCell className="hidden max-w-56 lg:table-cell">
                      <span className={cn("block truncate", !device.currentPlaylistName && "text-muted-foreground")}>
                        {device.currentPlaylistName ?? "No playlist"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <IssueBadges issues={deviceIssues(device)} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {formatRelativeTimestamp(device.lastHeartbeatAt)}
                    </TableCell>
                    <TableCell>{actionsMenu(device)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        <CardFooter className="text-xs text-muted-foreground">
          Showing {filtered.length} of {devices.length} screens · updates automatically
        </CardFooter>
      </Card>

      <RemoveScreenDialog
        screen={removeTarget}
        open={Boolean(removeTarget)}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        onRemoved={(deviceId) => setRemovedIds((current) => new Set(current).add(deviceId))}
      />
    </>
  );
}
