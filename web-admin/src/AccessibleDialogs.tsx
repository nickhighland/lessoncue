import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

type ConfirmRequest = {
  kind: "confirm";
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
  previousFocus: HTMLElement | null;
  resolve: (value: boolean) => void;
};
type TextRequest = {
  kind: "text";
  title: string;
  message?: string;
  label: string;
  defaultValue: string;
  confirmLabel: string;
  inputType: "text" | "url";
  previousFocus: HTMLElement | null;
  resolve: (value: string | null) => void;
};
type DialogRequest = ConfirmRequest | TextRequest;
type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  destructive?: boolean;
};
type TextOptions = {
  title: string;
  label: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  inputType?: "text" | "url";
};

const queue: DialogRequest[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function confirmAction(message: string, options: ConfirmOptions = {}) {
  return new Promise<boolean>((resolve) => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    queue.push({
      kind: "confirm",
      title: options.title || (options.destructive ? "Confirm deletion" : "Confirm action"),
      message,
      confirmLabel:
        options.confirmLabel || (options.destructive ? "Delete" : "Continue"),
      destructive: Boolean(options.destructive),
      previousFocus,
      resolve,
    });
    emit();
  });
}

export function requestText(options: TextOptions) {
  return new Promise<string | null>((resolve) => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    queue.push({
      kind: "text",
      title: options.title,
      label: options.label,
      message: options.message,
      defaultValue: options.defaultValue || "",
      confirmLabel: options.confirmLabel || "Continue",
      inputType: options.inputType || "text",
      previousFocus,
      resolve,
    });
    emit();
  });
}

function focusable(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

export function useDialogFocus<T extends HTMLElement>(
  onClose: () => void,
  restoreFocus?: HTMLElement | null,
): {
  dialogRef: RefObject<T | null>;
  onDialogKeyDown: (event: KeyboardEvent<T>) => void;
} {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = restoreFocus || (document.activeElement as HTMLElement | null);
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const target =
        dialog.querySelector<HTMLElement>("[autofocus]") ||
        focusable(dialog)[0] ||
        dialog;
      target.focus();
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      if (previous?.isConnected) previous.focus();
    };
  }, [restoreFocus]);
  function onDialogKeyDown(event: KeyboardEvent<T>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const controls = focusable(dialogRef.current);
    if (!controls.length) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return { dialogRef, onDialogKeyDown };
}

export function AccessibleDialogHost() {
  const [, render] = useState(0);
  const request = queue[0];
  useEffect(() => {
    const listener = () => render((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    const app = document.querySelector<HTMLElement>(".app-shell");
    if (!request || !app) return;
    const previous = app.getAttribute("aria-hidden");
    app.setAttribute("aria-hidden", "true");
    return () => {
      if (previous === null) app.removeAttribute("aria-hidden");
      else app.setAttribute("aria-hidden", previous);
    };
  }, [request]);
  function settle(value: boolean | string | null) {
    const current = queue.shift();
    if (!current) return;
    if (current.kind === "confirm") current.resolve(Boolean(value));
    else current.resolve(typeof value === "string" ? value : null);
    emit();
  }
  if (!request) return null;
  return <QueuedDialog request={request} settle={settle} />;
}

function QueuedDialog({
  request,
  settle,
}: {
  request: DialogRequest;
  settle: (value: boolean | string | null) => void;
}) {
  const { dialogRef, onDialogKeyDown } = useDialogFocus<HTMLDivElement>(
    () => settle(request.kind === "confirm" ? false : null),
    request.previousFocus,
  );
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      settle(request.kind === "confirm" ? false : null);
      return;
    }
    onDialogKeyDown(event);
  }
  const titleId = "lessoncue-action-dialog-title";
  const descriptionId = "lessoncue-action-dialog-description";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.kind === "confirm") settle(true);
    else {
      const value = String(new FormData(event.currentTarget).get("value") || "").trim();
      if (value) settle(value);
    }
  }
  return (
    <div className="modal-backdrop action-dialog-backdrop">
      <div
        ref={dialogRef}
        className="modal action-dialog"
        role={request.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <form onSubmit={submit} className="stack">
          <div className="modal-title">
            <h2 id={titleId}>{request.title}</h2>
            <button
              type="button"
              onClick={() => settle(request.kind === "confirm" ? false : null)}
              aria-label="Cancel and close dialog"
            >
              ×
            </button>
          </div>
          <p id={descriptionId} className="action-dialog-message">
            {request.message}
          </p>
          {request.kind === "text" && (
            <label className="field">
              <span>{request.label}</span>
              <input
                name="value"
                type={request.inputType}
                defaultValue={request.defaultValue}
                required
                autoFocus
              />
            </label>
          )}
          <div className="action-dialog-buttons">
            <button
              type="button"
              className="button"
              onClick={() => settle(request.kind === "confirm" ? false : null)}
            >
              Cancel
            </button>
            <button
              className={`button ${request.kind === "confirm" && request.destructive ? "danger" : "primary"}`}
              autoFocus={request.kind === "confirm"}
            >
              {request.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DialogSurface({
  children,
  onClose,
  className,
  label,
  labelledBy,
}: {
  children: ReactNode;
  onClose: () => void;
  className: string;
  label?: string;
  labelledBy?: string;
}) {
  const { dialogRef, onDialogKeyDown } = useDialogFocus<HTMLDivElement>(onClose);
  return (
    <div
      ref={dialogRef}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      {children}
    </div>
  );
}
