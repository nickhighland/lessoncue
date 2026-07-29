import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

type QuestionType = "single" | "multiple" | "text";
type AudienceResponse = {
  id: string;
  choices: string[];
  text: string;
  moderationStatus: "pending" | "approved" | "rejected";
  submittedAt: string;
  updatedAt: string;
};
type AudienceQuestion = {
  id?: string;
  position: number;
  type: QuestionType;
  prompt: string;
  options: string[];
  required: boolean;
  maxSelections: number;
  moderateResponses: boolean;
  responses: AudienceResponse[];
};
type AudienceSession = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "open" | "closed";
  showLiveResults: boolean;
  allowResponseChanges: boolean;
  retentionDays: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  openedAt?: string;
  closedAt?: string;
  purgeAt: string;
  participantCount: number;
  pendingModerationCount: number;
  questions: AudienceQuestion[];
};
type PublicQuestion = Omit<AudienceQuestion, "responses" | "moderateResponses">;
type PublicResults = {
  participantCount: number;
  questions: {
    id: string;
    prompt: string;
    type: QuestionType;
    counts: { option: string; count: number }[];
    textResponses: string[];
  }[];
};
type PublicSession = {
  code: string;
  title: string;
  status: "draft" | "open" | "closed";
  showLiveResults: boolean;
  allowResponseChanges: boolean;
  questions: PublicQuestion[];
  results?: PublicResults;
  privacy: string;
};
type EditableSession = {
  id?: string;
  title: string;
  showLiveResults: boolean;
  allowResponseChanges: boolean;
  retentionDays: number;
  questions: AudienceQuestion[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

function blankQuestion(): AudienceQuestion {
  return {
    position: 0,
    type: "single",
    prompt: "",
    options: ["Yes", "No"],
    required: true,
    maxSelections: 1,
    moderateResponses: true,
    responses: [],
  };
}

function editable(item?: AudienceSession): EditableSession {
  return item
    ? {
        id: item.id,
        title: item.title,
        showLiveResults: item.showLiveResults,
        allowResponseChanges: item.allowResponseChanges,
        retentionDays: item.retentionDays,
        questions: item.questions.map((question) => ({
          ...question,
          options: [...question.options],
          responses: [...question.responses],
        })),
      }
    : {
        title: "New audience poll",
        showLiveResults: true,
        allowResponseChanges: true,
        retentionDays: 7,
        questions: [blankQuestion()],
      };
}

export function AudienceAdmin({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [sessions, setSessions] = useState<AudienceSession[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<EditableSession>();
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const selected = sessions.find((item) => item.id === selectedId);

  async function load(quiet = false) {
    try {
      const items = await request<AudienceSession[]>(
        "/api/v1/audience/admin/sessions",
      );
      setSessions(items);
      setSelectedId((current) =>
        current && items.some((item) => item.id === current)
          ? current
          : items[0]?.id,
      );
    } catch (error) {
      if (!quiet) notify((error as Error).message);
    }
  }
  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 4000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!selected) {
      setQr("");
      return;
    }
    QRCode.toDataURL(responseUrl(selected.code), {
      width: 360,
      margin: 1,
      color: { dark: "#152723", light: "#ffffff" },
    }).then(setQr);
  }, [selected?.code]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const payload = {
        ...editing,
        questions: editing.questions.map((question) => ({
          id: question.id || null,
          type: question.type,
          prompt: question.prompt,
          options: question.type === "text" ? [] : question.options,
          required: question.required,
          maxSelections:
            question.type === "single" ? 1 : question.maxSelections,
          moderateResponses:
            question.type === "text" && question.moderateResponses,
        })),
      };
      const saved = await request<AudienceSession>(
        editing.id
          ? `/api/v1/audience/admin/sessions/${editing.id}`
          : "/api/v1/audience/admin/sessions",
        {
          method: editing.id ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setEditing(undefined);
      setSelectedId(saved.id);
      await load();
      notify(editing.id ? "Audience session saved." : "Audience session created.");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function action(path: string, message: string, method = "POST") {
    setBusy(true);
    try {
      await request(path, { method, body: method === "DELETE" ? undefined : "{}" });
      await load();
      notify(message);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moderate(id: string, status: "approved" | "rejected") {
    await action(
      `/api/v1/audience/admin/responses/${id}/moderation`,
      status === "approved" ? "Response approved." : "Response hidden.",
      "PUT",
    );
  }

  return (
    <section className="audience-admin">
      <header className="page-head">
        <div>
          <span className="eyebrow">LOCAL &amp; PRIVATE</span>
          <h1>Audience interaction</h1>
          <p>
            Collect anonymous polls and written responses through a local QR
            link. Sessions never affect presentation playback.
          </p>
        </div>
        <button className="button primary" onClick={() => setEditing(editable())}>
          New interaction
        </button>
      </header>
      <div className="audience-workspace">
        <aside className="panel audience-session-list">
          <header>
            <strong>Sessions</strong>
            <span>{sessions.length}</span>
          </header>
          {sessions.length === 0 && (
            <div className="empty-state compact">
              <strong>No audience sessions yet</strong>
              <small>Create a poll, open it, and share its QR code.</small>
            </div>
          )}
          {sessions.map((item) => (
            <button
              key={item.id}
              className={item.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(item.id)}
            >
              <span className={`audience-status ${item.status}`} />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.code} · {item.participantCount} participant
                  {item.participantCount === 1 ? "" : "s"}
                </small>
              </span>
              {item.pendingModerationCount > 0 && (
                <b>{item.pendingModerationCount}</b>
              )}
            </button>
          ))}
        </aside>
        <main className="audience-detail">
          {!selected ? (
            <div className="panel empty-state">
              <strong>Create a safe local interaction</strong>
              <p>
                Choice polls can show live totals. Written responses remain
                hidden until an administrator approves them.
              </p>
            </div>
          ) : (
            <>
              <section className="panel audience-share">
                <div>
                  <span className={`status-pill ${selected.status}`}>
                    {selected.status}
                  </span>
                  <h2>{selected.title}</h2>
                  <p>
                    {selected.participantCount} anonymous participant
                    {selected.participantCount === 1 ? "" : "s"} · responses
                    delete {new Date(selected.purgeAt).toLocaleDateString()}
                  </p>
                  <div className="audience-code">{selected.code}</div>
                  <div className="row-actions">
                    <button
                      className="button"
                      onClick={() => navigator.clipboard.writeText(responseUrl(selected.code)).then(() => notify("Response link copied."))}
                    >
                      Copy link
                    </button>
                    <a
                      className="button"
                      href={`/respond/${selected.code}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open response page
                    </a>
                  </div>
                </div>
                {qr && <img src={qr} alt={`QR code for ${selected.code}`} />}
              </section>
              <section className="panel audience-actions">
                <button
                  className="button"
                  onClick={() => setEditing(editable(selected))}
                  disabled={busy}
                >
                  Edit
                </button>
                {selected.status !== "open" ? (
                  <button
                    className="button primary"
                    onClick={() =>
                      action(
                        `/api/v1/audience/admin/sessions/${selected.id}/state/open`,
                        "Audience session opened.",
                      )
                    }
                    disabled={busy}
                  >
                    Open responses
                  </button>
                ) : (
                  <button
                    className="button"
                    onClick={() =>
                      action(
                        `/api/v1/audience/admin/sessions/${selected.id}/state/close`,
                        "Audience session closed.",
                      )
                    }
                    disabled={busy}
                  >
                    Close responses
                  </button>
                )}
                <button
                  className="button"
                  onClick={() =>
                    confirm("Delete every response in this session?") &&
                    action(
                      `/api/v1/audience/admin/sessions/${selected.id}/reset`,
                      "Audience responses reset.",
                    )
                  }
                  disabled={busy || selected.participantCount === 0}
                >
                  Reset responses
                </button>
                <button
                  className="button danger"
                  onClick={() =>
                    confirm("Permanently delete this interaction session?") &&
                    action(
                      `/api/v1/audience/admin/sessions/${selected.id}`,
                      "Audience session deleted.",
                      "DELETE",
                    )
                  }
                  disabled={busy}
                >
                  Delete
                </button>
              </section>
              <AudienceResults session={selected} onModerate={moderate} />
            </>
          )}
        </main>
      </div>
      {editing && (
        <SessionEditor
          value={editing}
          setValue={setEditing}
          onCancel={() => setEditing(undefined)}
          onSubmit={save}
          busy={busy}
        />
      )}
    </section>
  );
}

function AudienceResults({
  session,
  onModerate,
}: {
  session: AudienceSession;
  onModerate: (id: string, status: "approved" | "rejected") => void;
}) {
  return (
    <section className="audience-results">
      {session.questions.map((question, index) => {
        const approved = question.responses.filter(
          (response) => response.moderationStatus === "approved",
        );
        const counts = question.options.map((option) => ({
          option,
          count: approved.filter((response) =>
            response.choices.includes(option),
          ).length,
        }));
        const maximum = Math.max(1, ...counts.map((item) => item.count));
        return (
          <article className="panel audience-question-result" key={question.id || index}>
            <header>
              <span>Question {index + 1}</span>
              <strong>{question.prompt}</strong>
              <small>
                {question.responses.length} response
                {question.responses.length === 1 ? "" : "s"}
              </small>
            </header>
            {question.type !== "text" ? (
              <div className="poll-bars">
                {counts.map((item) => (
                  <div key={item.option}>
                    <span>
                      <strong>{item.option}</strong>
                      <b>{item.count}</b>
                    </span>
                    <i>
                      <b style={{ width: `${(item.count / maximum) * 100}%` }} />
                    </i>
                  </div>
                ))}
              </div>
            ) : (
              <div className="written-responses">
                {question.responses.length === 0 && (
                  <small>No written responses yet.</small>
                )}
                {question.responses.map((response) => (
                  <div className={response.moderationStatus} key={response.id}>
                    <p>{response.text}</p>
                    <span>{response.moderationStatus}</span>
                    <div>
                      {response.moderationStatus !== "approved" && (
                        <button onClick={() => onModerate(response.id, "approved")}>
                          Approve
                        </button>
                      )}
                      {response.moderationStatus !== "rejected" && (
                        <button onClick={() => onModerate(response.id, "rejected")}>
                          Hide
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function SessionEditor({
  value,
  setValue,
  onCancel,
  onSubmit,
  busy,
}: {
  value: EditableSession;
  setValue: (value: EditableSession) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
  busy: boolean;
}) {
  function updateQuestion(index: number, patch: Partial<AudienceQuestion>) {
    setValue({
      ...value,
      questions: value.questions.map((question, current) =>
        current === index ? { ...question, ...patch } : question,
      ),
    });
  }
  return (
    <div className="modal-backdrop">
      <form
        className="modal audience-editor"
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={value.id ? "Edit audience session" : "New audience session"}
      >
        <header className="modal-head">
          <div>
            <span className="eyebrow">AUDIENCE INTERACTION</span>
            <h2>{value.id ? "Edit session" : "New session"}</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </header>
        <div className="audience-editor-body">
          <label className="field">
            Session title
            <input
              value={value.title}
              maxLength={160}
              required
              onChange={(event) =>
                setValue({ ...value, title: event.target.value })
              }
            />
          </label>
          <div className="three-fields">
            <label className="field">
              Response retention
              <select
                value={value.retentionDays}
                onChange={(event) =>
                  setValue({
                    ...value,
                    retentionDays: Number(event.target.value),
                  })
                }
              >
                {[1, 3, 7, 14, 30].map((days) => (
                  <option value={days} key={days}>
                    {days} day{days === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-card">
              <input
                type="checkbox"
                checked={value.showLiveResults}
                onChange={(event) =>
                  setValue({ ...value, showLiveResults: event.target.checked })
                }
              />
              <span>
                <strong>Audience results</strong>
                <small>Show approved live totals after submission.</small>
              </span>
            </label>
            <label className="check-card">
              <input
                type="checkbox"
                checked={value.allowResponseChanges}
                onChange={(event) =>
                  setValue({
                    ...value,
                    allowResponseChanges: event.target.checked,
                  })
                }
              />
              <span>
                <strong>Allow changes</strong>
                <small>Let the same device revise its response.</small>
              </span>
            </label>
          </div>
          <div className="audience-question-editor-list">
            {value.questions.map((question, index) => (
              <fieldset key={question.id || index}>
                <legend>Question {index + 1}</legend>
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() =>
                    setValue({
                      ...value,
                      questions: value.questions.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove
                </button>
                <div className="two-fields">
                  <label className="field">
                    Type
                    <select
                      value={question.type}
                      onChange={(event) =>
                        updateQuestion(index, {
                          type: event.target.value as QuestionType,
                          maxSelections:
                            event.target.value === "single"
                              ? 1
                              : question.maxSelections,
                        })
                      }
                    >
                      <option value="single">Single choice</option>
                      <option value="multiple">Multiple choice</option>
                      <option value="text">Written response</option>
                    </select>
                  </label>
                  <label className="field">
                    Prompt
                    <input
                      value={question.prompt}
                      maxLength={500}
                      required
                      onChange={(event) =>
                        updateQuestion(index, { prompt: event.target.value })
                      }
                    />
                  </label>
                </div>
                {question.type !== "text" && (
                  <label className="field">
                    Choices
                    <textarea
                      rows={4}
                      value={question.options.join("\n")}
                      onChange={(event) =>
                        updateQuestion(index, {
                          options: event.target.value.split("\n"),
                        })
                      }
                    />
                    <small>One choice per line; 2–12 choices.</small>
                  </label>
                )}
                <div className="question-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={question.required}
                      onChange={(event) =>
                        updateQuestion(index, { required: event.target.checked })
                      }
                    />
                    Required
                  </label>
                  {question.type === "multiple" && (
                    <label>
                      Maximum choices
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={question.maxSelections}
                        onChange={(event) =>
                          updateQuestion(index, {
                            maxSelections: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                  {question.type === "text" && (
                    <label>
                      <input
                        type="checkbox"
                        checked={question.moderateResponses}
                        onChange={(event) =>
                          updateQuestion(index, {
                            moderateResponses: event.target.checked,
                          })
                        }
                      />
                      Require approval before audience display
                    </label>
                  )}
                </div>
              </fieldset>
            ))}
          </div>
          <button
            type="button"
            className="button"
            onClick={() =>
              setValue({
                ...value,
                questions: [
                  ...value.questions,
                  { ...blankQuestion(), position: value.questions.length },
                ],
              })
            }
            disabled={value.questions.length >= 20}
          >
            Add question
          </button>
          <div className="privacy-callout">
            <strong>Privacy by design</strong>
            <span>
              LessonCue stores no participant names, IP addresses, or device
              details. An anonymous token prevents duplicate device responses,
              and the whole session is automatically deleted after retention.
            </span>
          </div>
        </div>
        <footer className="modal-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save session"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function AudienceResponseApp() {
  const initialCode = location.pathname.split("/").filter(Boolean)[1] || "";
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [session, setSession] = useState<PublicSession>();
  const [answers, setAnswers] = useState<Record<string, string[] | string>>({});
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const participantToken = useMemo(getParticipantToken, []);

  async function join(value = code) {
    const normalized = value.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (!normalized) return;
    setError("");
    try {
      const data = await request<PublicSession>(
        `/api/v1/audience/join/${encodeURIComponent(normalized)}`,
      );
      setCode(normalized);
      setSession(data);
      if (location.pathname !== `/respond/${normalized}`)
        history.replaceState({}, "", `/respond/${normalized}`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  useEffect(() => {
    if (initialCode) join(initialCode);
  }, []);
  useEffect(() => {
    if (!session || session.status === "draft") return;
    const timer = window.setInterval(() => join(session.code), 5000);
    return () => window.clearInterval(timer);
  }, [session?.code, session?.status]);

  async function submit() {
    if (!session || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        accepted: boolean;
        message: string;
        results?: PublicResults;
      }>(`/api/v1/audience/join/${session.code}/responses`, {
        method: "POST",
        body: JSON.stringify({
          participantToken,
          answers: session.questions.map((question) => ({
            questionId: question.id,
            choices: Array.isArray(answers[question.id || ""])
              ? answers[question.id || ""]
              : [],
            text:
              typeof answers[question.id || ""] === "string"
                ? answers[question.id || ""]
                : "",
          })),
        }),
      });
      setSubmitted(true);
      setSession({ ...session, results: result.results || session.results });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="audience-public">
      <header>
        <img src="/lessoncue-icon.svg" alt="" />
        <div>
          <strong>LessonCue</strong>
          <span>Audience response</span>
        </div>
      </header>
      {!session ? (
        <section className="audience-public-card join-card">
          <span className="eyebrow">LOCAL RESPONSE</span>
          <h1>Join an interaction</h1>
          <p>Enter the six-character code shown by your presenter.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              join();
            }}
          >
            <input
              className="audience-code-input"
              value={code}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              onChange={(event) =>
                setCode(
                  event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase(),
                )
              }
              aria-label="Response code"
            />
            <button className="button primary">Join</button>
          </form>
          {error && <div className="alert error">{error}</div>}
        </section>
      ) : (
        <section className="audience-public-card">
          <span className={`status-pill ${session.status}`}>
            {session.status}
          </span>
          <h1>{session.title}</h1>
          {session.status === "draft" && (
            <div className="audience-waiting">
              <b>Waiting for the presenter</b>
              <span>This interaction has not opened yet.</span>
            </div>
          )}
          {session.status === "closed" && (
            <div className="audience-waiting">
              <b>Responses are closed</b>
              <span>Thank you for participating.</span>
            </div>
          )}
          {session.status === "open" && !submitted && (
            <form
              className="audience-response-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              noValidate
            >
              {session.questions.map((question, index) => (
                <fieldset key={question.id}>
                  <legend>
                    <span>{index + 1}</span>
                    {question.prompt}
                    {question.required && <b>Required</b>}
                  </legend>
                  {question.type === "text" ? (
                    <textarea
                      rows={5}
                      maxLength={1000}
                      required={question.required}
                      value={(answers[question.id || ""] as string) || ""}
                      onChange={(event) =>
                        setAnswers({
                          ...answers,
                          [question.id || ""]: event.target.value,
                        })
                      }
                    />
                  ) : (
                    <div className="audience-choice-list">
                      {question.options.map((option) => {
                        const selected =
                          (answers[question.id || ""] as string[]) || [];
                        return (
                          <label key={option}>
                            <input
                              type={
                                question.type === "single"
                                  ? "radio"
                                  : "checkbox"
                              }
                              name={`question-${question.id}`}
                              value={option}
                              required={
                                question.required &&
                                question.type === "single"
                              }
                              checked={selected.includes(option)}
                              onChange={(event) => {
                                const next =
                                  question.type === "single"
                                    ? [option]
                                    : event.target.checked
                                      ? [...selected, option].slice(
                                          0,
                                          question.maxSelections,
                                        )
                                      : selected.filter(
                                          (item) => item !== option,
                                        );
                                setAnswers({
                                  ...answers,
                                  [question.id || ""]: next,
                                });
                              }}
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              ))}
              {error && <div className="alert error">{error}</div>}
              <button
                type="button"
                className="button primary wide"
                disabled={busy}
                onPointerDown={() => {
                  if (!busy) void submit();
                }}
                onClick={() => void submit()}
              >
                {busy ? "Sending…" : "Send anonymous response"}
              </button>
            </form>
          )}
          {submitted && (
            <div className="audience-thanks">
              <b>✓ Response received</b>
              <span>
                {session.allowResponseChanges
                  ? "You may revise and submit again while this session remains open."
                  : "Your device has completed this interaction."}
              </span>
              {session.allowResponseChanges && session.status === "open" && (
                <button className="button" onClick={() => setSubmitted(false)}>
                  Revise response
                </button>
              )}
            </div>
          )}
          {session.showLiveResults && session.results && (
            <PublicResultsView results={session.results} />
          )}
          <p className="audience-privacy">{session.privacy}</p>
        </section>
      )}
      <footer>Self-hosted on {location.host}</footer>
    </main>
  );
}

function PublicResultsView({ results }: { results: PublicResults }) {
  return (
    <section className="public-results">
      <header>
        <strong>Live results</strong>
        <span>{results.participantCount} participants</span>
      </header>
      {results.questions.map((question) => {
        const total = Math.max(
          1,
          question.counts.reduce((sum, item) => sum + item.count, 0),
        );
        return (
          <article key={question.id}>
            <h2>{question.prompt}</h2>
            {question.type === "text" ? (
              <div className="public-text-results">
                {question.textResponses.map((text, index) => (
                  <blockquote key={`${text}-${index}`}>{text}</blockquote>
                ))}
              </div>
            ) : (
              question.counts.map((item) => (
                <div className="public-result-bar" key={item.option}>
                  <span>
                    <strong>{item.option}</strong>
                    <b>{Math.round((item.count / total) * 100)}%</b>
                  </span>
                  <i>
                    <b style={{ width: `${(item.count / total) * 100}%` }} />
                  </i>
                </div>
              ))
            )}
          </article>
        );
      })}
    </section>
  );
}

function responseUrl(code: string) {
  return `${location.origin}/respond/${code}`;
}

function getParticipantToken() {
  const key = "lessoncue.audience.participant";
  let token = localStorage.getItem(key);
  if (!token) {
    token =
      typeof crypto.randomUUID === "function"
        ? `${crypto.randomUUID()}-${crypto.randomUUID()}`
        : `${Date.now()}-${Math.random()}-${Math.random()}`;
    localStorage.setItem(key, token);
  }
  return token;
}
