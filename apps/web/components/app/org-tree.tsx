import type { OrgNode } from "@/lib/api/types";

/**
 * Renders the reporting hierarchy as a nested, accessible tree (ARIA tree/treeitem/group). Pure and
 * recursive; the API already nests reports under each manager, so this just walks the structure.
 */
export function OrgTree({ nodes }: { nodes: OrgNode[] }) {
  if (nodes.length === 0) {
    return <p className="text-sm text-gray-500">No employees to display.</p>;
  }
  return (
    <ul role="tree" className="space-y-1">
      {nodes.map((node) => (
        <OrgTreeNode key={node.id} node={node} />
      ))}
    </ul>
  );
}

function OrgTreeNode({ node }: { node: OrgNode }) {
  const reportCount = node.reports.length;
  const hasReports = reportCount > 0;
  return (
    <li role="treeitem" aria-expanded={hasReports ? true : undefined}>
      <div className="flex items-baseline gap-2 rounded-card px-2 py-1.5 hover:bg-gray-100">
        <span className="font-medium text-gray-900">{node.name}</span>
        <span className="font-mono text-xs text-gray-500">{node.employeeNumber}</span>
        {hasReports && (
          <span className="text-xs text-gray-500">
            {reportCount} report{reportCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {hasReports && (
        <ul role="group" className="ml-4 space-y-1 border-l border-gray-200 pl-4">
          {node.reports.map((child) => (
            <OrgTreeNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
