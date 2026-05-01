import { SettingsLayout } from "@/components/settings/settings-layout";
import SettingsAgents from "@/pages/settings-agents";

export default function SettingsAgentsPage() {
  return (
    <SettingsLayout
      activeCategorySlug="people-access"
      activePageSlug="agents"
    >
      <SettingsAgents />
    </SettingsLayout>
  );
}
