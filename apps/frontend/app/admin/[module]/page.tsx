import { notFound } from "next/navigation";

import { ModuleWorkspace } from "@/components/modules/module-workspace";
import { modulesForRole } from "@/lib/navigation";
import { getModuleWorkspaceData, parseModuleFilters } from "@/lib/modules/workspace-data";

type AdminModulePageProps = {
  params: {
    module: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminModulePage({ params, searchParams }: AdminModulePageProps) {
  const selectedModule = modulesForRole("admin").find((item) => item.key === params.module);

  if (!selectedModule || selectedModule.key === "dashboard") {
    notFound();
  }

  const filters = parseModuleFilters(searchParams);
  const data = await getModuleWorkspaceData("admin", selectedModule.key, filters);

  if (!data) {
    notFound();
  }

  return (
    <ModuleWorkspace
      role="admin"
      activeKey={selectedModule.key}
      navLabel={selectedModule.label}
      basePath={`/admin/${selectedModule.key}`}
      filters={filters}
      data={data}
    />
  );
}
