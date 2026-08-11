import { confirmAction } from "../../AccessibleDialogs";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { permissionOptions } from "../constants";
import { Bootstrap, MfaSetup, MfaStatus, Permission, RegistrationCode, RegistrationSettings, TroubleshootingLog, User } from "../models";
import { CollapsibleSettingsSection, Definition, Empty, Field, Modal, PageHead, QrCode } from "../ui";
import { errorText, initials, isServiceAdminRole, localDateTimeValue, timeAgo } from "../utils";

export function UsersView({
  users,
  currentUsername,
  currentRole,
  refresh,
  notify,
  canManage,
  emailConfigured,
}: {
  users: User[];
  currentUsername: string;
  currentRole: string;
  refresh: () => void;
  notify: (s: string) => void;
  canManage: boolean;
  emailConfigured: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [creationMode, setCreationMode] = useState<"invite" | "temporary">(
    "invite",
  );
  const [editingUser, setEditingUser] = useState<User>();
  const [passwordUser, setPasswordUser] = useState<User>();
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    try {
      const permissions =
        values.customPermissions === "on" ? form.getAll("permission") : null;
      if (creationMode === "invite") {
        const result = await api<{ message: string }>(
          "/api/v1/users/invitations",
          {
            method: "POST",
            body: JSON.stringify({
              email: values.email,
              displayName: values.displayName || null,
              role: values.role,
              permissions,
            }),
          },
        );
        notify(result.message);
      } else {
        await api("/api/v1/users", {
          method: "POST",
          body: JSON.stringify({ ...values, disabled: false, permissions }),
        });
        notify("Local user created with a temporary password.");
      }
      setShowForm(false);
      refresh();
    } catch (e) {
      refresh();
      notify(errorText(e));
    }
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    try {
      await api(`/api/v1/users/${editingUser.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...values,
          password: values.password || null,
          disabled: editingUser.disabled,
          permissions:
            values.customPermissions === "on"
              ? form.getAll("permission")
              : null,
        }),
      });
      const invitationAddressChanged =
        editingUser.pendingSetup &&
        String(values.email || "")
          .trim()
          .toLowerCase() !==
          String(editingUser.email || "")
            .trim()
            .toLowerCase();
      setEditingUser(undefined);
      notify(
        invitationAddressChanged
          ? "User details saved. Send a new setup link to the changed address."
          : "User details saved.",
      );
      if (editingUser.username === currentUsername) location.reload();
      else refresh();
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function togglePaused(user: User) {
    try {
      await api(`/api/v1/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          username: user.username,
          displayName: user.displayName,
          email: user.email || null,
          role: user.role,
          password: null,
          disabled: !user.disabled,
          permissions: user.customPermissions ?? null,
        }),
      });
      refresh();
      notify(
        user.disabled
          ? `${user.displayName} can sign in again.`
          : `${user.displayName} is paused and has been signed out.`,
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function remove(user: User) {
    if (
      !await confirmAction(
        `Delete ${user.displayName}? This permanently removes the local account and cannot be undone.`,
        { destructive: true },
      )
    )
      return;
    try {
      await api(`/api/v1/users/${user.id}`, { method: "DELETE" });
      refresh();
      notify(`${user.displayName} was deleted.`);
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function approve(user: User) {
    try {
      const result = await api<{ message: string }>(
        `/api/v1/users/${user.id}/approve`,
        { method: "POST", body: "{}" },
      );
      refresh();
      notify(result.message);
    } catch (cause) {
      notify(errorText(cause));
    }
  }
  async function resendInvitation(user: User) {
    try {
      const result = await api<{ message: string }>(
        `/api/v1/users/${user.id}/invitation`,
        { method: "POST", body: "{}" },
      );
      notify(result.message);
    } catch (cause) {
      notify(errorText(cause));
    }
  }
  async function setTemporaryPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordUser) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirmPassword) {
      notify("Passwords do not match.");
      return;
    }
    try {
      const result = await api<{ message: string }>(
        `/api/v1/users/${passwordUser.id}/temporary-password`,
        {
          method: "POST",
          body: JSON.stringify({ password: values.password }),
        },
      );
      setPasswordUser(undefined);
      refresh();
      notify(result.message);
    } catch (cause) {
      notify(errorText(cause));
    }
  }
  function accountStatus(user: User) {
    if (user.pendingSetup)
      return { label: "Setup invited", className: "pending" };
    if (user.disabled) return { label: "Paused", className: "paused" };
    if (user.pendingApproval)
      return {
        label: user.emailVerified ? "Awaiting approval" : "Verify then approve",
        className: "pending",
      };
    if (!user.emailVerified)
      return { label: "Awaiting email", className: "pending" };
    if (user.mustChangePassword)
      return { label: "Temporary password", className: "pending" };
    return { label: "Active", className: "" };
  }
  return (
    <>
      <PageHead
        eyebrow="ACCESS CONTROL"
        title="Users"
        detail="Create accounts, approve requests, send setup invitations, reset passwords, and grant only the permissions each person needs."
        action={
          canManage ? (
            <div className="head-actions">
              <button
                className="button primary"
                disabled={!emailConfigured}
                title={
                  !emailConfigured
                    ? "Configure account email under Settings → Organization & accounts first."
                    : undefined
                }
                onClick={() => {
                  setCreationMode("invite");
                  setShowForm(true);
                }}
              >
                Send setup link
              </button>
              <button
                className="button"
                onClick={() => {
                  setCreationMode("temporary");
                  setShowForm(true);
                }}
              >
                Create with password
              </button>
            </div>
          ) : undefined
        }
      />
      {canManage && !emailConfigured && (
        <div className="alert user-email-note">
          Setup invitations and approval notifications require a configured
          email provider under Settings → Organization & accounts. Local
          temporary-password accounts remain available.
        </div>
      )}
      {showForm && (
        <Modal
          title={
            creationMode === "invite" ? "Invite a user" : "Create a local user"
          }
          onClose={() => setShowForm(false)}
        >
          <form className="stack" onSubmit={create}>
            {creationMode === "invite" ? (
              <>
                <div className="alert">
                  LessonCue emails a one-time setup link. The recipient chooses
                  their name, username, and password; you control their
                  permissions now.
                </div>
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </Field>
                <Field label="Name (optional)">
                  <input
                    name="displayName"
                    maxLength={120}
                    autoComplete="name"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Name">
                  <input name="displayName" required autoFocus />
                </Field>
                <div className="two-fields">
                  <Field label="Username">
                    <input name="username" required minLength={3} />
                  </Field>
                  <Field label="Email (optional)">
                    <input name="email" type="email" />
                  </Field>
                </div>
              </>
            )}
            <Field label="Role">
              <select name="role">
                <option>Editor</option>
                <option>Viewer</option>
                <option>App Admin</option>
                {isServiceAdminRole(currentRole) && (
                  <option>Service Admin</option>
                )}
              </select>
            </Field>
            <PermissionEditor />
            {creationMode === "temporary" && (
              <Field
                label="Temporary password"
                hint="The user must replace this after their first sign-in. Use 10+ characters with uppercase, lowercase, and a number."
              >
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              </Field>
            )}
            <button className="button primary">
              {creationMode === "invite" ? "Send setup email" : "Create user"}
            </button>
          </form>
        </Modal>
      )}
      {editingUser && (
        <Modal
          title={`Edit ${editingUser.displayName}`}
          onClose={() => setEditingUser(undefined)}
        >
          <form className="stack" onSubmit={update}>
            <Field label="Name">
              <input
                name="displayName"
                required
                autoFocus
                defaultValue={editingUser.displayName}
              />
            </Field>
            <div className="two-fields">
              <Field label="Username">
                <input
                  name="username"
                  required
                  minLength={3}
                  maxLength={80}
                  defaultValue={editingUser.username}
                  disabled={editingUser.pendingSetup}
                />
              </Field>
              <Field label="Email (optional)">
                <input
                  name="email"
                  type="email"
                  defaultValue={editingUser.email || ""}
                />
              </Field>
            </div>
            {editingUser.pendingSetup && (
              <input
                type="hidden"
                name="username"
                value={editingUser.username}
              />
            )}
            <Field label="Role">
              <select name="role" defaultValue={editingUser.role}>
                <option>Editor</option>
                <option>Viewer</option>
                <option>App Admin</option>
                {isServiceAdminRole(currentRole) && (
                  <option>Service Admin</option>
                )}
              </select>
            </Field>
            <PermissionEditor
              customPermissions={editingUser.customPermissions}
            />
            <button className="button primary">Save user</button>
          </form>
        </Modal>
      )}
      {passwordUser && (
        <Modal
          title={`Temporary password for ${passwordUser.displayName}`}
          onClose={() => setPasswordUser(undefined)}
        >
          <form className="stack" onSubmit={setTemporaryPassword}>
            <div className="alert">
              Existing sessions will be signed out. The user must replace this
              temporary password after signing in.
            </div>
            <Field
              label="Temporary password"
              hint="10+ characters with uppercase, lowercase, and a number"
            >
              <input
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                autoFocus
              />
            </Field>
            <Field label="Confirm temporary password">
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </Field>
            <button className="button primary">Set temporary password</button>
          </form>
        </Modal>
      )}
      <section className="panel user-table">
        <div className="user-row user-head">
          <span>User</span>
          <span>Role</span>
          <span>Status</span>
          <span>Last sign-in</span>
          <span>Actions</span>
        </div>
        {users.map((user) => {
          const self = user.username === currentUsername;
          const protectedServiceAdmin =
            isServiceAdminRole(user.role) && !isServiceAdminRole(currentRole);
          const status = accountStatus(user);
          return (
            <div
              className={`user-row ${user.disabled ? "paused" : ""}`}
              key={user.id}
            >
              <span className="user-name">
                <b>{initials(user.displayName)}</b>
                <span>
                  <strong>
                    {user.displayName}
                    {self ? " (you)" : ""}
                  </strong>
                  <small>
                    {user.pendingSetup
                      ? "Username chosen during setup"
                      : `@${user.username}`}
                    {user.email ? ` · ${user.email}` : ""}
                  </small>
                  <small>
                    {user.permissions.length} of {permissionOptions.length}{" "}
                    permissions
                    {user.customPermissions ? " · custom" : " · role defaults"}
                  </small>
                </span>
              </span>
              <span>
                <i className="pill">{user.role}</i>
              </span>
              <span className={`user-status ${status.className}`}>
                <i />
                {status.label}
              </span>
              <span>
                {user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never"}
              </span>
              <span className="user-actions">
                {canManage && (
                  <>
                    {user.pendingApproval && (
                      <button
                        className="primary-action"
                        onClick={() => approve(user)}
                        disabled={protectedServiceAdmin}
                      >
                        Approve
                      </button>
                    )}
                    {user.pendingSetup && (
                      <button
                        onClick={() => resendInvitation(user)}
                        disabled={protectedServiceAdmin}
                      >
                        Resend setup
                      </button>
                    )}
                    <button
                      onClick={() => setEditingUser(user)}
                      disabled={protectedServiceAdmin}
                    >
                      Edit
                    </button>
                    {!user.pendingSetup && !self && (
                      <button
                        onClick={() => setPasswordUser(user)}
                        disabled={protectedServiceAdmin}
                      >
                        Reset password
                      </button>
                    )}
                    <button
                      onClick={() => togglePaused(user)}
                      disabled={
                        self || protectedServiceAdmin || user.pendingSetup
                      }
                      title={
                        self ? "You cannot pause your own account." : undefined
                      }
                    >
                      {user.disabled ? "Reactivate" : "Pause"}
                    </button>
                    <button
                      className="danger"
                      onClick={() => remove(user)}
                      disabled={self || protectedServiceAdmin}
                      title={
                        self ? "You cannot delete your own account." : undefined
                      }
                    >
                      Delete
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </section>
    </>
  );
}

export function PermissionEditor({
  customPermissions,
}: {
  customPermissions?: Permission[] | null;
}) {
  const [custom, setCustom] = useState(customPermissions != null);
  const [selected, setSelected] = useState<Permission[]>(
    customPermissions || [],
  );
  return (
    <fieldset className="permission-editor">
      <legend>Permissions</legend>
      <label className="check-row">
        <input
          type="checkbox"
          name="customPermissions"
          checked={custom}
          onChange={(event) => setCustom(event.target.checked)}
        />
        <span>Customize this role</span>
      </label>
      <p>
        {custom
          ? "Choose each capability independently. Service settings and backups remain exclusive to Service Admins."
          : "Use the selected role's safe defaults. Service Admins always retain every permission."}
      </p>
      {custom && (
        <>
          <div className="permission-grid">
            {permissionOptions.map((permission) => {
              const active = selected.includes(permission.id);
              return (
                <button
                  type="button"
                  aria-pressed={active}
                  key={permission.id}
                  onClick={() =>
                    setSelected((current) =>
                      active
                        ? current.filter((value) => value !== permission.id)
                        : [...current, permission.id],
                    )
                  }
                >
                  <i>{active ? "✓" : ""}</i>
                  <span>
                    <strong>{permission.label}</strong>
                    <small>{permission.detail}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {selected.map((permission) => (
            <input
              type="hidden"
              name="permission"
              value={permission}
              key={permission}
            />
          ))}
        </>
      )}
    </fieldset>
  );
}

export function RegistrationSettingsPanel({
  bootstrap,
  notify,
  refresh,
  canServiceSettings,
}: {
  bootstrap: Bootstrap;
  notify: (message: string) => void;
  refresh: () => void;
  canServiceSettings: boolean;
}) {
  const [settings, setSettings] = useState<RegistrationSettings>({
    mode: bootstrap.settings.registrationMode,
    publicBaseUrl: bootstrap.settings.publicBaseUrl,
    emailFromAddress: bootstrap.settings.emailFromAddress,
    emailFromName: bootstrap.settings.emailFromName,
    emailProvider: bootstrap.settings.emailProvider,
    emailConfigured: bootstrap.accountEmail.configured,
  });
  const [apiKey, setApiKey] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [codes, setCodes] = useState<RegistrationCode[]>([]);
  const [revealedCode, setRevealedCode] = useState("");
  const [editingCode, setEditingCode] = useState<RegistrationCode>();
  const [busy, setBusy] = useState(false);
  const loadCodes = () =>
    api<RegistrationCode[]>("/api/v1/registration/codes")
      .then(setCodes)
      .catch((cause) => notify(errorText(cause)));
  useEffect(() => {
    void api<RegistrationCode[]>("/api/v1/registration/codes")
      .then(setCodes)
      .catch((cause) => notify(errorText(cause)));
  }, [notify]);
  async function saveRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ emailConfigured: boolean }>(
        canServiceSettings
          ? "/api/v1/registration/registration"
          : "/api/v1/registration/mode",
        {
          method: "PUT",
          body: JSON.stringify(
            canServiceSettings
              ? {
                  mode: settings.mode,
                  publicBaseUrl: settings.publicBaseUrl,
                }
              : { mode: settings.mode },
          ),
        },
      );
      setSettings((current) => ({
        ...current,
        emailConfigured: result.emailConfigured,
      }));
      refresh();
      notify(
        canServiceSettings ? "Registration settings saved." : "Registration mode saved.",
      );
    } catch (cause) {
      notify(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function saveEmailSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ emailConfigured: boolean }>(
        "/api/v1/registration/email-settings",
        {
          method: "PUT",
          body: JSON.stringify({
            emailProvider: settings.emailProvider,
            emailFromAddress: settings.emailFromAddress,
            emailFromName: settings.emailFromName,
            apiKey,
          }),
        },
      );
      setSettings((current) => ({
        ...current,
        emailConfigured: result.emailConfigured,
      }));
      setApiKey("");
      refresh();
      notify("Email settings saved.");
    } catch (cause) {
      notify(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function sendTestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTestingEmail(true);
    try {
      const result = await api<{ message: string }>(
        "/api/v1/registration/email/test",
        {
          method: "POST",
          body: JSON.stringify({ recipient: testRecipient }),
        },
      );
      notify(result.message);
    } catch (cause) {
      notify(errorText(cause));
    } finally {
      setTestingEmail(false);
    }
  }
  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api<{ code: string }>("/api/v1/registration/codes", {
        method: "POST",
        body: JSON.stringify({
          label: values.label,
          expiresAt: values.expiresAt
            ? new Date(String(values.expiresAt)).toISOString()
            : null,
          maxUses: values.maxUses ? Number(values.maxUses) : null,
        }),
      });
      setRevealedCode(result.code);
      form.reset();
      await loadCodes();
      notify("Registration code created. Copy it now.");
    } catch (cause) {
      notify(errorText(cause));
    }
  }
  async function rotateCode(item: RegistrationCode) {
    if (
      !await confirmAction(
        `Replace “${item.label}”? The current code will stop working immediately.`,
      )
    )
      return;
    try {
      const result = await api<{ code: string }>(
        `/api/v1/registration/codes/${item.id}/rotate`,
        { method: "POST", body: "{}" },
      );
      setRevealedCode(result.code);
      await loadCodes();
      notify("Registration code replaced. Copy the new code now.");
    } catch (cause) {
      notify(errorText(cause));
    }
  }
  async function updateCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCode) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/v1/registration/codes/${editingCode.id}`, {
        method: "PUT",
        body: JSON.stringify({
          label: values.label,
          expiresAt: values.expiresAt
            ? new Date(String(values.expiresAt)).toISOString()
            : null,
          maxUses: values.maxUses ? Number(values.maxUses) : null,
        }),
      });
      setEditingCode(undefined);
      await loadCodes();
      notify("Registration code limits saved.");
    } catch (cause) {
      notify(errorText(cause));
    }
  }
  async function revokeCode(item: RegistrationCode) {
    if (!await confirmAction(`Revoke “${item.label}”?`, {
      destructive: true,
      confirmLabel: "Revoke code",
    })) return;
    try {
      await api(`/api/v1/registration/codes/${item.id}`, { method: "DELETE" });
      await loadCodes();
      notify("Registration code revoked.");
    } catch (cause) {
      notify(errorText(cause));
    }
  }
  return (
    <>
      {editingCode && (
        <Modal
          title={`Edit ${editingCode.label}`}
          onClose={() => setEditingCode(undefined)}
        >
          <form className="stack" onSubmit={updateCode}>
            <Field label="Label">
              <input
                name="label"
                required
                maxLength={120}
                defaultValue={editingCode.label}
              />
            </Field>
            <Field label="Expires (leave blank for no expiration)">
              <input
                name="expiresAt"
                type="datetime-local"
                defaultValue={
                  editingCode.expiresAt
                    ? localDateTimeValue(editingCode.expiresAt)
                    : ""
                }
              />
            </Field>
            <Field label="Maximum uses (leave blank for unlimited)">
              <input
                name="maxUses"
                type="number"
                min="1"
                max="100000"
                defaultValue={editingCode.maxUses || ""}
              />
            </Field>
            <div className="modal-actions">
              <button
                className="button"
                type="button"
                onClick={() => setEditingCode(undefined)}
              >
                Cancel
              </button>
              <button className="button primary">Save limits</button>
            </div>
          </form>
        </Modal>
      )}
      <CollapsibleSettingsSection
        label="Registration"
        className="wide-settings account-settings settings-registration"
      >
        <div className="settings-heading">
          <div>
            <span className="settings-kicker">ACCOUNTS</span>
            <h2>Registration</h2>
            <p className="settings-copy">
              Choose how people create accounts. Administrator invitations remain
              available in every mode.
            </p>
          </div>
          <span
            className={`update-state ${settings.mode === "closed" ? "current" : "available"}`}
          >
            {settings.mode === "closed"
              ? "Registration closed"
              : settings.mode === "approval"
                ? "Approval required"
                : settings.mode === "code"
                  ? "Code required"
                  : "Registration open"}
          </span>
        </div>
        <form className="stack" onSubmit={saveRegistration}>
          <Field label="Registration mode">
            <select
              value={settings.mode}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  mode: event.target.value as RegistrationSettings["mode"],
                }))
              }
            >
              <option value="closed">
                Closed — administrator-created accounts and invitations only
              </option>
              <option value="approval">
                Request access — verify email, then wait for administrator
                approval
              </option>
              <option value="code">Require an active registration code</option>
              <option value="open">Open to anyone with a verified email</option>
            </select>
          </Field>
          {canServiceSettings && (
            <>
              <Field
                label="Public account-link address"
                hint="Use the HTTPS Cloudflare or reverse-proxy address users can reach from email. Leave blank to use the address from the current request."
              >
                <input
                  type="url"
                  value={settings.publicBaseUrl}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      publicBaseUrl: event.target.value,
                    }))
                  }
                  placeholder="https://lesson.example.org"
                />
              </Field>
              {settings.mode !== "closed" &&
                settings.emailProvider === "none" && (
                  <div className="alert error">
                    Self-service registration needs Resend or Brevo so LessonCue
                    can verify email addresses.
                  </div>
                )}
            </>
          )}
          {!canServiceSettings && (
            <div className="alert">
              {settings.emailConfigured
                ? "Account email is configured by a Service Admin, so self-service registration modes are available."
                : "A Service Admin must configure account email before approval, code, or open registration can be enabled."}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save registration"}
          </button>
        </form>
        <div className="settings-subsection registration-codes">
        <div className="settings-heading">
          <div>
            <h3>Registration codes</h3>
            <p>
              Codes are stored as one-way hashes. LessonCue shows each full code
              only when it is created or replaced.
            </p>
          </div>
        </div>
        {revealedCode && (
          <div className="secret-reveal">
            <span>Copy this code now</span>
            <code>{revealedCode}</code>
            <button
              className="button"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(revealedCode);
                notify("Registration code copied.");
              }}
            >
              Copy
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setRevealedCode("")}
            >
              Hide
            </button>
          </div>
        )}
        <form className="registration-code-form" onSubmit={createCode}>
          <Field label="Label">
            <input
              name="label"
              required
              maxLength={120}
              placeholder="Fall semester staff"
            />
          </Field>
          <Field label="Expires (optional)">
            <input name="expiresAt" type="datetime-local" />
          </Field>
          <Field label="Maximum uses (optional)">
            <input name="maxUses" type="number" min="1" max="100000" />
          </Field>
          <button className="button">Create code</button>
        </form>
        {codes.length ? (
          <div className="registration-code-list">
            {codes.map((item) => (
              <div key={item.id} className={!item.active ? "inactive" : ""}>
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    Ends in …{item.hint} · {item.uses}
                    {item.maxUses ? ` of ${item.maxUses}` : ""} uses ·{" "}
                    {item.expiresAt
                      ? `expires ${new Date(item.expiresAt).toLocaleString()}`
                      : "no expiration"}
                  </small>
                </span>
                <span className="row-actions">
                  {item.active && (
                    <button
                      className="button"
                      type="button"
                      onClick={() => setEditingCode(item)}
                    >
                      Edit
                    </button>
                  )}
                  {item.active && (
                    <button
                      className="button"
                      type="button"
                      onClick={() => rotateCode(item)}
                    >
                      Replace
                    </button>
                  )}
                  {item.active && (
                    <button
                      className="button danger"
                      type="button"
                      onClick={() => revokeCode(item)}
                    >
                      Revoke
                    </button>
                  )}
                  {!item.active && <small>Inactive</small>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="No registration codes"
            body="Create a code when registration is set to require one."
          />
        )}
        </div>
      </CollapsibleSettingsSection>
      {canServiceSettings && (
        <CollapsibleSettingsSection
          label="Email settings"
          className="wide-settings account-settings settings-email"
        >
          <div className="settings-heading">
            <div>
              <span className="settings-kicker">ACCOUNT EMAIL</span>
              <h2>Email settings</h2>
              <p className="settings-copy">
                Configure delivery for verification, invitations, and account recovery.
              </p>
            </div>
            <span
              className={`update-state ${settings.emailConfigured ? "current" : "available"}`}
            >
              {settings.emailConfigured ? "Provider configured" : "Not configured"}
            </span>
          </div>
          <form className="stack" onSubmit={saveEmailSettings}>
            <div className="two-fields">
              <Field label="Account email provider">
                <select
                  value={settings.emailProvider}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      emailProvider: event.target
                        .value as RegistrationSettings["emailProvider"],
                    }))
                  }
                >
                  <option value="none">None — local accounts only</option>
                  <option value="resend">Resend</option>
                  <option value="brevo">Brevo</option>
                </select>
              </Field>
              <Field
                label={
                  settings.emailConfigured
                    ? "Replace API key (optional)"
                    : "Email API key"
                }
                hint="The key is encrypted on this server and is never returned to a browser."
              >
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  required={
                    settings.emailProvider !== "none" &&
                    !settings.emailConfigured
                  }
                  disabled={settings.emailProvider === "none"}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <div className="two-fields">
              <Field label="Sender name">
                <input
                  value={settings.emailFromName}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      emailFromName: event.target.value,
                    }))
                  }
                  required={settings.emailProvider !== "none"}
                  disabled={settings.emailProvider === "none"}
                />
              </Field>
              <Field label="Verified sender address">
                <input
                  type="email"
                  value={settings.emailFromAddress}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      emailFromAddress: event.target.value,
                    }))
                  }
                  required={settings.emailProvider !== "none"}
                  disabled={settings.emailProvider === "none"}
                />
              </Field>
            </div>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save email settings"}
            </button>
          </form>
          <form
            className="settings-subsection email-test-form"
            onSubmit={sendTestEmail}
          >
            <div>
              <h3>Test email delivery</h3>
              <p>
                Send a real message through the saved provider and verified sender
                before opening registration.
              </p>
            </div>
            <Field label="Test recipient">
              <input
                type="email"
                value={testRecipient}
                onChange={(event) => setTestRecipient(event.target.value)}
                required
                placeholder="you@example.org"
              />
            </Field>
            <button
              className="button"
              disabled={!settings.emailConfigured || testingEmail}
            >
              {testingEmail
                ? "Sending…"
                : settings.emailConfigured
                  ? "Send test email"
                  : "Save provider first"}
            </button>
          </form>
        </CollapsibleSettingsSection>
      )}
    </>
  );
}

export function ServiceAdminMfaPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [status, setStatus] = useState<MfaStatus>();
  const [setup, setSetup] = useState<MfaSetup>();
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() =>
    api<MfaStatus>("/api/v1/auth/mfa")
      .then(setStatus)
      .catch((error) => notify(errorText(error))), [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  async function beginSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<MfaSetup>("/api/v1/auth/mfa/setup", {
        method: "POST",
        body: JSON.stringify({ currentPassword }),
      });
      setSetup(result);
      setCurrentPassword("");
      setCode("");
      await load();
      notify("Authenticator setup started. Verify one code to enable it.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function enableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/v1/auth/mfa/enable", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setSetup(undefined);
      setCode("");
      await load();
      notify("Authenticator MFA enabled.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function disableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/v1/auth/mfa", {
        method: "DELETE",
        body: JSON.stringify({ currentPassword, code }),
      });
      setCurrentPassword("");
      setCode("");
      setSetup(undefined);
      await load();
      notify("Authenticator MFA disabled.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <CollapsibleSettingsSection
      label="Authenticator MFA"
      className="settings-panel settings-accounts settings-mfa"
    >
      <div className="settings-heading">
        <div>
          <span className="settings-kicker">SERVICE ADMIN SECURITY</span>
          <h2>Authenticator MFA</h2>
          <p className="settings-copy">
            Require a time-based code from any standard authenticator app when
            this Service Admin signs in.
          </p>
        </div>
        <span
          className={`update-state ${status?.enabled ? "current" : "available"}`}
        >
          {status?.enabled ? "Enabled" : "Optional"}
        </span>
      </div>
      {status?.enabled ? (
        <form className="stack" onSubmit={disableMfa}>
          <p className="settings-copy">
            Enabled
            {status.totpEnabledAt
              ? ` ${new Date(status.totpEnabledAt).toLocaleString()}`
              : ""}. Disabling it signs out other sessions.
          </p>
          <Field label="Current password">
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Current authenticator code">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,8}"
              required
            />
          </Field>
          <button className="button danger" disabled={busy}>
            {busy ? "Disabling…" : "Disable MFA"}
          </button>
        </form>
      ) : setup ? (
        <form className="stack mfa-setup" onSubmit={enableMfa}>
          <div className="mfa-provisioning">
            <QrCode value={setup.provisioningUri} />
            <div>
              <strong>1. Scan this code with your authenticator app.</strong>
              <p>Or enter this setup key manually:</p>
              <code>{setup.secret}</code>
            </div>
          </div>
          <Field label="2. Verify the current six-digit code">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,8}"
              required
              autoFocus
            />
          </Field>
          <button className="button primary" disabled={busy}>
            {busy ? "Verifying…" : "Enable MFA"}
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={beginSetup}>
          {status?.configured && (
            <div className="alert">
              A previous setup was not finished. Enter your password to create
              a new setup code.
            </div>
          )}
          <Field
            label="Current password"
            hint="SSH password recovery also disables MFA if the authenticator is lost."
          >
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <button className="button primary" disabled={busy}>
            {busy ? "Preparing…" : "Set up authenticator MFA"}
          </button>
        </form>
      )}
    </CollapsibleSettingsSection>
  );
}

export function TroubleshootingLogPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [report, setReport] = useState<TroubleshootingLog>();
  const [query, setQuery] = useState("");
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = async (failureMode = failuresOnly) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: failureMode ? "10000" : "1000" });
      if (failureMode) params.set("failuresOnly", "true");
      setReport(
        await api<TroubleshootingLog>(`/api/v1/troubleshooting-log?${params}`),
      );
    } catch (cause) {
      notify(errorText(cause));
    } finally {
      setLoading(false);
    }
  };
  const download = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lessoncue-troubleshooting-${new Date().toISOString().replaceAll(":", "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const term = query.trim().toLowerCase();
  const runtime = (report?.runtime || []).filter(
    (entry) => {
      const searchable = `${entry.level} ${entry.category} ${entry.event} ${entry.message} ${entry.exception || ""}`
        .toLowerCase();
      return (!failuresOnly || entry.isFailure) && (!term || searchable.includes(term));
    },
  );
  const audit = (report?.audit || []).filter(
    (entry) => {
      const searchable = `${entry.actor} ${entry.action} ${entry.object} ${entry.result} ${entry.summary || ""}`
        .toLowerCase();
      return (
        (!failuresOnly || /fail|error|exception|denied|timeout/i.test(searchable)) &&
        (!term || searchable.includes(term))
      );
    },
  );
  return (
    <CollapsibleSettingsSection
      label="Troubleshooting log"
      className="wide-settings settings-panel settings-data"
    >
      <div className="settings-heading">
        <div>
          <span className="settings-kicker">SERVICE ADMIN ONLY</span>
          <h2>Troubleshooting log</h2>
          <p className="settings-copy">
            Review local runtime events and the durable activity audit.
            Sensitive credential values are redacted before they are saved or
            shown. Failures are retained separately for seven days so they are
            still available after routine events rotate out.
          </p>
        </div>
        <span className="update-state current">Private server diagnostics</span>
      </div>
      <div className="head-actions">
        <button className="button primary" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : report ? "Refresh log" : "Load log"}
        </button>
        {report && (
          <button className="button" onClick={download}>
            Download JSON
          </button>
        )}
      </div>
      {report && (
        <>
          <div className="two-fields">
            <Field label="Search events, people, and messages">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Example: transcode, failed, email"
              />
            </Field>
            <label className="check-row troubleshooting-filter">
              <input
                type="checkbox"
                checked={failuresOnly}
                onChange={(event) => {
                  const next = event.target.checked;
                  setFailuresOnly(next);
                  if (report) void load(next);
                }}
              />
              Show failures only
            </label>
            <Definition
              label="Retention"
              value={`${report.retention.runtimeEntries.toLocaleString()} routine entries · ${report.retention.failureRetentionDays} days of failures`}
            />
          </div>
          <div className="settings-subsection">
            <h3>Runtime events ({runtime.length})</h3>
            {runtime.length ? (
              <div className="audit-list troubleshooting-list">
                {runtime.map((entry, index) => (
                  <div key={`${entry.timestamp}-${index}`}>
                    <span>
                      <strong>
                        {entry.isFailure ? "Failure · " : ""}
                        {entry.level} · {entry.category}
                      </strong>
                      <small>
                        {entry.event}: {entry.message}
                        {entry.exceptionType ? ` — ${entry.exceptionType}` : ""}
                        {entry.exception ? `: ${entry.exception}` : ""}
                      </small>
                      {entry.details && (
                        <details className="troubleshooting-details">
                          <summary>Technical details</summary>
                          <pre>{entry.details}</pre>
                        </details>
                      )}
                    </span>
                    <small>{new Date(entry.timestamp).toLocaleString()}</small>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="No matching runtime events"
                body="Try a different search, or refresh after reproducing the issue."
              />
            )}
          </div>
          <div className="settings-subsection">
            <h3>Activity audit ({audit.length})</h3>
            {audit.length ? (
              <div className="audit-list troubleshooting-list">
                {audit.map((item) => (
                  <div key={item.id}>
                    <span>
                      <strong>{item.action.replaceAll(".", " ")}</strong>
                      <small>
                        {item.actor}
                        {item.summary ? ` · ${item.summary}` : ""}
                        {item.result ? ` · ${item.result}` : ""}
                      </small>
                    </span>
                    <small>{new Date(item.timestamp).toLocaleString()}</small>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="No matching activity"
                body="Administrative actions and background work will appear here."
              />
            )}
          </div>
        </>
      )}
    </CollapsibleSettingsSection>
  );
}
