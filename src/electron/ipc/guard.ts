import { ipcHandle } from "../util.js";
import { requirePermission, requireSession } from "../domain/session.js";
import type { Permission } from "../domain/permissions.js";

type Handler<Key extends keyof EventPayloadMapping> = (
  ...args: EventPayloadMapping[Key]["args"]
) => EventPayloadMapping[Key]["return"] | Promise<EventPayloadMapping[Key]["return"]>;

/**
 * `ipcHandle` with a permission check in front of it.
 *
 * This is where access control is actually enforced. The renderer hides what a
 * user can't do — routes, sidebar entries, buttons — but that is presentation:
 * `window.electron.deleteInvoice(id)` is one devtools console line away on any
 * machine. Every handler that changes or reveals something therefore states its
 * own requirement here, next to the work it does, rather than trusting that the
 * only caller is the screen we drew.
 *
 * Listing several permissions means *any* of them passes. That is what the
 * screens shared between roles need: the invoice counter searches the item
 * catalog, so a cashier reaches it through `invoice:create` and a manager
 * through `inventory:view`, and neither has to be granted the other's job.
 */
export function ipcHandleGuarded<Key extends keyof EventPayloadMapping>(
  key: Key,
  permissions: Permission[],
  handler: Handler<Key>
) {
  ipcHandle(key, (...args) => {
    requirePermission(...permissions);
    return handler(...args);
  });
}

/**
 * For the handful of channels any signed-in user needs regardless of role —
 * the business details printed on an invoice, the health of the database — but
 * that a signed-out window still has no business reading.
 */
export function ipcHandleAuthenticated<Key extends keyof EventPayloadMapping>(
  key: Key,
  handler: Handler<Key>
) {
  ipcHandle(key, (...args) => {
    requireSession();
    return handler(...args);
  });
}
