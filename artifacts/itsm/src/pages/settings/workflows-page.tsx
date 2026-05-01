import { SettingsLayout } from "@/components/settings/settings-layout";
import SettingsWorkflows from "@/pages/settings-workflows";

export default function SettingsWorkflowsPage() {
  return (
    <SettingsLayout activeCategorySlug="service" activePageSlug="workflows">
      <SettingsWorkflows />
    </SettingsLayout>
  );
}
