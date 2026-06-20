// Builds a single-line display address from a task's address parts, skipping
// empty parts so there are no gaps or dangling separators.
//
// ADR-0054 made the v2 /sync/download shape send ONE free-text `address`
// (stored locally in `addressStreet`) + a `pincode`, and DROPPED city/state
// (now empty strings; the columns are kept for legacy/pre-upgrade rows). Naive
// concatenation (`street, city, state pincode`) therefore rendered gaps like
// "…Mumbai, , 400001". This formats street/city/state as a comma-separated list
// of the non-empty parts, then appends the pincode space-separated per Indian
// postal convention (matching the app's pre-ADR-0054 rendering). Shared by all
// three task address surfaces (TaskCard, TaskDetailScreen, TaskInfoModal) so
// the same task shows an identical address everywhere.
interface TaskAddressParts {
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressPincode?: string | null;
}

export function formatTaskAddress(task: TaskAddressParts): string {
  const head = [task.addressStreet, task.addressCity, task.addressState]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  const pincode = task.addressPincode?.trim() ?? '';
  if (!pincode) {
    return head;
  }
  return head ? `${head} ${pincode}` : pincode;
}
