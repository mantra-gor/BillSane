import {
  FiAlertTriangle,
  FiCheck,
  FiCornerDownLeft,
  FiLoader,
  FiSearch,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import Badge from "../ui/elements/Badge";
import Button from "../ui/elements/Button";
import { formatINR } from "../../utils/format";
import {
  customerInitials,
  formatLastVisit,
  type CustomerMatch,
} from "../../utils/customerStore";
import { EMAIL_REGEX, PHONE_REGEX } from "../../utils/validators";

interface CustomerIdentityProps {
  matches: CustomerMatch[];
  searching: boolean;
  searched: boolean;
  /** The record this invoice will be billed to, once the operator accepts one. */
  linked: CustomerMatch | null;
  /** Live field values, so the panel can say what a save would change. */
  phone: string;
  email: string;
  onLink: (match: CustomerMatch) => void;
  onUnlink: () => void;
}

/** Avatar + name + trading history — the "is this the right person?" block. */
function Identity({ match }: { match: CustomerMatch }) {
  const lastVisit = formatLastVisit(match.lastInvoiceAt);
  const history = [
    `${match.invoiceCount} invoice${match.invoiceCount === 1 ? "" : "s"}`,
    formatINR(match.totalSpent),
    lastVisit ? `last visit ${lastVisit}` : null,
  ].filter(Boolean);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-munsell_blue-5 text-xs font-bold text-munsell_blue-700 ring-1 ring-munsell_blue-50">
        {customerInitials(match.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{match.name}</p>
        <p className="truncate text-xs text-ink-muted tnum">
          {match.phone}
          {match.email ? ` · ${match.email}` : ""}
        </p>
        {match.invoiceCount > 0 && (
          <p className="mt-0.5 truncate text-xs text-ink-faint tnum">
            {history.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

/** Explains *why* this record surfaced — the reassurance an operator needs. */
function MatchReason({ match }: { match: CustomerMatch }) {
  if (match.matchedOn.length === 2) {
    return (
      <Badge tone="success" size="sm">
        Phone + email match
      </Badge>
    );
  }
  if (match.matchedOn.includes("email")) {
    return (
      <Badge tone="warning" size="sm">
        Found by email
      </Badge>
    );
  }
  return (
    <Badge tone="accent" size="sm">
      Found by phone
    </Badge>
  );
}

/** A neutral one-line status, used for the idle / searching / new-customer states. */
function StatusLine({
  icon: Icon,
  spin = false,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  spin?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-line bg-surface-subtle px-3.5 py-3 text-[13px] text-ink-muted">
      <Icon size={15} className={`shrink-0 ${spin ? "animate-spin" : ""}`} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * The counter's "who is this?" panel, sitting directly above the customer
 * fields on a new invoice.
 *
 * It is deliberately not a modal: at a till, a dialog between typing a number
 * and typing a name costs more than it saves. The panel proposes, the operator
 * keeps typing, and nothing is written until the invoice is saved.
 */
function CustomerIdentity({
  matches,
  searching,
  searched,
  linked,
  phone,
  email,
  onLink,
  onUnlink,
}: CustomerIdentityProps) {
  // --- Linked: show what saving will change on the record ---
  if (linked) {
    const typedPhone = phone.trim();
    const typedEmail = email.trim().toLowerCase();
    const phoneChanged =
      PHONE_REGEX.test(typedPhone) && typedPhone !== linked.phone;
    const emailChanged =
      EMAIL_REGEX.test(typedEmail) && typedEmail !== (linked.email ?? "");

    // A phone number belongs to exactly one record. If the one being typed is
    // already someone else's the save will be refused, so say so here rather
    // than letting the operator find out after ringing up the whole basket.
    const conflict = matches.find(
      (match) => match.id !== linked.id && match.phone === typedPhone
    );

    return (
      <div className="rounded-xl border border-success-border bg-success-soft/60 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <Identity match={linked} />
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone="success" size="sm" icon={<FiCheck size={11} />}>
              Linked
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              icon={<FiX size={14} />}
              onClick={onUnlink}
              title="Bill this as a different customer">
              Change
            </Button>
          </div>
        </div>

        {conflict && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-[13px] text-danger-ink">
            <FiAlertTriangle size={15} className="mt-px shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">
                {typedPhone} is already {conflict.name}'s number
              </p>
              <p className="mt-0.5">
                Use a different number, or bill this invoice to {conflict.name}{" "}
                instead.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto shrink-0"
              onClick={() => onLink(conflict)}>
              Bill {conflict.name.split(" ")[0]}
            </Button>
          </div>
        )}

        {!conflict && (phoneChanged || emailChanged) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-[13px] text-warning-ink">
            <FiAlertTriangle size={15} className="mt-px shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">
                Saving updates this customer's details
              </p>
              <ul className="mt-1 space-y-0.5 tnum">
                {phoneChanged && (
                  <li>
                    Phone {linked.phone} → {typedPhone}
                  </li>
                )}
                {emailChanged && (
                  <li>
                    Email {linked.email || "none on file"} → {typedEmail}
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Unlinked: propose matches, or confirm this is someone new ---
  if (searching) {
    return (
      <StatusLine icon={FiLoader} spin>
        Checking for an existing customer…
      </StatusLine>
    );
  }

  if (matches.length > 0) {
    const single = matches.length === 1;
    return (
      <div className="space-y-2">
        {!single && (
          <p className="text-xs font-medium text-ink-muted">
            {matches.length} customers match these details — pick the right one.
          </p>
        )}
        {matches.map((match) => (
          <div
            key={match.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-munsell_blue-50 bg-munsell_blue-5/50 p-3.5">
            <Identity match={match} />
            <div className="flex shrink-0 flex-col items-end gap-2">
              <MatchReason match={match} />
              <Button
                size="sm"
                variant="accent"
                onClick={() => onLink(match)}
                trailing={
                  single ? <FiCornerDownLeft size={12} opacity={0.7} /> : undefined
                }>
                Use details
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (searched) {
    return (
      <StatusLine icon={FiUserPlus}>
        No match — this will be saved as a new customer.
      </StatusLine>
    );
  }

  return (
    <StatusLine icon={FiSearch}>
      Start with the phone number — returning customers fill in automatically.
    </StatusLine>
  );
}

export default CustomerIdentity;
