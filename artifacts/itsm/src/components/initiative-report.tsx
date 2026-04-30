// `@react-pdf/renderer` is loaded lazily to keep the ~800KB runtime
// out of the main bundle; it only ships when an admin clicks "Export
// PDF" from an initiative.
import type { Initiative } from "@workspace/api-client-react";
import sidekickLogo from "@assets/sidekick_logo.png";

const STATUS_LABEL: Record<string, string> = {
  backlog: "BACKLOG",
  under_review: "UNDER REVIEW",
  approved: "APPROVED",
  rejected_deferred: "REJECTED / DEFERRED",
};

const FINAL_DECISION_LABEL: Record<string, string> = {
  approve: "Approved → became a Project",
  defer: "Deferred",
  reject: "Rejected / Closed",
};

const IMPACT_SCOPE: Record<string, string> = {
  individual: "Individual",
  team: "Team",
  department: "Department",
  company_wide: "Company-wide",
};

const CATEGORY: Record<string, string> = {
  it: "IT",
  security: "Security",
  hr: "HR",
  finance: "Finance",
  operations: "Operations",
  compliance: "Compliance",
  customer_experience: "Customer Experience",
  other: "Other",
};

const LMH: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  unknown: "Unknown",
};

const ALIGNMENT: Record<string, string> = {
  yes: "Yes",
  no: "No",
  unsure: "Unsure",
};

const INVESTIGATION: Record<string, string> = {
  investigate_further: "Investigate Further",
  do_not_investigate: "Do Not Investigate",
};

const VALIDATION: Record<string, string> = {
  not_reviewed: "Not Reviewed",
  discussed: "Discussed",
  demoed: "Demoed",
  piloted: "Piloted",
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

function fmt(map: Record<string, string>, value: string | null | undefined) {
  if (!value || !value.trim()) return "—";
  return map[value] ?? value;
}

function safeFilenamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function fileDateStamp(initiative: Initiative): string {
  const candidate = initiative.decidedAt ?? initiative.updatedAt ?? null;
  let d = candidate ? new Date(candidate) : null;
  if (!d || Number.isNaN(d.getTime())) d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function downloadInitiativeReport(
  initiative: Initiative,
): Promise<void> {
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
    fieldLabel: {
      fontSize: 8,
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 8,
      marginBottom: 1,
    },
    fieldValue: {
      fontSize: 10.5,
      color: "#0f172a",
    },
    fieldValueMuted: {
      fontSize: 10,
      color: "#94a3b8",
      fontStyle: "italic",
    },
    decisionRow: {
      flexDirection: "row",
      gap: 18,
      marginTop: 8,
    },
    decisionBlock: {
      flex: 1,
      borderTopWidth: 1,
      borderTopColor: "#0f172a",
      paddingTop: 6,
    },
    decisionName: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: "#0f172a",
    },
    decisionRole: {
      fontSize: 8.5,
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 1,
    },
    decisionWhen: {
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

  const statusLabel =
    STATUS_LABEL[initiative.status] ?? initiative.status.toUpperCase();

  const renderField = (label: string, value: string | null | undefined) => (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      {value && value.trim() ? (
        <Text style={styles.fieldValue}>{value}</Text>
      ) : (
        <Text style={styles.fieldValueMuted}>—</Text>
      )}
    </>
  );

  const doc = (
    <Document
      title={`Initiative Report — ${initiative.title}`}
      author={initiative.decidedByName ?? "Sidekick"}
      subject="Initiative Report"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topBar} fixed />
        <View style={styles.brandRow}>
          <Image src={sidekickLogo} style={styles.brandLogo} />
          <Text style={styles.reportLabel}>INITIATIVE REPORT</Text>
        </View>
        <Text style={styles.title}>{initiative.title}</Text>
        <Text style={styles.subtitle}>
          {initiative.description?.trim()
            ? initiative.description
            : "No description provided."}
        </Text>
        <View style={styles.badgeRow}>
          <Text style={[styles.badge, styles.badgePrimary]}>{statusLabel}</Text>
          {initiative.departmentName && (
            <Text style={[styles.badge, styles.badgeMuted]}>
              {initiative.departmentName}
            </Text>
          )}
          {initiative.createdProjectId != null && (
            <Text style={[styles.badge, styles.badgeMuted]}>
              PROJECT P-{initiative.createdProjectId}
            </Text>
          )}
        </View>

        {/* ---- Identification ---- */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Initiative Details</Text>
        </View>
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Reporter</Text>
            <Text style={styles.metaValue}>
              {fallback(initiative.reporterName)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Assignee</Text>
            <Text style={styles.metaValue}>
              {fallback(initiative.assigneeName)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>
              {fmtDateTime(initiative.createdAt)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Last updated</Text>
            <Text style={styles.metaValue}>
              {fmtDateTime(initiative.updatedAt)}
            </Text>
          </View>
        </View>

        {/* ---- Intake ---- */}
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>Intake</Text>
        </View>
        {renderField(
          "Problem / Opportunity",
          initiative.problemOpportunity || initiative.description,
        )}
        {renderField(
          "Expected Benefit",
          initiative.businessValueSummary || initiative.expectedBenefit,
        )}
        <Text style={styles.fieldLabel}>Impact Scope</Text>
        <Text style={styles.fieldValue}>
          {fmt(IMPACT_SCOPE, initiative.impactScope)}
        </Text>
        {initiative.additionalNotes?.trim() && (
          <>
            <Text style={styles.fieldLabel}>Additional Notes</Text>
            <Text style={styles.fieldValue}>{initiative.additionalNotes}</Text>
          </>
        )}

        {/* ---- Backlog Triage ---- */}
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>Backlog Triage</Text>
        </View>
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Category</Text>
            <Text style={styles.metaValue}>
              {fmt(CATEGORY, initiative.category)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Initial Priority</Text>
            <Text style={styles.metaValue}>
              {fmt(LMH, initiative.initialPriority)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Initial Effort</Text>
            <Text style={styles.metaValue}>
              {fmt(LMH, initiative.initialEffort)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Business Alignment</Text>
            <Text style={styles.metaValue}>
              {fmt(ALIGNMENT, initiative.businessAlignment)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Investigation Decision</Text>
            <Text style={styles.metaValue}>
              {fmt(INVESTIGATION, initiative.investigationDecision)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Reviewed by</Text>
            <Text style={styles.metaValue}>
              {fallback(initiative.backlogReviewedByName)}
              {initiative.backlogReviewedAt
                ? ` · ${fmtDate(initiative.backlogReviewedAt)}`
                : ""}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Review start date</Text>
            <Text style={styles.metaValue}>
              {fmtDate(initiative.reviewStartDate)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Anticipated approval</Text>
            <Text style={styles.metaValue}>
              {fmtDate(initiative.anticipatedApprovalDate)}
            </Text>
          </View>
        </View>
        {initiative.backlogNotes?.trim() && (
          <>
            <Text style={styles.fieldLabel}>Triage Notes</Text>
            <Text style={styles.fieldValue}>{initiative.backlogNotes}</Text>
          </>
        )}

        {/* ---- Under Review Analysis ---- */}
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>Under Review · Analysis</Text>
        </View>
        {renderField("Benefits", initiative.benefits)}
        {renderField("Tradeoffs", initiative.tradeoffs)}
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Business Value Level</Text>
            <Text style={styles.metaValue}>
              {fmt(LMH, initiative.businessValueLevel)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Cost Level</Text>
            <Text style={styles.metaValue}>
              {fmt(LMH, initiative.costLevel)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Estimated Cost</Text>
            <Text style={styles.metaValue}>
              {fallback(initiative.estimatedCost)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Risk Level</Text>
            <Text style={styles.metaValue}>
              {fmt(LMH, initiative.riskLevel)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Validation Status</Text>
            <Text style={styles.metaValue}>
              {fmt(VALIDATION, initiative.validationStatus)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Impacted Teams</Text>
            <Text style={styles.metaValue}>
              {fallback(initiative.impactedTeams)}
            </Text>
          </View>
        </View>
        {initiative.businessValueSummary?.trim() && (
          <>
            <Text style={styles.fieldLabel}>Business Value Summary</Text>
            <Text style={styles.fieldValue}>
              {initiative.businessValueSummary}
            </Text>
          </>
        )}
        {initiative.riskNotes?.trim() && (
          <>
            <Text style={styles.fieldLabel}>Risk Notes</Text>
            <Text style={styles.fieldValue}>{initiative.riskNotes}</Text>
          </>
        )}

        {/* ---- Final Decision ---- */}
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionTitle}>Final Decision</Text>
        </View>
        <Text style={styles.fieldLabel}>Decision</Text>
        <Text style={styles.fieldValue}>
          {fmt(FINAL_DECISION_LABEL, initiative.finalDecision)}
        </Text>
        {renderField("Decision Rationale", initiative.decisionReason)}
        {initiative.revisitDate && (
          <>
            <Text style={styles.fieldLabel}>Revisit On</Text>
            <Text style={styles.fieldValue}>
              {fmtDate(initiative.revisitDate)}
            </Text>
          </>
        )}
        {initiative.createdProjectId != null && (
          <>
            <Text style={styles.fieldLabel}>Created Project</Text>
            <Text style={styles.fieldValue}>
              P-{initiative.createdProjectId}
            </Text>
          </>
        )}

        <View style={styles.decisionRow} wrap={false}>
          <View style={styles.decisionBlock}>
            <Text style={styles.decisionName}>
              {fallback(initiative.decidedByName)}
            </Text>
            <Text style={styles.decisionRole}>Decision recorded by</Text>
            <Text style={styles.decisionWhen}>
              {fmtDateTime(initiative.decidedAt)}
            </Text>
          </View>
          <View style={styles.decisionBlock}>
            <Text style={styles.decisionName}>
              {fallback(initiative.reporterName)}
            </Text>
            <Text style={styles.decisionRole}>Originally submitted by</Text>
            <Text style={styles.decisionWhen}>
              {fmtDateTime(initiative.createdAt)}
            </Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            Initiative #{initiative.id} · Generated {generatedAt}
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
  a.download = `Initiative-${safeFilenamePart(initiative.title) || initiative.id}-Report-${fileDateStamp(initiative)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
