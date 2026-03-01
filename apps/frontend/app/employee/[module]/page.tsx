import { notFound } from "next/navigation";

import { ModuleWorkspace } from "@/components/modules/module-workspace";
import { modulesForRole } from "@/lib/navigation";
import { getModuleWorkspaceData, parseModuleFilters } from "@/lib/modules/workspace-data";

type EmployeeModulePageProps = {
  params: {
    module: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function EmployeeModulePage({ params, searchParams }: EmployeeModulePageProps) {
  const selectedModule = modulesForRole("employee").find((item) => item.key === params.module);

  if (!selectedModule || selectedModule.key === "dashboard") {
    notFound();
  }

  const filters = parseModuleFilters(searchParams);
  const data = await getModuleWorkspaceData("employee", selectedModule.key, filters);

  if (!data) {
    notFound();
  }

  return (
    <ModuleWorkspace
      role="employee"
      activeKey={selectedModule.key}
      navLabel={selectedModule.label}
      basePath={`/employee/${selectedModule.key}`}
      filters={filters}
      data={data}
    />
  );
}
