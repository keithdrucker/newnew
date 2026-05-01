import {
  db,
  departmentsTable,
  departmentSettingsTable,
  usersTable,
  ticketsTable,
  ticketCommentsTable,
  kbArticlesTable,
  assetsTable,
  sessionStateTable,
  riskRulesTable,
} from "@workspace/db";

// Default category → risk level mapping. Surfaced in Settings → Risk Rules so
// admins can extend it; also used at ticket-create time to pick a default
// risk level when the caller (or AI categoriser) doesn't supply one.
const DEFAULT_RISK_RULES: Array<{
  category: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}> = [
  { category: "Security Incident", riskLevel: "high" },
  { category: "Access Request", riskLevel: "medium" },
  { category: "Hardware", riskLevel: "low" },
  { category: "Software", riskLevel: "low" },
  { category: "Email/Phishing", riskLevel: "high" },
  { category: "Privileged Access", riskLevel: "high" },
  { category: "Data Exposure", riskLevel: "critical" },
];

// Best-effort title → category heuristics for demo tickets.
function inferCategory(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes("phish") || t.includes("spam") || t.includes("email"))
    return "Email/Phishing";
  if (t.includes("password") || t.includes("mfa") || t.includes("login"))
    return "Access Request";
  if (
    t.includes("vpn") ||
    t.includes("admin rights") ||
    t.includes("privileged")
  )
    return "Privileged Access";
  if (t.includes("breach") || t.includes("leak") || t.includes("exposure"))
    return "Data Exposure";
  if (
    t.includes("malware") ||
    t.includes("ransomware") ||
    t.includes("incident")
  )
    return "Security Incident";
  if (
    t.includes("laptop") ||
    t.includes("monitor") ||
    t.includes("printer") ||
    t.includes("device")
  )
    return "Hardware";
  if (
    t.includes("teams") ||
    t.includes("outlook") ||
    t.includes("software") ||
    t.includes("app")
  )
    return "Software";
  return null;
}

const departments = [
  { name: "IT", slug: "it", color: "#6366f1", icon: "Laptop", description: "Information Technology service desk." },
  { name: "QAQC", slug: "qaqc", color: "#0ea5e9", icon: "ShieldCheck", description: "Quality Assurance & Quality Control." },
  { name: "Safety", slug: "safety", color: "#f59e0b", icon: "HardHat", description: "Site safety and incident response." },
  { name: "Finance & Accounting", slug: "finance", color: "#10b981", icon: "Banknote", description: "AP, AR, payroll, expense." },
  { name: "HR", slug: "hr", color: "#ec4899", icon: "Users", description: "Hiring, benefits, employee relations." },
  { name: "Insurance", slug: "insurance", color: "#8b5cf6", icon: "Umbrella", description: "Policy, claims, COI." },
  { name: "Legal", slug: "legal", color: "#0f172a", icon: "Scale", description: "Contracts and compliance." },
  { name: "MWBE", slug: "mwbe", color: "#22c55e", icon: "Handshake", description: "Minority/Women Business Enterprise compliance." },
  { name: "Marketing & Sales", slug: "marketing-sales", color: "#f43f5e", icon: "Megaphone", description: "Outbound, brand, proposals." },
  { name: "Prequalification", slug: "prequalification", color: "#14b8a6", icon: "ListChecks", description: "Vendor and project prequalification." },
  { name: "Procore", slug: "procore", color: "#f97316", icon: "Hammer", description: "Procore platform admin and field support." },
  { name: "Security", slug: "security", color: "#dc2626", icon: "Lock", description: "Physical and information security." },
  { name: "Workplace Resources", slug: "workplace-resources", color: "#64748b", icon: "Building2", description: "Office, facilities, supplies." },
];

async function main() {
  console.log("Wiping existing data...");
  await db.delete(sessionStateTable);
  await db.delete(ticketCommentsTable);
  await db.delete(ticketsTable);
  await db.delete(assetsTable);
  await db.delete(kbArticlesTable);
  await db.delete(departmentSettingsTable);
  await db.delete(usersTable);
  await db.delete(departmentsTable);
  await db.delete(riskRulesTable);

  console.log("Inserting risk rules...");
  await db.insert(riskRulesTable).values(DEFAULT_RISK_RULES);

  console.log("Inserting departments...");
  const deptRows = await db
    .insert(departmentsTable)
    .values(departments)
    .returning();

  console.log("Inserting department settings...");
  await db.insert(departmentSettingsTable).values(
    deptRows.map((d) => ({
      departmentId: d.id,
      portalEnabled: true,
      portalTitle: `${d.name} Help Center`,
      portalWelcome: `Submit a request to the ${d.name} team and we'll respond shortly.`,
      defaultPriority: "medium",
      slaResponseMinutes: d.slug === "safety" ? 15 : 60,
      slaResolutionMinutes:
        d.slug === "safety" ? 60 * 4 : 60 * 24,
      autoAssign: true,
      notifyOnNewTicket: true,
      notifyOnSlaBreach: true,
      allowEndUserAttachments: true,
      requireCategory: false,
      businessHoursStart: "08:00",
      businessHoursEnd: "18:00",
      ticketCategories:
        d.slug === "it"
          ? ["Hardware", "Software", "Access", "Network", "Email"]
          : d.slug === "hr"
            ? ["Benefits", "PTO", "Onboarding", "Payroll question"]
            : d.slug === "safety"
              ? ["Near miss", "Incident", "PPE", "Site inspection"]
              : ["General", "Question", "Request"],
    })),
  );

  console.log("Inserting users (admin, agents, end users)...");
  // 1 admin
  // ~2 agents per department (the first one will be the dept lead)
  // many end users
  const itDept = deptRows.find((d) => d.slug === "it")!;
  const adminRow = (
    await db
      .insert(usersTable)
      .values({
        name: "Lena Park",
        email: "lena.park@ewhowell.com",
        role: "admin",
        title: "Service Desk Administrator",
        location: "Plainview, NY (HQ)",
        departmentId: itDept.id,
      })
      .returning()
  )[0];

  const agentSpecs: Array<{
    name: string;
    email: string;
    title: string;
    deptSlug: string;
  }> = [];
  const baseAgents: Record<string, [string, string][]> = {
    it: [["Marcus Reyes", "Senior Systems Engineer"], ["Priya Shah", "Helpdesk Lead"]],
    qaqc: [["Daniel Wu", "QA Manager"], ["Hannah Riley", "QC Inspector"]],
    safety: [["Tomás Vega", "Safety Director"], ["Renee Okafor", "Site Safety Officer"]],
    finance: [["Margot Bishop", "Controller"], ["Jin Park", "AP Specialist"]],
    hr: [["Aisha Bennett", "HR Business Partner"], ["Eli Lawson", "Talent Coordinator"]],
    insurance: [["Owen Parrish", "Risk Manager"]],
    legal: [["Cara Donnelly", "General Counsel"]],
    mwbe: [["Naomi Grant", "MWBE Compliance Lead"]],
    "marketing-sales": [["Brett Halloran", "Director of BD"], ["Sofia Iyer", "Marketing Manager"]],
    prequalification: [["Wendell Cho", "Prequal Analyst"]],
    procore: [["Ramon Castillo", "Procore Admin"]],
    security: [["Kira Nash", "Security Lead"]],
    "workplace-resources": [["Theo Bramwell", "Office Manager"]],
  };
  function emailFor(name: string): string {
    const normalized = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return normalized.replace(/[^a-z]+/g, ".") + "@ewhowell.com";
  }
  for (const [slug, list] of Object.entries(baseAgents)) {
    for (const [name, title] of list) {
      agentSpecs.push({
        name,
        email: emailFor(name),
        title,
        deptSlug: slug,
      });
    }
  }

  const agentRows = await db
    .insert(usersTable)
    .values(
      agentSpecs.map((a) => ({
        name: a.name,
        email: a.email,
        role: "agent",
        title: a.title,
        location: "Plainview, NY (HQ)",
        departmentId: deptRows.find((d) => d.slug === a.deptSlug)!.id,
      })),
    )
    .returning();

  // End users — assorted across departments
  const endUserSpecs: Array<{ name: string; deptSlug: string; title: string; location: string }> = [
    { name: "Janelle Whitaker", deptSlug: "marketing-sales", title: "Sales Engineer", location: "Plainview, NY (HQ)" },
    { name: "Trent McAllister", deptSlug: "finance", title: "Project Accountant", location: "Plainview, NY (HQ)" },
    { name: "Suki Watanabe", deptSlug: "qaqc", title: "Field Engineer", location: "JFK Terminal 6 Jobsite" },
    { name: "Devon Marsh", deptSlug: "it", title: "Project Manager", location: "Yankee Stadium Jobsite" },
    { name: "Maeve Calloway", deptSlug: "hr", title: "Recruiter", location: "Plainview, NY (HQ)" },
    { name: "Beatriz Solano", deptSlug: "procore", title: "Superintendent", location: "Cornell Tech Jobsite" },
    { name: "Asher Kowalski", deptSlug: "safety", title: "Foreman", location: "LaGuardia Concourse Jobsite" },
    { name: "Reese Aldridge", deptSlug: "legal", title: "Contracts Coordinator", location: "Plainview, NY (HQ)" },
    { name: "Indira Bose", deptSlug: "workplace-resources", title: "Estimator", location: "Plainview, NY (HQ)" },
    { name: "Quinton Meyers", deptSlug: "insurance", title: "Operations Lead", location: "Plainview, NY (HQ)" },
    { name: "Harper Velez", deptSlug: "mwbe", title: "Project Engineer", location: "Brooklyn Navy Yard Jobsite" },
    { name: "Felix Brennan", deptSlug: "prequalification", title: "Estimator", location: "Plainview, NY (HQ)" },
  ];
  const endUserRows = await db
    .insert(usersTable)
    .values(
      endUserSpecs.map((u) => ({
        name: u.name,
        email: emailFor(u.name),
        role: "end_user",
        title: u.title,
        location: u.location,
        departmentId: deptRows.find((d) => d.slug === u.deptSlug)!.id,
      })),
    )
    .returning();

  const allUsers = [adminRow, ...agentRows, ...endUserRows];

  console.log("Inserting tickets...");
  const ticketTitlesByDept: Record<string, string[]> = {
    it: [
      "Cannot connect to corporate VPN from jobsite trailer",
      "MS Teams crashes when sharing screen",
      "Need new MacBook Pro for new hire onboarding",
      "Outlook search index keeps failing",
      "Printer on the 4th floor jamming intermittently",
      "Request: increase Procore license seats by 5",
      "Slack notifications not arriving on iPhone",
      "Two-factor app reset for jobsite super",
    ],
    qaqc: [
      "Concrete cylinder break log discrepancy on JFK6",
      "Punchlist export missing photos in Procore",
      "Need additional inspector for façade pour Tuesday",
    ],
    safety: [
      "Near miss: dropped tool on Cornell Tech tower crane lift",
      "PPE refill needed at LaGuardia warehouse",
      "Fall protection harness inspection overdue",
    ],
    finance: [
      "AP invoice GL miscoded for vendor 8821",
      "Need W-9 from subcontractor for jobsite payment",
      "Expense report stuck in Concur approval",
    ],
    hr: [
      "Update beneficiary on 401k",
      "Question about parental leave eligibility",
      "Onboarding checklist missing for new estimator",
    ],
    insurance: [
      "Need updated COI for Brooklyn Navy Yard project",
      "Auto policy update for new fleet truck",
    ],
    legal: [
      "Subcontract redline review needed by Friday",
      "NDA template request for new partner",
    ],
    mwbe: [
      "Quarterly MWBE participation report missing data",
    ],
    "marketing-sales": [
      "Proposal binder cover update for Penn Station bid",
      "Website case study for Cornell Tech needs photos",
    ],
    prequalification: [
      "Vendor prequal package incomplete — missing safety EMR",
    ],
    procore: [
      "Procore RFI workflow not routing to right approver",
      "Sync error between Procore and Sage 300",
    ],
    security: [
      "Badge access not working at Plainview HQ side door",
    ],
    "workplace-resources": [
      "Office coffee machine not dispensing",
      "Conference room A monitor flickering",
    ],
  };

  type TicketSeed = typeof ticketsTable.$inferInsert;
  const ticketsToInsert: TicketSeed[] = [];
  const incCounter = { n: 1 };
  const reqCounter = { n: 1 };
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  function pick<T>(arr: T[], i: number): T {
    return arr[i % arr.length];
  }

  const sources = ["portal", "email", "phone", "chat", "walk_in"] as const;
  const priorities = ["low", "medium", "high", "urgent"] as const;
  const statuses = ["new", "new", "in_progress", "in_progress", "resolved", "resolved", "closed"] as const;

  let idx = 0;
  for (const dept of deptRows) {
    const titles = ticketTitlesByDept[dept.slug] ?? ["General request"];
    const deptAgents = agentRows.filter((a) => a.departmentId === dept.id);
    const deptEndUsers = endUserRows.filter((u) => u.departmentId === dept.id);
    if (deptEndUsers.length === 0) deptEndUsers.push(...endUserRows.slice(0, 3));

    for (let i = 0; i < titles.length; i++) {
      const isIncident = i % 3 !== 0;
      const ticketKey = isIncident
        ? `INC-${String(incCounter.n++).padStart(3, "0")}`
        : `REQ-${String(reqCounter.n++).padStart(3, "0")}`;
      const reporter = pick(deptEndUsers, i);
      const assignee = deptAgents.length ? pick(deptAgents, i) : null;
      const priority = pick([...priorities], idx);
      const status = pick([...statuses], idx);
      const source = pick([...sources], idx);

      // Distribute creation across last 60 days
      const createdOffsetDays = (idx * 1.7) % 60;
      const createdAt = new Date(now - createdOffsetDays * oneDay);

      const slaRespMin = dept.slug === "safety" ? 15 : 60;
      const slaResMin = dept.slug === "safety" ? 60 * 4 : 60 * 24;
      const responseDueAt = new Date(createdAt.getTime() + slaRespMin * 60 * 1000);
      const resolutionDueAt = new Date(createdAt.getTime() + slaResMin * 60 * 1000);

      // First response: most are within SLA, some breach
      const respondedSec = (idx % 7 === 0)
        ? slaRespMin * 60 + 200 // breach
        : Math.floor(Math.random() * slaRespMin * 60 * 0.6) + 30;
      const firstResponseAt =
        status === "open" && idx % 4 !== 0
          ? null
          : new Date(createdAt.getTime() + respondedSec * 1000);

      const resolvedAt =
        status === "resolved" || status === "closed"
          ? new Date(
              createdAt.getTime() +
                (idx % 5 === 0
                  ? slaResMin * 60 * 1000 + 60 * 60 * 1000 // breach
                  : Math.floor(slaResMin * 60 * 1000 * 0.5)),
            )
          : null;

      const slaBreached =
        (firstResponseAt && firstResponseAt > responseDueAt) ||
        (resolvedAt != null && resolvedAt > resolutionDueAt) ||
        (status === "open" && new Date() > responseDueAt && !firstResponseAt);

      ticketsToInsert.push({
        ticketKey,
        title: titles[i],
        description:
          "Reported by user. Detailed reproduction steps and screenshots attached. Please triage and assign.",
        type: isIncident ? "incident" : "request",
        priority,
        status,
        source,
        departmentId: dept.id,
        reporterId: reporter.id,
        assigneeId: assignee?.id ?? null,
        location: reporter.location,
        team:
          dept.slug === "it"
            ? "Helpdesk"
            : dept.slug === "safety"
              ? "Field Safety"
              : dept.slug === "finance"
                ? "AP"
                : null,
        category: inferCategory(titles[i]),
        riskLevel:
          DEFAULT_RISK_RULES.find(
            (rule) => rule.category === inferCategory(titles[i]),
          )?.riskLevel ?? "low",
        slaBreached: !!slaBreached,
        responseDueAt,
        resolutionDueAt,
        firstResponseAt,
        resolvedAt,
        createdAt,
        updatedAt: createdAt,
      });
      idx++;
    }
  }

  const insertedTickets = await db
    .insert(ticketsTable)
    .values(ticketsToInsert)
    .returning();

  console.log("Inserting ticket comments...");
  const sampleComments: Array<typeof ticketCommentsTable.$inferInsert> = [];
  for (const t of insertedTickets.slice(0, 18)) {
    const author = allUsers.find((u) => u.id === t.assigneeId) ?? agentRows[0];
    sampleComments.push({
      ticketId: t.id,
      authorId: t.reporterId,
      body:
        "Thanks for the quick reply — I tried restarting and the issue still happens. Let me know what else to try.",
      createdAt: new Date(t.createdAt.getTime() + 30 * 60 * 1000),
    });
    sampleComments.push({
      ticketId: t.id,
      authorId: author.id,
      body:
        "Investigating now. I've escalated to the platform team and will follow up within the SLA window.",
      createdAt: new Date(t.createdAt.getTime() + 90 * 60 * 1000),
    });
  }
  if (sampleComments.length) {
    await db.insert(ticketCommentsTable).values(sampleComments);
  }

  console.log("Inserting KB articles...");
  await db.insert(kbArticlesTable).values([
    {
      title: "How to reset your corporate password",
      body: "If you've forgotten your password or it has expired, follow these steps...\n\n1. Visit the password portal\n2. Enter your @ewhowell.com email\n3. Check your phone for the verification code",
      departmentId: deptRows.find((d) => d.slug === "it")!.id,
      authorId: adminRow.id,
      tags: ["password", "account", "self-serve"],
      views: 412,
    },
    {
      title: "Connecting to the jobsite VPN (OpenVPN)",
      body: "Each jobsite trailer has its own OpenVPN profile. Download the matching .ovpn file from the IT portal, then...",
      departmentId: deptRows.find((d) => d.slug === "it")!.id,
      authorId: adminRow.id,
      tags: ["vpn", "jobsite", "network"],
      views: 219,
    },
    {
      title: "Reporting a near miss on site",
      body: "Any near miss must be reported within 24 hours. Use the Safety portal or call the on-call safety officer.",
      departmentId: deptRows.find((d) => d.slug === "safety")!.id,
      authorId: agentRows.find((a) => a.email.startsWith("tomas"))!.id,
      tags: ["near miss", "OSHA", "field"],
      views: 88,
    },
    {
      title: "Submitting expense reports in Concur",
      body: "All expenses over $25 require a receipt. Submit weekly. Project codes must match the cost code in Sage.",
      departmentId: deptRows.find((d) => d.slug === "finance")!.id,
      authorId: agentRows.find((a) => a.email.startsWith("margot"))!.id,
      tags: ["concur", "expense", "ap"],
      views: 174,
    },
    {
      title: "Open enrollment FAQ",
      body: "Open enrollment runs annually in November. Eligible benefits include medical, dental, vision, 401k, and HSA.",
      departmentId: deptRows.find((d) => d.slug === "hr")!.id,
      authorId: agentRows.find((a) => a.email.startsWith("aisha"))!.id,
      tags: ["benefits", "enrollment"],
      views: 96,
    },
    {
      title: "Procore RFI routing rules",
      body: "RFIs are routed by trade. Mechanical RFIs auto-assign to the MEP coordinator. Architectural RFIs go to the design lead.",
      departmentId: deptRows.find((d) => d.slug === "procore")!.id,
      authorId: agentRows.find((a) => a.email.startsWith("ramon"))!.id,
      tags: ["procore", "rfi"],
      views: 51,
    },
  ]);

  console.log("Inserting assets...");
  const itDeptId = deptRows.find((d) => d.slug === "it")!.id;
  const officeAssets: Array<typeof assetsTable.$inferInsert> = [
    { assetTag: "EWH-LAP-0042", name: "MacBook Pro 14\"", type: "laptop", manufacturer: "Apple", model: "MBP14 M3", serialNumber: "C02XKQ9PMD6T", location: "Plainview HQ", site: "office", status: "in_use", assignedToId: adminRow.id, departmentId: itDeptId, purchasedAt: new Date("2024-08-12"), warrantyEndsAt: new Date("2027-08-12") },
    { assetTag: "EWH-LAP-0043", name: "MacBook Pro 14\"", type: "laptop", manufacturer: "Apple", model: "MBP14 M3", serialNumber: "C02XKQ9PMD7T", location: "Plainview HQ", site: "office", status: "in_use", assignedToId: agentRows[0].id, departmentId: itDeptId, purchasedAt: new Date("2024-08-12"), warrantyEndsAt: new Date("2027-08-12") },
    { assetTag: "EWH-MON-0211", name: "Dell U2723QE 27\"", type: "monitor", manufacturer: "Dell", model: "U2723QE", serialNumber: "DLM2723QE-991", location: "Plainview HQ", site: "office", status: "in_use", assignedToId: agentRows[1].id, departmentId: itDeptId },
    { assetTag: "EWH-PRT-0008", name: "HP Color LaserJet", type: "printer", manufacturer: "HP", model: "M553x", serialNumber: "HP-LJM553-8181", location: "Plainview HQ Floor 4", site: "office", status: "in_use", departmentId: itDeptId },
    { assetTag: "EWH-PHN-0117", name: "iPhone 15", type: "phone", manufacturer: "Apple", model: "iPhone 15 Pro", serialNumber: "F2LWDQXC15", location: "Plainview HQ", site: "office", status: "in_use", assignedToId: endUserRows[0].id, departmentId: deptRows.find((d) => d.slug === "marketing-sales")!.id },
    { assetTag: "EWH-SVR-0003", name: "Dell PowerEdge R750", type: "server", manufacturer: "Dell", model: "R750", serialNumber: "PE-R750-0003", location: "Plainview HQ Server Room", site: "office", status: "in_use", departmentId: itDeptId },
    { assetTag: "JFK6-LAP-0102", name: "ThinkPad T14 (jobsite kit)", type: "laptop", manufacturer: "Lenovo", model: "T14 Gen 4", serialNumber: "PF3CKTRX102", location: "JFK Terminal 6 Trailer A", site: "jobsite", status: "in_use", assignedToId: endUserRows[2].id, departmentId: deptRows.find((d) => d.slug === "qaqc")!.id },
    { assetTag: "CORN-LAP-0033", name: "ThinkPad T14 (jobsite kit)", type: "laptop", manufacturer: "Lenovo", model: "T14 Gen 4", serialNumber: "PF3CKTRX033", location: "Cornell Tech Trailer 1", site: "jobsite", status: "in_use", assignedToId: endUserRows[5].id, departmentId: deptRows.find((d) => d.slug === "procore")!.id },
    { assetTag: "LGA-PRN-0021", name: "Brother MFC Printer", type: "printer", manufacturer: "Brother", model: "MFC-L8900CDW", serialNumber: "BR-LGA-021", location: "LaGuardia Concourse Trailer", site: "jobsite", status: "in_use", departmentId: itDeptId },
    { assetTag: "BNY-RTR-0009", name: "Cisco Meraki MX67", type: "network", manufacturer: "Cisco", model: "MX67", serialNumber: "MK-MX67-9", location: "Brooklyn Navy Yard Trailer", site: "jobsite", status: "in_use", departmentId: itDeptId },
    { assetTag: "EWH-TBL-0044", name: "iPad Pro 12.9\"", type: "tablet", manufacturer: "Apple", model: "iPad Pro M2", serialNumber: "DMQX1FTBL44", location: "Plainview HQ", site: "office", status: "in_storage", departmentId: itDeptId },
    { assetTag: "EWH-LAP-0029", name: "MacBook Air 13\"", type: "laptop", manufacturer: "Apple", model: "M2 Air", serialNumber: "C02OLDAIR29", location: "Plainview HQ Storage", site: "office", status: "retired", departmentId: itDeptId },
    { assetTag: "JFK6-TLR-0001", name: "Total Station", type: "tool", manufacturer: "Trimble", model: "S7", serialNumber: "TR-S7-001", location: "JFK Terminal 6 Trailer A", site: "jobsite", status: "in_use", departmentId: deptRows.find((d) => d.slug === "qaqc")!.id },
    { assetTag: "EWH-VEH-0007", name: "Ford F-150 (Fleet)", type: "vehicle", manufacturer: "Ford", model: "F-150 XL 2024", serialNumber: "1FTFW1E5XPKE12345", location: "Plainview HQ Lot", site: "office", status: "in_use", departmentId: deptRows.find((d) => d.slug === "workplace-resources")!.id },
  ];
  await db.insert(assetsTable).values(officeAssets);

  console.log("Setting initial demo session to admin...");
  await db.insert(sessionStateTable).values({ currentUserId: adminRow.id });

  console.log(`✓ Seed complete: ${deptRows.length} departments, ${allUsers.length} users, ${insertedTickets.length} tickets.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
