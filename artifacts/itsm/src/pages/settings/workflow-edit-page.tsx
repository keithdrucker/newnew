import { SettingsLayout } from "@/components/settings/settings-layout";
import SettingsWorkflowEdit from "@/pages/settings-workflow-edit";

export default function SettingsWorkflowEditPage() {
  return (
    <SettingsLayout activeCategorySlug="service" activePageSlug="workflows">
      <SettingsWorkflowEdit />
    </SettingsLayout>
  );
}
