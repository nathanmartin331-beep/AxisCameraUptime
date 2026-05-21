import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar, Loader2, Plus, Play, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface CameraLite {
  id: string;
  name: string;
  ipAddress: string;
  location?: string | null;
}

interface Schedule {
  id: string;
  userId: string;
  name: string;
  reportType: string;
  rangeDays: number;
  granularity: "daily" | "hourly";
  cameraIds: string[] | null;
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourLocal: number;
  timezone: string;
  active: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}

const RANGE_OPTIONS = [
  { value: 1, label: "Today" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last 365 days" },
];

const HOURLY_RANGE_VALUES = new Set([1, 7, 30]);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface FormState {
  name: string;
  rangeDays: number;
  granularity: "daily" | "hourly";
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek: number;
  dayOfMonth: number;
  hourLocal: number;
  timezone: string;
  active: boolean;
  cameraScope: "all" | "specific";
  cameraIds: string[];
}

function defaultForm(): FormState {
  return {
    name: "",
    rangeDays: 7,
    granularity: "daily",
    frequency: "daily",
    dayOfWeek: 1,
    dayOfMonth: 1,
    hourLocal: 9,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    active: true,
    cameraScope: "all",
    cameraIds: [],
  };
}

function formatRunTime(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, yyyy h:mm a");
}

function cadenceLabel(s: Schedule): string {
  const hour = s.hourLocal.toString().padStart(2, "0") + ":00";
  if (s.frequency === "daily") return `Daily at ${hour} (${s.timezone})`;
  if (s.frequency === "weekly") return `Weekly on ${WEEKDAYS[s.dayOfWeek ?? 1]} at ${hour} (${s.timezone})`;
  return `Monthly on day ${s.dayOfMonth ?? 1} at ${hour} (${s.timezone})`;
}

export default function ScheduledReportsSection() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());

  const { data: schedules, isLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/reports/schedules"],
  });

  const { data: allCameras = [] } = useQuery<CameraLite[]>({
    queryKey: ["/api/cameras"],
  });

  const [cameraFilter, setCameraFilter] = useState("");
  const visibleCameras = useMemo(() => {
    const q = cameraFilter.trim().toLowerCase();
    if (!q) return allCameras;
    return allCameras.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.ipAddress.toLowerCase().includes(q) ||
        (c.location ?? "").toLowerCase().includes(q),
    );
  }, [allCameras, cameraFilter]);

  function toggleCamera(id: string) {
    setForm((f) => {
      const set = new Set(f.cameraIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...f, cameraIds: Array.from(set) };
    });
  }

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        rangeDays: editing.rangeDays,
        granularity: editing.granularity ?? "daily",
        frequency: editing.frequency,
        dayOfWeek: editing.dayOfWeek ?? 1,
        dayOfMonth: editing.dayOfMonth ?? 1,
        hourLocal: editing.hourLocal,
        timezone: editing.timezone,
        active: editing.active,
        cameraScope: editing.cameraIds && editing.cameraIds.length > 0 ? "specific" : "all",
        cameraIds: editing.cameraIds ?? [],
      });
    } else {
      setForm(defaultForm());
    }
    setCameraFilter("");
  }, [editing, dialogOpen]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        rangeDays: form.rangeDays,
        granularity: form.granularity,
        frequency: form.frequency,
        hourLocal: form.hourLocal,
        timezone: form.timezone,
        active: form.active,
        cameraIds: form.cameraScope === "specific" ? form.cameraIds : null,
      };
      if (form.frequency === "weekly") body.dayOfWeek = form.dayOfWeek;
      if (form.frequency === "monthly") body.dayOfMonth = form.dayOfMonth;

      if (editing) {
        const res = await apiRequest("PATCH", `/api/reports/schedules/${editing.id}`, body);
        return (await res.json()) as Schedule;
      } else {
        const res = await apiRequest("POST", "/api/reports/schedules", body);
        return (await res.json()) as Schedule;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/schedules"] });
      setDialogOpen(false);
      setEditing(null);
      toast({ title: editing ? "Schedule updated" : "Schedule created" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Save failed", description: error.message });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/reports/schedules/${id}`, { active });
      return (await res.json()) as Schedule;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/reports/schedules"] }),
    onError: (error: Error) => toast({ variant: "destructive", title: "Toggle failed", description: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/reports/schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/schedules"] });
      toast({ title: "Schedule deleted" });
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Delete failed", description: error.message }),
  });

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/reports/schedules/${id}/run`);
      return (await res.json()) as { message: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/schedules"] });
      toast({ title: "Report dispatched", description: data.message });
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Dispatch failed", description: error.message }),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (s: Schedule) => {
    setEditing(s);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              <CardTitle>Scheduled Reports</CardTitle>
            </div>
            <CardDescription>
              Analytics reports emailed to you on a recurring schedule. Each schedule fires at the top of the chosen hour.
            </CardDescription>
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreate} data-testid="button-new-schedule">
                <Plus className="w-4 h-4 mr-2" /> New schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit schedule" : "New scheduled report"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sch-name">Name</Label>
                  <Input
                    id="sch-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Weekly site report"
                    data-testid="input-schedule-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Range</Label>
                    <Select
                      value={String(form.rangeDays)}
                      onValueChange={(v) => setForm({ ...form, rangeDays: parseInt(v, 10) })}
                    >
                      <SelectTrigger data-testid="select-schedule-range">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RANGE_OPTIONS
                          .filter((o) => form.granularity === "daily" || HOURLY_RANGE_VALUES.has(o.value))
                          .map((o) => (
                            <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select
                      value={form.frequency}
                      onValueChange={(v) => setForm({ ...form, frequency: v as FormState["frequency"] })}
                    >
                      <SelectTrigger data-testid="select-schedule-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Granularity</Label>
                  <Select
                    value={form.granularity}
                    onValueChange={(v) => {
                      const g = v as "daily" | "hourly";
                      setForm((f) => ({
                        ...f,
                        granularity: g,
                        // Hourly defaults to 24h — emailed hour-by-hour rows over a
                        // wider window are noisy. User can pick 7/30 manually.
                        rangeDays: g === "hourly" ? 1 : f.rangeDays,
                      }));
                    }}
                  >
                    <SelectTrigger data-testid="select-schedule-granularity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily totals</SelectItem>
                      <SelectItem value="hourly">Hourly breakdown (≤30d)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.frequency === "weekly" && (
                  <div className="space-y-2">
                    <Label>Day of week</Label>
                    <Select
                      value={String(form.dayOfWeek)}
                      onValueChange={(v) => setForm({ ...form, dayOfWeek: parseInt(v, 10) })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((d, i) => (
                          <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {form.frequency === "monthly" && (
                  <div className="space-y-2">
                    <Label>Day of month (1-28)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      value={form.dayOfMonth}
                      onChange={(e) => setForm({ ...form, dayOfMonth: Math.max(1, Math.min(28, parseInt(e.target.value, 10) || 1)) })}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Hour (local)</Label>
                    <Select
                      value={String(form.hourLocal)}
                      onValueChange={(v) => setForm({ ...form, hourLocal: parseInt(v, 10) })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, h) => (
                          <SelectItem key={h} value={String(h)}>
                            {h.toString().padStart(2, "0")}:00
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sch-tz">Timezone</Label>
                    <Input
                      id="sch-tz"
                      value={form.timezone}
                      onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                      placeholder="America/New_York"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Cameras</Label>
                  <RadioGroup
                    value={form.cameraScope}
                    onValueChange={(v) => setForm({ ...form, cameraScope: v as "all" | "specific" })}
                    className="flex gap-4"
                  >
                    <label className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="all" />
                      <span className="text-sm">All cameras</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="specific" />
                      <span className="text-sm">Selected cameras</span>
                    </label>
                  </RadioGroup>

                  {form.cameraScope === "specific" && (
                    <div className="rounded border p-2 space-y-2">
                      <div className="flex gap-2 items-center">
                        <Input
                          value={cameraFilter}
                          onChange={(e) => setCameraFilter(e.target.value)}
                          placeholder="Filter by name, IP, location..."
                          className="h-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => setForm({ ...form, cameraIds: visibleCameras.map((c) => c.id) })}
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => setForm({ ...form, cameraIds: [] })}
                        >
                          Clear
                        </Button>
                      </div>
                      <ScrollArea className="h-40 rounded border bg-muted/30">
                        <div className="p-2 space-y-1">
                          {visibleCameras.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-4 text-center">
                              No cameras match
                            </div>
                          ) : (
                            visibleCameras.map((c) => (
                              <label
                                key={c.id}
                                className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/60 cursor-pointer"
                              >
                                <Checkbox
                                  checked={form.cameraIds.includes(c.id)}
                                  onCheckedChange={() => toggleCamera(c.id)}
                                />
                                <span className="text-sm truncate">{c.name}</span>
                                <span className="text-xs text-muted-foreground ml-auto">{c.ipAddress}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                      <div className="text-xs text-muted-foreground">
                        {form.cameraIds.length} selected
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between rounded border p-3">
                  <div className="text-sm font-medium">Active</div>
                  <Switch
                    checked={form.active}
                    onCheckedChange={(v) => setForm({ ...form, active: v })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={
                    saveMutation.isPending ||
                    !form.name.trim() ||
                    (form.cameraScope === "specific" && form.cameraIds.length === 0)
                  }
                >
                  {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editing ? "Save changes" : "Create schedule"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : !schedules || schedules.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No schedules yet. Click "New schedule" to set one up.
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-3 rounded border p-3"
                data-testid={`schedule-row-${s.id}`}
              >
                <Switch
                  checked={s.active}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: s.id, active: v })}
                  data-testid={`switch-schedule-${s.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{s.name}</div>
                    <Badge variant="outline">{RANGE_OPTIONS.find(r => r.value === s.rangeDays)?.label ?? `${s.rangeDays}d`}</Badge>
                    {s.granularity === "hourly" && <Badge variant="outline">Hourly</Badge>}
                    <Badge variant="outline">
                      {s.cameraIds && s.cameraIds.length > 0
                        ? `${s.cameraIds.length} camera${s.cameraIds.length === 1 ? "" : "s"}`
                        : "All cameras"}
                    </Badge>
                    {!s.active && <Badge variant="secondary">Paused</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{cadenceLabel(s)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Last run: {formatRunTime(s.lastRunAt)} · Next run: {formatRunTime(s.nextRunAt)}
                  </div>
                  {s.lastError && (
                    <Alert className="mt-2" variant="destructive">
                      <AlertTriangle className="w-4 h-4" />
                      <AlertDescription className="text-xs">{s.lastError}</AlertDescription>
                    </Alert>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => runMutation.mutate(s.id)}
                    disabled={runMutation.isPending}
                    title="Run now"
                    data-testid={`button-run-${s.id}`}
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(s)}
                    title="Edit"
                    data-testid={`button-edit-${s.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete "${s.name}"?`)) deleteMutation.mutate(s.id);
                    }}
                    title="Delete"
                    data-testid={`button-delete-${s.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
