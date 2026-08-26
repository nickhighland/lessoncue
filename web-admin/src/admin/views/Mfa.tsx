import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { MfaPolicyStatus, MfaSetup, MfaStatus } from "../models";
import { CollapsibleSettingsSection, Field, QrCode } from "../ui";
import { errorText } from "../utils";

export function AuthenticatorMfaPanel({
  notify,
  showPolicy = false,
  profile = false,
}: {
  notify: (message: string) => void;
  showPolicy?: boolean;
  profile?: boolean;
}) {
  const [status, setStatus] = useState<MfaStatus>();
  const [policy, setPolicy] = useState<MfaPolicyStatus>();
  const [setup, setSetup] = useState<MfaSetup>();
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api<MfaStatus>("/api/v1/auth/mfa"));
    } catch (error) {
      notify(errorText(error));
    }
  }, [notify]);

  const loadPolicy = useCallback(async () => {
    try {
      setPolicy(await api<MfaPolicyStatus>("/api/v1/auth/mfa/policy"));
    } catch (error) {
      notify(errorText(error));
    }
  }, [notify]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (showPolicy) void loadPolicy();
  }, [loadPolicy, showPolicy]);

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
      await loadStatus();
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
      await loadStatus();
      if (showPolicy) await loadPolicy();
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
      await loadStatus();
      if (showPolicy) await loadPolicy();
      notify("Authenticator MFA disabled.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function changePolicy(required: boolean) {
    setPolicyBusy(true);
    try {
      const result = await api<MfaPolicyStatus>("/api/v1/auth/mfa/policy", {
        method: "PUT",
        body: JSON.stringify({ requireForAllUsers: required }),
      });
      setPolicy(result);
      notify(
        required
          ? "Authenticator MFA is now required for every active user."
          : "Users may now choose whether to use Authenticator MFA.",
      );
    } catch (error) {
      notify(errorText(error));
    } finally {
      setPolicyBusy(false);
    }
  }

  const content = (
    <>
      <div className="settings-heading">
        <div>
          <span className="settings-kicker">
            {profile ? "ACCOUNT SECURITY" : "SERVICE ADMIN SECURITY"}
          </span>
          <h2>Authenticator MFA</h2>
          <p className="settings-copy">
            Each user can protect their own account with a standard authenticator
            app. An administrator can optionally require it for every active user.
          </p>
        </div>
        <span
          className={`update-state ${status?.enabled ? "current" : "available"}`}
        >
          {status?.enabled ? "Enabled" : "Optional"}
        </span>
      </div>
      {showPolicy && (
        <div className="settings-subsection mfa-policy">
          <div className="settings-heading">
            <div>
              <h3>Administrator policy</h3>
              <p className="settings-copy">
                Leave this off to let each user decide. Turn it on only after all
                active users have enrolled.
              </p>
            </div>
            {policy && (
              <span
                className={`update-state ${policy.requiredForAllUsers ? "current" : "available"}`}
              >
                {policy.requiredForAllUsers ? "Required for all" : "Per-user"}
              </span>
            )}
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={policy?.requiredForAllUsers ?? false}
              disabled={
                !policy || policyBusy ||
                (!policy.requiredForAllUsers && !status?.enabled)
              }
              onChange={(event) => void changePolicy(event.target.checked)}
            />
            <span>Require Authenticator MFA for every active user</span>
          </label>
          {policy && (
            <p className="mfa-policy-count">
              {policy.enrolledUsers} of {policy.activeUsers} active users enrolled.
            </p>
          )}
          {policy && policy.enrolledUsers < policy.activeUsers && !policy.requiredForAllUsers && (
            <div className="alert">
              Enroll every active user before enabling the all-user requirement.
            </div>
          )}
        </div>
      )}
      {status?.enabled ? (
        <form className="stack" onSubmit={disableMfa}>
          <p className="settings-copy">
            Your authenticator is enabled
            {status.totpEnabledAt
              ? ` since ${new Date(status.totpEnabledAt).toLocaleString()}`
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
              A previous setup was not finished. Enter your password to create a
              new setup code.
            </div>
          )}
          <Field
            label="Current password"
            hint="SSH password recovery also disables your MFA if the authenticator is lost."
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
    </>
  );

  return profile ? (
    <section className="profile-mfa">{content}</section>
  ) : (
    <CollapsibleSettingsSection
      label="Authenticator MFA"
      className="settings-panel settings-security settings-mfa"
    >
      {content}
    </CollapsibleSettingsSection>
  );
}
