import type { UiState } from "./contract";

/** Plain wording for the stable error codes the API returns. */
const CODES: Record<string, string> = {
  // closed
  admin_not_configured: "The admin has not been opened yet. Nothing is wrong on your side.",
  authorization_recovery_required:
    "Access is closed while the operator completes recovery. Old sessions and passkeys no longer work. When recovery is finished, sign in again and enroll two new passkeys.",
  restore_reconciliation_required:
    "Access is closed while a restore is being checked. Anything you had open here has been cleared.",
  deployment_binding_mismatch: "This deployment is not the one approved for the admin.",
  deployment_binding_missing: "This deployment has not been approved for the admin yet.",
  journal_rollback_detected: "Access is closed because the records need an operator check.",
  schema_not_qualified: "Access is closed until the database update is confirmed.",
  // unavailable
  service_unavailable: "The admin could not answer. Your work here is kept.",
  request_timeout: "The request took too long. Your work here is kept.",
  sources_unavailable: "The NEVORA and Velani sources could not be reached.",
  source_unavailable: "The source could not be reached, so this could not be checked.",
  source_coverage_unavailable: "The source could not be read in full, so this could not be checked.",
  classification_coverage_unavailable: "Internal fixture labels could not be read in full.",
  writes_disabled: "Saving is turned off in this environment.",
  unexpected_response: "The admin did not return a readable answer.",
  fixture_not_recorded: "No qualification sample was recorded for this view.",
  // forbidden
  identity_denied: "This Google account is not the admin owner.",
  identity_not_enrolled: "This Google account has not been set up for the admin.",
  origin_denied: "This request did not come from the admin address.",
  csrf_denied: "This page is out of date. Reload it and try again.",
  enrollment_not_authorized:
    "Passkey setup is not open. The operator opens a private 15 minute setup window. Ask for it, then try again.",
  backup_factor_required: "A backup passkey is needed before you can sign in.",
  private_operator_required: "This step is done privately by the operator.",
  // sign-in
  authentication_required: "You are signed out.",
  challenge_expired: "That passkey prompt expired. Start it again.",
  identity_invalid: "Google sign-in could not be confirmed. Start again.",
  passkey_invalid: "That passkey was not accepted.",
  // conflicts
  version_changed: "This record changed after you opened it. Your edits are kept. Reload the record, then save again.",
  operation_changed: "This save no longer matches the one sent before. Check the form and save again.",
  case_exists: "A case is already open for this request.",
  open_projects: "Finish or cancel this client's open projects before closing the relationship.",
  live_nevora_relationship: "A linked NEVORA workplace is still paid, on trial or in grace, so the relationship cannot be closed.",
  source_changed: "The workplace changed after you opened it. Reload it and check again.",
  client_inactive: "This client is inactive. Reactivate the client before adding or changing work.",
  different_owner_exists: "This workplace is already linked to another client.",
  identity_review_expired: "The identity review expired. Sign in with Google again.",
  // invalid
  invalid_fields: "Check the marked fields.",
  empty_command: "Nothing was changed.",
  engagement_confirmation_required: "Confirm the service relationship to make this client active.",
  closure_reason_required: "Closing a relationship needs the reason Relationship closed.",
  contact_confirmation_required: "A verified contact needs the reason Contact confirmed.",
  invalid_relationship_transition: "That relationship change is not allowed.",
  reopen_reason_required: "Reopening finished work needs the reason Work reopened.",
  link_reason_required: "Changing a case link needs the reason Client link verified.",
  project_client_mismatch: "That project belongs to a different client.",
  source_contact_mismatch: "The contact does not match the linked workplace enrollment.",
  invalid_search: "Search needs 1 to 120 characters.",
  invalid_target: "That record cannot take this change.",
  missing_target: "The record for this change is missing.",
  // bad request
  invalid_cursor: "The list position expired. The list was reloaded from the start.",
  invalid_filter: "That filter is not supported.",
  invalid_json: "The request could not be read.",
  body_too_large: "That is too much text to save at once.",
};

const FIELD_ISSUES: Record<string, string> = {
  too_small: "This is required.",
  too_big: "This is too long.",
  invalid_format: "This is not in the right format.",
  invalid_value: "Choose one of the listed options.",
  invalid_type: "This is required.",
  unrecognized_keys: "This field is not accepted.",
  custom: "Remove unsupported characters.",
};

export function codeText(code: string): string {
  return CODES[code] ?? "Something did not work. Try again.";
}

export function fieldIssue(codes: string[] | undefined): string | null {
  if (!codes?.length) return null;
  return FIELD_ISSUES[codes[0]] ?? "Check this field.";
}

/** One short sentence for any non-ok state. */
export function stateText(state: UiState): string {
  switch (state.kind) {
    case "ok":
      return "";
    case "signed_out":
      return codeText(state.code);
    case "reauth":
      return "Confirm with your passkey to continue. Your edits are kept.";
    case "rate_limited":
      return `Too many requests. Wait ${Math.ceil(state.retryAfterMs / 1000)} seconds, then try again.`;
    case "not_found":
      return "This record was not found. It may have expired or been removed.";
    case "uncertain":
      return "The connection dropped before an answer arrived.";
    default:
      return codeText(state.code);
  }
}

export function label(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  const s = String(value).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function when(value: unknown, none = "Not set"): string {
  if (typeof value !== "string" || !value) return none;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return dateOnly.format(new Date(value + "T00:00:00Z"));
  const t = Date.parse(value);
  return Number.isFinite(t) ? dateTime.format(new Date(t)) : none;
}

export const PROVENANCE: Record<string, string> = {
  asserted: "Asserted, not verified",
  source_enrollment: "From workplace enrollment",
  operator_verified: "Verified by operator",
};
