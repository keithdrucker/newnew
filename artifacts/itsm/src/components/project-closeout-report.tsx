// `@react-pdf/renderer` is a large dependency (~800KB gzip) used only
// when an admin clicks "Export PDF" on a closed project. We pull it
// in via `await import()` inside `downloadClosedProjectReport` so
// the PDF runtime is excluded from the initial app bundle.
import type { ProjectDetail } from "@workspace/api-client-react";

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
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

// Compute the YYYY-MM-DD stamp used in the download filename. Falls
// back to today if `closedAt` is missing or unparseable so a bad row
// can't throw inside the click handler.
function fileDateStamp(closedAt: string | null | undefined): string {
  let d = closedAt ? new Date(closedAt) : null;
  if (!d || Number.isNaN(d.getTime())) d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function downloadClosedProjectReport(
  project: ProjectDetail,
): Promise<void> {
  // Dynamic import keeps `@react-pdf/renderer` out of the main bundle.
  const reactPdf = await import("@react-pdf/renderer");
  const { Document, Page, Text, View, StyleSheet, pdf } = reactPdf;

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
      alignItems: "flex-end",
      marginBottom: 14,
    },
    brand: {
      fontSize: 9,
      color: "#475569",
      letterSpacing: 1.4,
      fontFamily: "Helvetica-Bold",
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
    badgeClosed: {
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

  const doc = (
    <Document
      title={`Project Closeout Report — ${project.name}`}
      author={project.closedByName ?? "Harmony ITSM"}
      subject="Project Closeout Report"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topBar} fixed />
        <View style={styles.brandRow}>
          <Text style={styles.brand}>EW HOWELL · HARMONY ITSM</Text>
          <Text style={styles.reportLabel}>PROJECT CLOSEOUT REPORT</Text>
        </View>
        <Text style={styles.title}>{project.name}</Text>
        <Text style={styles.subtitle}>
          {project.description?.trim()
            ? project.description
            : "No description provided."}
        </Text>
        <View style={styles.badgeRow}>
          <Text style={[styles.badge, styles.badgeClosed]}>CLOSED</Text>
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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Project Details</Text>
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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Completion Summary</Text>
        </View>
        {project.completionSummary?.trim() ? (
          <Text style={styles.body}>{project.completionSummary}</Text>
        ) : (
          <Text style={styles.bodyMuted}>
            No completion summary recorded.
          </Text>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Key Takeaway / Lessons Learned
          </Text>
        </View>
        {project.keyTakeaway?.trim() ? (
          <Text style={styles.body}>{project.keyTakeaway}</Text>
        ) : (
          <Text style={styles.bodyMuted}>No key takeaway recorded.</Text>
        )}

        {project.goal?.trim() ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Original Goal</Text>
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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Sign-off</Text>
        </View>
        <View style={styles.signatureRow}>
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
  a.download = `Project-${safeFilenamePart(project.name) || project.id}-Closeout-${fileDateStamp(project.closedAt)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
