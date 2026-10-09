// Shared by the dashboard quick-action server actions and the components that show their result.
// (Lives outside actions.ts because a 'use server' file may only export async functions.)
export interface ActionResult {
  ok: boolean;
  message: string;
  /** The action was refused only because no overlay is connected; the form can offer "queue anyway". */
  needsForce?: boolean;
}
