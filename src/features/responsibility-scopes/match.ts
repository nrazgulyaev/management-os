/**
 * Pure responsibility-scope matcher. No `server-only` so tests + future
 * task-routing helpers can import directly.
 *
 * Semantics:
 *   - A scope row narrows a user's actionable surface to a project /
 *     villa / category. NULL means "any".
 *   - `status !== 'active'` means the scope is archived and never matches.
 */

export interface ScopeLike {
  status: string;
  scopeType: string;
  projectId: string | null;
  villaId: string | null;
  taskCategory: string | null;
}

export interface TaskCandidate {
  scopeType: string;
  projectId: string | null;
  villaId: string | null;
  category: string;
}

export function matchesScope(scope: ScopeLike, task: TaskCandidate): boolean {
  if (scope.status !== "active") return false;
  if (scope.scopeType !== task.scopeType) return false;
  if (scope.projectId && scope.projectId !== task.projectId) return false;
  if (scope.villaId && scope.villaId !== task.villaId) return false;
  if (scope.taskCategory && scope.taskCategory !== task.category) return false;
  return true;
}

export function userHasScopeForTask(
  scopes: ScopeLike[],
  task: TaskCandidate,
): boolean {
  return scopes.some((s) => matchesScope(s, task));
}
