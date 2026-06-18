/** Tracks active mastering / export work so promotional UI can defer itself. */

type WorkflowGuardListener = (busy: boolean) => void;

let workflowBusy = false;
const listeners = new Set<WorkflowGuardListener>();

export function setMastersourceWorkflowBusy(busy: boolean): void {
  if (workflowBusy === busy) return;
  workflowBusy = busy;
  listeners.forEach((listener) => listener(workflowBusy));
}

export function isMastersourceWorkflowBusy(): boolean {
  return workflowBusy;
}

export function subscribeMastersourceWorkflowBusy(listener: WorkflowGuardListener): () => void {
  listeners.add(listener);
  listener(workflowBusy);
  return () => {
    listeners.delete(listener);
  };
}
