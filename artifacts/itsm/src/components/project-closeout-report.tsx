// `@react-pdf/renderer` is a large dependency (~800KB gzip) used only
// when an admin clicks "Export PDF" on a project. We pull it in via
// `await import()` inside `downloadProjectReport` so the PDF runtime
// is excluded from the initial app bundle.
import type { ProjectDetail } from "@workspace/api-client-react";
import sidekickLogo from "@assets/sidekick_logo.png";

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const PHASE_LABEL: Record<string, string> = {
  backlog_needs_assignment: "BACKLOG",
  planning: "PLANNING",
  in_progress: "IN PROGRESS",
  on_hold: "ON HOLD",
  completed: "COMPLETED",
  closed: "CLOSED",
  cancelled: "CANCELLED",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fallback(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

function safeFilenamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

// Compute the YYYY-MM-DD stamp used in the download filename. Prefers
// `closedAt`, then `completedAt`, then today, so a project exported
// mid-flight still gets a sensible stamp.
function fileDateStamp(project: ProjectDetail): string {
  const candidate = project.closedAt ?? project.completedAt ?? null;
  let d = candidate ? new Date(candidate) : null;
  if (!d || Number.isNaN(d.getTime())) d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function downloadProjectReport(
  project: ProjectDetail,
): Promise<void> {
  // Dynamic import keeps `@react-pdf/renderer` out of the main bundle.
  const reactPdf = await import("@react-pdf/renderer");
  const { Document, Page, Text, View, Image, StyleSheet, pdf } = reactPdf;

  const styles = StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 56,
      paddingHorizontal: 56,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: "#1f2937",
      lineHeight: 1.45,
    },
    topBar: {
      height: 4,
      backgroundColor: "#0f172a",
      marginBottom: 18,
    },
    brandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    brandLogo: {
      height: 26,
      width: 78,
      objectFit: "contain",
    },
    reportLabel: {
      fontSize: 9,
      color: "#475569",
      letterSpacing: 1.2,
    },
    title: {
      fontSize: 22,
      fontFamily: "Helvetica-Bold",
      color: "#0f172a",
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 10,
      color: "#475569",
      marginBottom: 16,
    },
    badgeRow: {
      flexDirection: "row",
      gap: 6,
      marginBottom: 18,
    },
    badge: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 3,
      fontSize: 8.5,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 0.6,
    },
    badgePrimary: {
      backgroundColor: "#0f172a",
      color: "#ffffff",
    },
    badgeMuted: {
      backgroundColor: "#e2e8f0",
      color: "#0f172a",
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 14,
      marginBottom: 6,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: "#cbd5e1",
    },
    sectionTitle: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 0.6,
      color: "#0f172a",
      textTransform: "uppercase",
    },
    metaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    metaCell: {
      width: "50%",
      paddingVertical: 4,
      paddingRight: 8,
    },
    metaLabel: {
      fontSize: 8,
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 1,
    },
    metaValue: {
      fontSize: 10.5,
      color: "#0f172a",
    },
    body: {
      fontSize: 10.5,
      color: "#1f2937",
      marginTop: 4,
    },
    bodyMuted: {
      fontSize: 10,
      color: "#94a3b8",
      fontStyle: "italic",
      marginTop: 4,
    },
    checklistHeader: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: "#cbd5e1",
      paddingVertical: 4,
      marginTop: 4,
      marginBottom: 2,
    },
    checklistRow: {
      flexDirection: "row",
      paddingVertical: 4,
      borderBottomWidth: 0.5,
      borderBottomColor: "#e2e8f0",
    },
    colStatus: { width: "8%", fontSize: 11 },
    colItem: { width: "52%", fontSize: 10, color: "#0f172a", paddingRight: 6 },
    colItemDone: {
      width: "52%",
      fontSize: 10,
      color: "#94a3b8",
      paddingRight: 6,
      textDecoration: "line-through",
    },
    colAssignee: { width: "22%", fontSize: 10, color: "#1f2937" },
    colDue: { width: "18%", fontSize: 10, color: "#1f2937" },
    colHeaderText: {
      fontSize: 8,
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      fontFamily: "Helvetica-Bold",
    },
    signatureRow: {
      flexDirection: "row",
      gap: 18,
      marginTop: 8,
    },
    signatureBlock: {
      flex: 1,
      borderTopWidth: 1,
      borderTopColor: "#0f172a",
      paddingTop: 6,
    },
    signatureName: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: "#0f172a",
    },
    signatureRole: {
      fontSize: 8.5,
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 1,
    },
    signatureWhen: {
      fontSize: 9,
      color: "#475569",
      marginTop: 2,
    },
    footer: {
      position: "absolute",
      bottom: 24,
      left: 56,
      right: 56,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 8,
      color: "#94a3b8",
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: "#e2e8f0",
    },
  });

  const generatedAt = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const phaseLabel = PHASE_LABEL[project.phase] ?? project.phase.toUpperCase();
  const checklist = project.checklist ?? [];
  const checklistTotal = checklist.length;
  const checklistDone = checklist.filter((c) => c.done).length;

  const doc = (
    <Document
      title={`Project Report — ${project.name}`}
      author={project.closedByName ?? project.completedByName ?? "Sidekick"}
      subject="Project Report"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topBar} fixed />
        <View style={styles.brandRow}>
          <Image src={sidekickLogo} style={styles.brandLogo} />
          <Text style={styles.reportLabel}>PROJECT REPORT</Text>
        </View>
        <Text style={styles.title}>{project.name}</Text>
        <Text style={styles.subtitle}>
          {project.description?.trim()
            ? project.description
            : "No description provided."}
        </Text>
        <View style={styles.badgeRow}>
          <Text style={[styles.badge, styles.badgePrimary]}>{phaseLabel}</Text>
          {project.departmentName && (
            <Text style={[styles.badge, styles.badgeMuted]}>
              {project.departmentName}
            </Text>
          )}
          {project.priority && (
            <Text style={[styles.badge, styles.badgeMuted]}>
              {(PRIORITY_LABEL[project.priority] ?? project.priority) +
                " priority"}
            </Text>
          )}
        </View>

        {/* ---- Backlog / project metadata ---- */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Backlog · Project Details</Text>
        </View>
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Owner</Text>
            <Text style={styles.metaValue}>
              {fallback(project.ownerName)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Assigned team</Text>
            <Text style={styles.metaValue}>
              {fallback(project.assignedTeam)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Start date</Text>
            <Text style={styles.metaValue}>{fmtDate(project.startDate)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Anticipated completion</Text>
            <Text style={styles.metaValue}>{fmtDate(project.endDate)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Completed on</Text>
            <Text style={styles.metaValue}>
              {fmtDateTime(project.completedAt)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Closed on</Text>
            <Text style={styles.metaValue}>
              {fmtDateTime(project.closedAt)}
            </Text>
          </View>
        </View>

        {project.goal?.trim() ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Goal</Text>
            </View>
            <Text style={styles.body}>{project.goal}</Text>
          </>
        ) : null}

        {project.rationale?.trim() ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Rationale</Text>
            </View>
            <Text style={styles.body}>{project.rationale}</Text>
          </>
        ) : null}

        {/* ---- Planning ---- */}
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>Planning · Notes</Text>
        </View>
        {project.planningNotes?.trim() ? (
          <Text style={styles.body}>{project.planningNotes}</Text>
        ) : (
          <Text style={styles.bodyMuted}>No planning notes recorded.</Text>
        )}

        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>
            Planning · Checklist ({checklistDone} / {checklistTotal} done)
          </Text>
        </View>
        {checklistTotal === 0 ? (
          <Text style={styles.bodyMuted}>No checklist items.</Text>
        ) : (
          <>
            <View style={styles.checklistHeader} wrap={false}>
              <Text style={[styles.colStatus, styles.colHeaderText]}> </Text>
              <Text style={[styles.colItem, styles.colHeaderText]}>Item</Text>
              <Text style={[styles.colAssignee, styles.colHeaderText]}>
                Assignee
              </Text>
              <Text style={[styles.colDue, styles.colHeaderText]}>Due</Text>
            </View>
            {checklist.map((item, idx) => (
              <View
                style={styles.checklistRow}
                key={item.id ?? idx}
                wrap={false}
              >
                <Text style={styles.colStatus}>{item.done ? "☑" : "☐"}</Text>
                <Text style={item.done ? styles.colItemDone : styles.colItem}>
                  {item.text}
                </Text>
                <Text style={styles.colAssignee}>
                  {fallback(item.assigneeName)}
                </Text>
                <Text style={styles.colDue}>{fmtDate(item.dueDate)}</Text>
              </View>
            ))}
          </>
        )}

        {/* ---- In Progress ---- */}
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>In Progress · Status Update</Text>
        </View>
        {project.statusUpdate?.trim() ? (
          <Text style={styles.body}>{project.statusUpdate}</Text>
        ) : (
          <Text style={styles.bodyMuted}>No status update recorded.</Text>
        )}

        {/* ---- On Hold (only if applicable) ---- */}
        {(project.holdReason?.trim() || project.holdNotes?.trim()) && (
          <>
            <View style={styles.sectionHeader} wrap={false}>
              <Text style={styles.sectionTitle}>On Hold</Text>
            </View>
            {project.holdReason?.trim() ? (
              <Text style={styles.body}>Reason: {project.holdReason}</Text>
            ) : null}
            {project.holdNotes?.trim() ? (
              <Text style={styles.body}>{project.holdNotes}</Text>
            ) : null}
          </>
        )}

        {/* ---- Closeout ---- */}
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>
            Project Closeout · Completion Summary
          </Text>
        </View>
        {project.completionSummary?.trim() ? (
          <Text style={styles.body}>{project.completionSummary}</Text>
        ) : (
          <Text style={styles.bodyMuted}>
            No completion summary recorded.
          </Text>
        )}

        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>
            Project Closeout · Key Takeaway / Lessons Learned
          </Text>
        </View>
        {project.keyTakeaway?.trim() ? (
          <Text style={styles.body}>{project.keyTakeaway}</Text>
        ) : (
          <Text style={styles.bodyMuted}>No key takeaway recorded.</Text>
        )}

        {/* ---- Cancellation (only if applicable) ---- */}
        {project.cancellationReason?.trim() && (
          <>
            <View style={styles.sectionHeader} wrap={false}>
              <Text style={styles.sectionTitle}>Cancellation Reason</Text>
            </View>
            <Text style={styles.body}>{project.cancellationReason}</Text>
          </>
        )}

        {/* ---- Sign-off ---- */}
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>Sign-off</Text>
        </View>
        <View style={styles.signatureRow} wrap={false}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureName}>
              {fallback(project.completedByName)}
            </Text>
            <Text style={styles.signatureRole}>Marked Completed by</Text>
            <Text style={styles.signatureWhen}>
              {fmtDateTime(project.completedAt)}
            </Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureName}>
              {fallback(project.closedByName)}
            </Text>
            <Text style={styles.signatureRole}>Closed by</Text>
            <Text style={styles.signatureWhen}>
              {fmtDateTime(project.closedAt)}
            </Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            Project #{project.id} · Generated {generatedAt}
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
  const a = document.createElement("a");
  a.href = url;
  a.download = `Project-${safeFilenamePart(project.name) || project.id}-Report-${fileDateStamp(project)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Backwards-compatible alias for the previous export name.
export const downloadClosedProjectReport = downloadProjectReport;
