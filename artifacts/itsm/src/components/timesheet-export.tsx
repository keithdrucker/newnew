import { useEffect, useState } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, addDays } from "date-fns";
import { Download, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  listTimeEntries,
  type ListTimeEntriesParams,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import sidekickLogo from "@assets/sidekick_logo.png";

// Shape mirrors the inline `Entry` type used by the timesheet page.
// We re-declare it here so this module is self-contained and can be
// reused if the report ever moves elsewhere.
export type TimesheetEntry = {
  id: number;
  source?: "ticket" | "operational_task";
  ticketId?: number | null;
  ticketKey?: string | null;
  ticketTitle?: string | null;
  taskId?: number | null;
  taskName?: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  note: string;
};

function formatDuration(mins: number): string {
  if (mins === 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function safeFilenamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function entryLabels(e: TimesheetEntry): { type: string; ref: string; title: string } {
  if (e.source === "operational_task") {
    return {
      type: "Operational task",
      ref: `OPS-${e.taskId ?? e.id}`,
      title: e.taskName ?? "Operational task",
    };
  }
  return {
    type: "Ticket",
    ref: e.ticketKey ?? `#${e.ticketId ?? e.id}`,
    title: e.ticketTitle ?? "",
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// RFC 4180 quoting: wrap in double-quotes, escape internal double-quotes by
// doubling them. Safe for commas, quotes and newlines inside note fields.
function csvCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadTimesheetCsv(opts: {
  entries: TimesheetEntry[];
  fromDate: Date;
  toDate: Date;
  userName: string;
}): void {
  const { entries, fromDate, toDate, userName } = opts;
  // Stable chronological order so the export is deterministic
  // regardless of the API's response ordering.
  const sorted = [...entries].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  const header = [
    "Date",
    "Start",
    "End",
    "Duration (min)",
    "Duration",
    "Type",
    "Reference",
    "Title",
    "Note",
  ];
  const rows = sorted.map((e) => {
    const labels = entryLabels(e);
    const start = new Date(e.startAt);
    const end = new Date(e.endAt);
    return [
      format(start, "yyyy-MM-dd"),
      format(start, "HH:mm"),
      format(end, "HH:mm"),
      e.durationMinutes,
      formatDuration(e.durationMinutes),
      labels.type,
      labels.ref,
      labels.title,
      e.note ?? "",
    ];
  });
  const totalMinutes = sorted.reduce((acc, e) => acc + e.durationMinutes, 0);
  const totalRow = [
    "",
    "",
    "TOTAL",
    totalMinutes,
    formatDuration(totalMinutes),
    "",
    "",
    "",
    "",
  ];

  const csv = [header, ...rows, totalRow]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  // Excel-friendly UTF-8 BOM so the first column header isn't garbled
  // when the user double-clicks the file on Windows.
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const fname = `Timesheet-${safeFilenamePart(userName) || "user"}-${format(
    fromDate,
    "yyyy-MM-dd",
  )}_to_${format(toDate, "yyyy-MM-dd")}.csv`;
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

// `@react-pdf/renderer` is heavy (~800KB). Keep it out of the main
// chunk and only pay the cost when a user actually exports.
export async function downloadTimesheetPdf(opts: {
  entries: TimesheetEntry[];
  kind: "day" | "week";
  anchorDate: Date;
  userName: string;
}): Promise<void> {
  const { entries, kind, anchorDate, userName } = opts;
  const reactPdf = await import("@react-pdf/renderer");
  const { Document, Page, Text, View, Image, StyleSheet, pdf } = reactPdf;

  const styles = StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingBottom: 48,
      paddingHorizontal: 48,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: "#1f2937",
      lineHeight: 1.4,
    },
    topBar: { height: 4, backgroundColor: "#0f172a", marginBottom: 16 },
    brandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    brandLogo: { height: 24, width: 72, objectFit: "contain" },
    reportLabel: { fontSize: 9, color: "#475569", letterSpacing: 1.2 },
    title: {
      fontSize: 20,
      fontFamily: "Helvetica-Bold",
      color: "#0f172a",
      marginBottom: 2,
    },
    subtitle: { fontSize: 10, color: "#475569", marginBottom: 14 },
    summaryRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 14,
    },
    summaryCell: {
      flexGrow: 1,
      borderWidth: 1,
      borderColor: "#e2e8f0",
      borderRadius: 4,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    summaryLabel: {
      fontSize: 8,
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 2,
    },
    summaryValue: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      color: "#0f172a",
    },
    daySection: { marginBottom: 12 },
    dayHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: "#cbd5e1",
      marginBottom: 4,
    },
    dayName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0f172a" },
    dayTotal: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#0f172a" },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f1f5f9",
      paddingVertical: 4,
      paddingHorizontal: 4,
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: "#475569",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingHorizontal: 4,
      borderBottomWidth: 0.5,
      borderBottomColor: "#e2e8f0",
    },
    cellTime: { width: "18%", fontSize: 9 },
    cellDur: { width: "12%", fontSize: 9, textAlign: "right" },
    cellType: { width: "14%", fontSize: 8, color: "#64748b" },
    cellRef: { width: "16%", fontSize: 9, color: "#0f172a" },
    cellTitle: { width: "40%", fontSize: 9 },
    note: {
      fontSize: 8.5,
      color: "#475569",
      marginTop: 2,
      marginLeft: 4,
      fontStyle: "italic",
    },
    emptyDay: {
      fontSize: 9,
      color: "#94a3b8",
      fontStyle: "italic",
      paddingVertical: 6,
    },
    footer: {
      position: "absolute",
      bottom: 24,
      left: 48,
      right: 48,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 8,
      color: "#94a3b8",
      borderTopWidth: 0.5,
      borderTopColor: "#e2e8f0",
      paddingTop: 6,
    },
  });

  const periodStart =
    kind === "day"
      ? startOfDay(anchorDate)
      : startOfWeek(anchorDate, { weekStartsOn: 1 });
  const periodEnd =
    kind === "day"
      ? endOfDay(anchorDate)
      : endOfWeek(anchorDate, { weekStartsOn: 1 });

  // Buckets: one per day in the period, in order. Day view → 1 bucket,
  // week view → 7 buckets (Mon–Sun).
  const days =
    kind === "day"
      ? [periodStart]
      : Array.from({ length: 7 }, (_, i) => addDays(periodStart, i));

  const byDay = new Map<string, TimesheetEntry[]>();
  days.forEach((d) => byDay.set(format(d, "yyyy-MM-dd"), []));
  entries.forEach((e) => {
    const key = format(new Date(e.startAt), "yyyy-MM-dd");
    const bucket = byDay.get(key);
    if (bucket) bucket.push(e);
  });

  const totalMinutes = entries.reduce((acc, e) => acc + e.durationMinutes, 0);
  const entryCount = entries.length;
  const generatedAt = format(new Date(), "MMM d, yyyy 'at' h:mm a");

  const periodLabel =
    kind === "day"
      ? format(periodStart, "EEEE, MMMM d, yyyy")
      : `${format(periodStart, "MMM d")} – ${format(periodEnd, "MMM d, yyyy")}`;

  const reportLabel = kind === "day" ? "DAILY TIMESHEET" : "WEEKLY TIMESHEET";

  const doc = (
    <Document
      title={`Timesheet ${periodLabel} — ${userName}`}
      author={userName}
      creator="Sidekick ITSM"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topBar} fixed />
        <View style={styles.brandRow} fixed>
          <Image src={sidekickLogo} style={styles.brandLogo} />
          <Text style={styles.reportLabel}>{reportLabel}</Text>
        </View>

        <Text style={styles.title}>{userName}</Text>
        <Text style={styles.subtitle}>{periodLabel}</Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Total time</Text>
            <Text style={styles.summaryValue}>{formatDuration(totalMinutes)}</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Entries</Text>
            <Text style={styles.summaryValue}>{entryCount}</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Days with logged time</Text>
            <Text style={styles.summaryValue}>
              {Array.from(byDay.values()).filter((b) => b.length > 0).length}
            </Text>
          </View>
        </View>

        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const dayEntries = (byDay.get(key) ?? []).sort(
            (a, b) =>
              new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
          );
          const dayTotal = dayEntries.reduce(
            (acc, e) => acc + e.durationMinutes,
            0,
          );
          return (
            <View key={key} style={styles.daySection} wrap={false}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayName}>
                  {format(d, "EEEE")} · {format(d, "MMM d")}
                </Text>
                <Text style={styles.dayTotal}>{formatDuration(dayTotal)}</Text>
              </View>
              {dayEntries.length === 0 ? (
                <Text style={styles.emptyDay}>No time logged.</Text>
              ) : (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={styles.cellTime}>Time</Text>
                    <Text style={styles.cellDur}>Duration</Text>
                    <Text style={styles.cellType}>Type</Text>
                    <Text style={styles.cellRef}>Ref</Text>
                    <Text style={styles.cellTitle}>Title</Text>
                  </View>
                  {dayEntries.map((e) => {
                    const labels = entryLabels(e);
                    return (
                      <View key={`${e.source ?? "ticket"}-${e.id}`}>
                        <View style={styles.tableRow}>
                          <Text style={styles.cellTime}>
                            {format(new Date(e.startAt), "h:mm a")} –{" "}
                            {format(new Date(e.endAt), "h:mm a")}
                          </Text>
                          <Text style={styles.cellDur}>
                            {formatDuration(e.durationMinutes)}
                          </Text>
                          <Text style={styles.cellType}>{labels.type}</Text>
                          <Text style={styles.cellRef}>{labels.ref}</Text>
                          <Text style={styles.cellTitle}>{labels.title}</Text>
                        </View>
                        {e.note ? (
                          <Text style={styles.note}>{e.note}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          );
        })}

        <View style={styles.footer} fixed>
          <Text>
            {userName} · Generated {generatedAt}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );

  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const fname = `Timesheet-${safeFilenamePart(userName) || "user"}-${kind}-${format(
    periodStart,
    "yyyy-MM-dd",
  )}.pdf`;
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------
// Menu + custom-range CSV dialog
// ---------------------------------------------------------------------------

type ExportMenuProps = {
  // Entries currently displayed (already filtered to selected user).
  // Used for "Export current view as PDF" so we don't re-fetch.
  currentEntries: TimesheetEntry[];
  viewMode: "day" | "week";
  selectedDay: Date;
  // The week the user is currently looking at — when in week view, the
  // page shows two weeks (this + last). The PDF "week" export uses
  // whichever the user clicks, so we accept the entries from the parent
  // who knows the visible bucket.
  weekAnchor: Date;
  weekEntries: TimesheetEntry[];
  userName: string;
  // Used for fetching arbitrary date ranges for the custom CSV export.
  // Returns the raw API response (already filtered to the viewing user).
  csvFetchParams: Pick<ListTimeEntriesParams, "userId">;
};

export function TimesheetExportMenu({
  currentEntries,
  viewMode,
  selectedDay,
  weekAnchor,
  weekEntries,
  userName,
  csvFetchParams,
}: ExportMenuProps) {
  const [csvOpen, setCsvOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function handlePdfDay() {
    setPdfBusy(true);
    try {
      await downloadTimesheetPdf({
        entries: currentEntries,
        kind: "day",
        anchorDate: selectedDay,
        userName,
      });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't generate PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  async function handlePdfWeek() {
    setPdfBusy(true);
    try {
      await downloadTimesheetPdf({
        entries: weekEntries,
        kind: "week",
        anchorDate: weekAnchor,
        userName,
      });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't generate PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={pdfBusy}
            data-testid="button-timesheet-export"
          >
            {pdfBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            PDF Report
          </DropdownMenuLabel>
          {viewMode === "day" ? (
            <DropdownMenuItem
              onSelect={handlePdfDay}
              data-testid="menu-export-pdf-day"
            >
              <FileText className="h-4 w-4 mr-2" />
              <span className="flex-1">This day</span>
              <span className="text-[10px] text-muted-foreground">
                {format(selectedDay, "MMM d")}
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={handlePdfWeek}
              data-testid="menu-export-pdf-week"
            >
              <FileText className="h-4 w-4 mr-2" />
              <span className="flex-1">This week</span>
              <span className="text-[10px] text-muted-foreground">
                {format(startOfWeek(weekAnchor, { weekStartsOn: 1 }), "MMM d")}
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            CSV
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={(e) => {
              // Prevent the menu's auto-close from racing with the
              // dialog open transition (Radix re-focuses the trigger
              // on close, which would steal focus from the dialog).
              e.preventDefault();
              setCsvOpen(true);
            }}
            data-testid="menu-export-csv"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Custom date range…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CsvRangeDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        userName={userName}
        fetchParams={csvFetchParams}
      />
    </>
  );
}

function CsvRangeDialog({
  open,
  onOpenChange,
  userName,
  fetchParams,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userName: string;
  fetchParams: Pick<ListTimeEntriesParams, "userId">;
}) {
  // Default to "this month so far" — the most common payroll question.
  const today = startOfDay(new Date());
  const defaultFrom = format(addDays(today, -29), "yyyy-MM-dd");
  const defaultTo = format(today, "yyyy-MM-dd");

  const [fromStr, setFromStr] = useState(defaultFrom);
  const [toStr, setToStr] = useState(defaultTo);
  const [busy, setBusy] = useState(false);

  // Reset to defaults each time the dialog re-opens so a stale custom
  // range doesn't surprise the user on their next export.
  useEffect(() => {
    if (open) {
      setFromStr(defaultFrom);
      setToStr(defaultTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fromDate = new Date(fromStr + "T00:00:00");
  const toDate = new Date(toStr + "T00:00:00");
  const validRange =
    !Number.isNaN(fromDate.getTime()) &&
    !Number.isNaN(toDate.getTime()) &&
    fromDate.getTime() <= toDate.getTime();

  async function handleDownload() {
    if (!validRange) return;
    setBusy(true);
    try {
      const from = startOfDay(fromDate).toISOString();
      // Inclusive end-of-day; the API treats `to` as an exclusive
      // upper bound elsewhere in this file, so push past midnight by
      // one millisecond to capture entries that end at 23:59.
      const to = new Date(endOfDay(toDate).getTime() + 1).toISOString();
      const params: ListTimeEntriesParams = { from, to, ...fetchParams };
      const data = (await listTimeEntries(params)) as TimesheetEntry[];
      downloadTimesheetCsv({
        entries: data,
        fromDate: startOfDay(fromDate),
        toDate: endOfDay(toDate),
        userName,
      });
      toast.success(
        data.length === 0
          ? "Exported empty timesheet (no entries in range)"
          : `Exported ${data.length} ${data.length === 1 ? "entry" : "entries"}`,
      );
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't export CSV");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-csv-export">
        <DialogHeader>
          <DialogTitle>Export timesheet as CSV</DialogTitle>
          <DialogDescription>
            Choose the date range to export. Entries are inclusive of both
            the start and end day.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="csv-from" className="text-xs">
              From
            </Label>
            <Input
              id="csv-from"
              type="date"
              value={fromStr}
              max={toStr}
              onChange={(e) => setFromStr(e.target.value)}
              data-testid="input-csv-from"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csv-to" className="text-xs">
              To
            </Label>
            <Input
              id="csv-to"
              type="date"
              value={toStr}
              min={fromStr}
              onChange={(e) => setToStr(e.target.value)}
              data-testid="input-csv-to"
            />
          </div>
        </div>
        {!validRange && (
          <p className="text-xs text-destructive">
            End date must be on or after the start date.
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!validRange || busy}
            data-testid="button-csv-download"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5" />
            )}
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
