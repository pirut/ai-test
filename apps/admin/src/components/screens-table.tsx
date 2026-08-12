"use client";

import type { DeviceSummary } from "@showroom/contracts";
import { ExternalLink, MoreHorizontal, Monitor, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { RemoveScreenDialog } from "@/components/remove-screen-dialog";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
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
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelativeTimestamp } from "@/lib/utils";

const statusItems = [
  { label: "All screens", value: "all" },
  { label: "Online", value: "online" },
  { label: "Stale", value: "stale" },
  { label: "Offline", value: "offline" },
  { label: "Unclaimed", value: "unclaimed" },
];

function healthLabel(device: DeviceSummary) {
  if (device.fleetManagementState === "legacy") return "Waiting for appliance flash";
  if (!device.health?.playerHealthy) return "Player stopped";
  if (!device.health?.hdmiConnected) return "HDMI disconnected";
  if ((device.health?.signalPercent ?? 100) < 25) return `Weak Wi-Fi · ${device.health?.signalPercent}%`;
  if ((device.health?.cpuTemperatureC ?? 0) >= 80) return `High temperature · ${device.health?.cpuTemperatureC?.toFixed(0)}°C`;
  return "Healthy";
}

export function ScreensTable({ initialDevices, canAdmin }: { initialDevices: DeviceSummary[]; canAdmin: boolean }) {
  const [devices, setDevices] = useState(initialDevices);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [removeTarget, setRemoveTarget] = useState<DeviceSummary | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return devices.filter((device) => {
      const matchesStatus = status === "all" || device.status === status;
      const matchesQuery = !needle || [device.name, device.siteName, device.currentPlaylistName ?? ""]
        .some((value) => value.toLowerCase().includes(needle));
      return matchesStatus && matchesQuery;
    });
  }, [devices, query, status]);

  return (
    <>
      <Card>
        <CardHeader className="border-b sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="w-full max-w-md">
            <Field>
              <FieldLabel className="sr-only" htmlFor="screen-search">Search screens</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="screen-search"
                  placeholder="Search screens, sites, or playlists"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <InputGroupAddon><Search /></InputGroupAddon>
              </InputGroup>
            </Field>
          </div>
          <div className="w-full sm:w-44">
            <Field>
              <FieldLabel className="sr-only" htmlFor="screen-status">Filter by status</FieldLabel>
              <Select
                items={statusItems}
                value={status}
                onValueChange={(nextStatus) => setStatus(nextStatus ?? "all")}
              >
                <SelectTrigger id="screen-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {statusItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardHeader>

        <CardContent className="px-0">
          {filtered.length ? (
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
                {filtered.map((device) => {
                  const health = healthLabel(device);
                  return (
                    <TableRow key={device.id}>
                      <TableCell className="pl-4">
                        <Link href={`/screens/${device.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                          <Monitor />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{device.name}</span>
                            <span className="truncate text-xs font-normal text-muted-foreground">{device.siteName}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell><StatusPill label={device.status} status={device.status} /></TableCell>
                      <TableCell className="hidden max-w-56 lg:table-cell">
                        <span className="block truncate">{device.currentPlaylistName ?? "No playlist"}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant={health === "Healthy" ? "success" : "warning"}>{health}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {formatRelativeTimestamp(device.lastHeartbeatAt)}
                      </TableCell>
                      <TableCell>
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
                                View details
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Monitor /></EmptyMedia>
                <EmptyTitle>No matching screens</EmptyTitle>
                <EmptyDescription>Try a different search term or status filter.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>

        <CardFooter className="text-xs text-muted-foreground">
          Showing {filtered.length} of {devices.length} screens
        </CardFooter>
      </Card>

      <RemoveScreenDialog
        screen={removeTarget}
        open={Boolean(removeTarget)}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        onRemoved={(deviceId) => setDevices((current) => current.filter((device) => device.id !== deviceId))}
      />
    </>
  );
}
