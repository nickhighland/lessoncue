import { Media, MediaPreflight, MediaUploadControl, UpdateStatus, UploadSessionStatus } from "./models";
import { errorText } from "./utils";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problem: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401) {
    const problem = (await response
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    if (path === "/api/v1/auth/login" && problem.error) {
      throw new ApiError(String(problem.error), response.status, problem);
    }
    throw new Error("SESSION_EXPIRED");
  }
  if (!response.ok) {
    const problem = (await response
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    const message = String(
      problem.error || problem.title || `Request failed (${response.status})`,
    );
    const detail = String(problem.detail || "");
    const failureId = String(problem.failureId || "");
    const suffix = [
      detail && detail !== message ? detail : "",
      failureId ? `Reference: ${failureId}` : "",
    ].filter(Boolean).join(" ");
    throw new ApiError(
      suffix ? `${message} ${suffix}` : message,
      response.status,
      problem,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function uploadMediaFile(
  file: File,
  options: {
    persistent: boolean;
    lessonId?: string;
    folder?: string;
    tagsCsv?: string;
    onProgress?: (percent: number) => void;
    onControlReady?: (control?: MediaUploadControl) => void;
  },
): Promise<Media> {
  const duration = await detectDuration(file);
  const resumeKey = `lessoncue.upload.${[
    file.name,
    file.size,
    file.lastModified,
    options.persistent,
    options.lessonId || "",
    options.folder || "",
    options.tagsCsv || "",
  ].join("|")}`;
  let status: UploadSessionStatus | undefined;
  try {
    const savedId = localStorage.getItem(resumeKey);
    if (savedId) {
      try {
        const saved = await api<UploadSessionStatus>(
          `/api/v1/uploads/${savedId}`,
        );
        if (
          saved.fileName === file.name &&
          saved.expectedLength === file.size &&
          ["active", "paused", "failed", "completing"].includes(saved.state)
        ) {
          status = saved;
          if (saved.state === "paused" || saved.state === "failed")
            status = await api<UploadSessionStatus>(
              `/api/v1/uploads/${saved.id}/resume`,
              { method: "POST", body: "{}" },
            );
        } else localStorage.removeItem(resumeKey);
      } catch (error) {
        if (error instanceof ApiError && [404, 409, 410].includes(error.status))
          localStorage.removeItem(resumeKey);
        else throw error;
      }
    }
  } catch (error) {
    if (error instanceof DOMException) {
      // Resuming still works for this page even if browser storage is disabled.
    } else throw error;
  }

  if (!status) {
    const created = await api<{
      uploadId: string;
      fileName: string;
      chunkSize: number;
      chunkCount: number;
      expectedLength: number;
      expiresAt: string;
    }>("/api/v1/uploads", {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        totalBytes: file.size,
        contentType: file.type || "application/octet-stream",
        persistent: options.persistent,
        lessonId: options.lessonId || null,
        folder: options.folder || "",
        tagsCsv: options.tagsCsv || "",
        durationMs: duration || null,
      }),
    });
    status = {
      id: created.uploadId,
      fileName: created.fileName,
      chunkSize: created.chunkSize,
      chunkCount: created.chunkCount,
      expectedLength: created.expectedLength,
      receivedBytes: 0,
      state: "active",
      expiresAt: created.expiresAt,
      missingChunks: Array.from(
        { length: created.chunkCount },
        (_, index) => index,
      ),
    };
    try {
      localStorage.setItem(resumeKey, status.id);
    } catch {
      // The server remains resumable even when browser storage is unavailable.
    }
  }

  let paused = false;
  let cancelled = false;
  let releasePause: (() => void) | undefined;
  const waitWhilePaused = async () => {
    if (!paused) return;
    await new Promise<void>((resolve) => {
      releasePause = resolve;
    });
  };
  const control: MediaUploadControl = {
    pause: async () => {
      if (paused || cancelled) return;
      paused = true;
      await api(`/api/v1/uploads/${status!.id}/pause`, {
        method: "POST",
        body: "{}",
      });
    },
    resume: async () => {
      if (!paused || cancelled) return;
      await api(`/api/v1/uploads/${status!.id}/resume`, {
        method: "POST",
        body: "{}",
      });
      paused = false;
      releasePause?.();
      releasePause = undefined;
    },
    cancel: async () => {
      if (cancelled) return;
      cancelled = true;
      paused = false;
      releasePause?.();
      releasePause = undefined;
      await api(`/api/v1/uploads/${status!.id}`, { method: "DELETE" });
      try {
        localStorage.removeItem(resumeKey);
      } catch {
        /* no-op */
      }
    },
  };
  options.onControlReady?.(control);

  try {
    const missing = new Set(status.missingChunks);
    const alreadyReceived = status.chunkCount - missing.size;
    options.onProgress?.(
      Math.round((alreadyReceived / status.chunkCount) * 100),
    );
    for (let index = 0; index < status.chunkCount; index++) {
      if (!missing.has(index)) continue;
      await waitWhilePaused();
      if (cancelled) throw new Error("Upload cancelled.");
      const chunk = file.slice(
        index * status.chunkSize,
        Math.min(file.size, (index + 1) * status.chunkSize),
      );
      let lastError: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await api(`/api/v1/uploads/${status.id}/chunks/${index}`, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: chunk,
          });
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (
            error instanceof ApiError &&
            error.status < 500 &&
            error.status !== 429
          )
            break;
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * 2 ** attempt),
          );
          await waitWhilePaused();
        }
      }
      if (lastError) throw lastError;
      missing.delete(index);
      options.onProgress?.(
        Math.round(
          ((status.chunkCount - missing.size) / status.chunkCount) * 100,
        ),
      );
    }
    const result = await api<Media | { duplicate: true; media: Media }>(
      `/api/v1/uploads/${status.id}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ durationMs: duration || null }),
      },
    );
    try {
      localStorage.removeItem(resumeKey);
    } catch {
      /* no-op */
    }
    options.onProgress?.(100);
    return "media" in result ? result.media : result;
  } catch (error) {
    if (!cancelled) {
      const message = errorText(error);
      throw new Error(
        `${message} LessonCue kept the received chunks for 24 hours; choose Upload again with the same file to resume.`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    options.onControlReady?.(undefined);
  }
}

export function preflightMediaFile(
  file: File,
  options: { persistent: boolean; lessonId?: string },
) {
  return api<MediaPreflight>("/api/v1/media/preflight", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      totalBytes: file.size,
      contentType: file.type || "application/octet-stream",
      persistent: options.persistent,
      lessonId: options.lessonId || null,
    }),
  });
}
export async function waitForVersion(version?: string) {
  await new Promise((resolve) => setTimeout(resolve, 4000));
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const status = await api<UpdateStatus>("/api/v1/updates");
      if (!version || status.currentVersion === version) return;
    } catch {
      /* The server is restarting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    "The update is taking longer than expected. Refresh this page in a minute.",
  );
}
export function detectDuration(file: File): Promise<number | undefined> {
  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/"))
    return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const element = document.createElement(
      file.type.startsWith("video/") ? "video" : "audio",
    );
    const url = URL.createObjectURL(file);
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const result = Number.isFinite(element.duration)
        ? Math.round(element.duration * 1000)
        : undefined;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    element.src = url;
  });
}
