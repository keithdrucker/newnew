import { SettingsLayout } from "@/components/settings/settings-layout";
import SettingsRiskRules from "@/pages/settings-risk-rules";

// Risk Rules sits underneath Service Configuration → Automation Rules
// in the new IA. The legacy /settings/risk-rules route still resolves
// (App.tsx routes it through this wrapper) so any saved bookmarks or
// in-app links continue to work.
export default function SettingsRiskRulesPage() {
  return (
    <SettingsLayout activeCategorySlug="service" activePageSlug="automation">
      <SettingsRiskRules />
    </SettingsLayout>
  );
}
