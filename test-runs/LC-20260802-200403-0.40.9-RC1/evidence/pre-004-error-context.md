# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: local-workflow.spec.ts >> fresh local server supports setup, direct lesson upload, retention, and online media
- Location: tests/browser/local-workflow.spec.ts:58:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.media-table').filter({ hasText: 'browser-test-audio.wav' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.media-table').filter({ hasText: 'browser-test-audio.wav' })

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- complementary:
  - strong: LessonCue
  - text: LessonCue Browser Test ↥
  - strong: 51.0 GB
  - text: upload space free
  - navigation:
    - text: Teaching
    - button "⌂ Dashboard"
    - button "⌁ Controller"
    - button "▤ Classes"
    - button "↻ Templates"
    - button "◉ Audience"
    - button "□ Calendar"
    - text: Media & Devices
    - button "▶ Media Library"
    - button "▣ Screens"
    - text: Administration
    - button "♙ Users"
    - button "⚙ Settings"
  - strong: Server online
  - text: 127.0.0.1:5117
  - button "Test Administrator Updated Service Admin · Manage account"
- main:
  - text: LOCAL STORAGE
  - heading "Media library" [level=1]
  - paragraph: Files stay on this server. Lesson media expires automatically; reusable media can be kept permanently.
  - button "Add link"
  - button "Upload media"
  - region "LessonCue storage":
    - text: Available for uploads
    - strong: 51.0 GB
    - progressbar "LessonCue storage used"
    - text: 1.5 MB used of 51.0 GB allocated
  - text: Search media
  - searchbox "Search media"
  - text: Folder
  - combobox "Folder":
    - option "All folders" [selected]
    - option "General"
    - option "Lessons"
    - option "Signage"
  - text: 5 of 5 items
  - button "Grid view": ⊞
  - button "List view": ☰
  - region "Media previews":
    - button "♫ browser-test-audio.wav General":
      - text: ♫
      - strong: browser-test-audio.wav
      - text: General
    - button "needs-tv-conversion.mp4 Preview":
      - strong: needs-tv-conversion.mp4
      - text: Preview
    - button "♫ bulk-cue-two.wav Preview":
      - text: ♫
      - strong: bulk-cue-two.wav
      - text: Preview
    - button "↗ Online Learning Page Preview":
      - text: ↗
      - strong: Online Learning Page
      - text: Preview
    - button "♫ bulk-cue-one.wav Preview":
      - text: ♫
      - strong: bulk-cue-one.wav
      - text: Preview
```

# Test source

```ts
  168 |   await page.getByRole("button", { name: /Sample Lesson/ }).first().click();
  169 |   const videoCue = page.locator(".playlist-item").filter({ hasText: "Browser Compatibility Video" });
  170 |   await page.getByRole("button", { name: "Advanced", exact: true }).click();
  171 |   await videoCue.getByLabel("Picture fit").selectOption("fill");
  172 |   await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  173 |   await videoCue.getByLabel("Rotate").selectOption("90");
  174 |   await videoCue.getByLabel("Playback speed").fill("125");
  175 |   await videoCue.getByLabel("Playback speed").press("Tab");
  176 |   await videoCue.getByLabel("Play count before ending").fill("2");
  177 |   await videoCue.getByLabel("Play count before ending").press("Tab");
  178 |   await videoCue.getByLabel("Transition").selectOption("fade-black");
  179 |   await videoCue.getByRole("button", { name: "▥ Visually trim both ends & edit fades" }).click();
  180 |   await expect(page.getByRole("heading", { name: "Visual timeline & fades: Browser Compatibility Video" })).toBeVisible();
  181 |   await expect(page.locator(".trim-handle.trim-start")).toBeVisible();
  182 |   await expect(page.locator(".trim-handle.trim-end")).toBeVisible();
  183 |   await expect(page.locator(".fade-handle.fade-start")).toBeVisible();
  184 |   const timelineBounds = await page.locator(".timeline-art").boundingBox();
  185 |   const outHandleBounds = await page.locator(".trim-handle.trim-end").boundingBox();
  186 |   if (!timelineBounds || !outHandleBounds) throw new Error("Visual timeline handles are unavailable.");
  187 |   await page.locator(".trim-handle.trim-end").hover({ position: { x: 3, y: outHandleBounds.height / 2 } });
  188 |   await page.mouse.down();
  189 |   await page.mouse.move(timelineBounds.x + timelineBounds.width * .85, timelineBounds.y + timelineBounds.height / 2);
  190 |   await page.mouse.up();
  191 |   await expect(page.locator(".timeline-preview-label")).toContainText("Previewing trim out");
  192 |   await page.getByLabel("Fade in · 0.0s").fill("0.4");
  193 |   await page.getByLabel("Fade out · 0.0s").fill("0.4");
  194 |   const visualFade = page.locator(".timeline-player .visual-fade-overlay");
  195 |   await expect(visualFade).toBeAttached();
  196 |   await page.locator(".timeline-player video").evaluate((video: HTMLVideoElement) => { video.currentTime = 0; video.dispatchEvent(new Event("timeupdate")); });
  197 |   await expect.poll(() => visualFade.evaluate(element => Number((element as HTMLElement).style.opacity))).toBeGreaterThan(.95);
  198 |   await page.locator(".timeline-player video").evaluate((video: HTMLVideoElement) => { video.currentTime = .2; video.dispatchEvent(new Event("timeupdate")); });
  199 |   await expect.poll(() => visualFade.evaluate(element => Number((element as HTMLElement).style.opacity))).toBeGreaterThan(.35);
  200 |   await expect.poll(() => visualFade.evaluate(element => Number((element as HTMLElement).style.opacity))).toBeLessThan(.65);
  201 |   await page.getByRole("button", { name: "Save timeline and markers" }).click();
  202 |   await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  203 |   await page.getByRole("button", { name: "Close dialog" }).click();
  204 |   await expect.poll(() => page.evaluate(async () => {
  205 |     const lessons = await fetch("/api/v1/lessons").then(response => response.json());
  206 |     const cue = lessons.flatMap((lesson: { items: unknown[] }) => lesson.items)
  207 |       .find((item: { title?: string }) => item.title === "Browser Compatibility Video") as {
  208 |         fitMode?: string; rotationDegrees?: number; playbackRatePercent?: number; repeatCount?: number; transitionStyle?: string
  209 |       } | undefined;
  210 |     return cue ? `${cue.fitMode}:${cue.rotationDegrees}:${cue.playbackRatePercent}:${cue.repeatCount}:${cue.transitionStyle}` : "missing";
  211 |   })).toBe("fill:90:125:2:fade-black");
  212 | 
  213 |   const runCue = page.locator(".playlist-item").filter({ hasText: "Browser Compatibility Video" });
  214 |   await runCue.getByLabel("Flexible timing").evaluate((input: HTMLInputElement) => input.click());
  215 |   await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  216 |   await runCue.getByLabel("Teacher / volunteer notes").fill("Pause for questions before continuing.");
  217 |   await runCue.getByLabel("Teacher / volunteer notes").press("Tab");
  218 |   await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  219 |   await page.getByLabel("Substitute or teacher instructions").fill("Check the room display before participants arrive.");
  220 |   await page.getByLabel("Optional pre-roll livestream monitor").fill("https://example.org/private-monitor");
  221 |   await page.getByRole("button", { name: "Save lesson settings" }).click();
  222 |   await expect(page.getByText("Lesson schedule saved.", { exact: false })).toBeVisible();
  223 |   await page.getByRole("button", { name: "Print run sheet" }).click();
  224 |   const runSheet = page.getByRole("dialog", { name: "Run sheet: Sample Lesson" });
  225 |   await expect(runSheet.getByText("Check the room display before participants arrive.")).toBeVisible();
  226 |   await expect(runSheet.getByText("Pause for questions before continuing.")).toBeVisible();
  227 |   await expect(runSheet.getByText(/FLEXIBLE/)).toBeVisible();
  228 |   await runSheet.getByRole("button", { name: "Close", exact: true }).click();
  229 |   await page.getByRole("button", { name: "Copy or move" }).click();
  230 |   const relocateDialog = page.getByRole("dialog", { name: "Copy or move lesson" });
  231 |   await relocateDialog.getByLabel("Lesson title").fill("Sample Lesson run-of-show copy");
  232 |   await relocateDialog.getByRole("button", { name: "Create copy" }).click();
  233 |   await expect(page.getByText("Lesson copied with its complete run of show.", { exact: false })).toBeVisible();
  234 |   await expect.poll(() => page.evaluate(async () => {
  235 |     const lessons = await fetch("/api/v1/lessons").then(response => response.json());
  236 |     const copy = lessons.find((item: { title: string }) => item.title === "Sample Lesson run-of-show copy");
  237 |     const cue = copy?.items.find((item: { title: string }) => item.title === "Browser Compatibility Video");
  238 |     return copy ? `${copy.substituteNotes}:${copy.preRollMonitorUrl}:${cue?.flexibleTime}:${cue?.notes}` : "missing";
  239 |   })).toBe("Check the room display before participants arrive.:https://example.org/private-monitor:true:Pause for questions before continuing.");
  240 |   await page.evaluate(async () => {
  241 |     const lessons = await fetch("/api/v1/lessons").then(response => response.json());
  242 |     const copy = lessons.find((item: { title: string }) => item.title === "Sample Lesson run-of-show copy");
  243 |     await fetch(`/api/v1/lessons/${copy.id}`, { method: "DELETE" });
  244 |   });
  245 | 
  246 |   await page.getByRole("button", { name: "Add media" }).click();
  247 |   await page.getByRole("button", { name: "Add online media or slides" }).click();
  248 |   const onlineForm = page.locator("form").filter({ has: page.getByLabel("Webpage or YouTube URL") });
  249 |   await onlineForm.getByLabel("Webpage or YouTube URL").fill("https://example.org/learning");
  250 |   await onlineForm.getByLabel("Display title").fill("Online Learning Page");
  251 |   await onlineForm.getByRole("button", { name: "Add online media" }).click();
  252 |   await expect(page.getByText("Online media added to the lesson.", { exact: false })).toBeVisible();
  253 |   await expect(page.getByText("Online Learning Page", { exact: true })).toBeVisible();
  254 | 
  255 |   await page.getByRole("button", { name: /Calendar$/ }).click();
  256 |   await page.getByRole("button", { name: "Day", exact: true }).click();
  257 |   await expect(page.locator(".calendar-period")).toBeVisible();
  258 |   await page.getByRole("button", { name: "Week", exact: true }).click();
  259 |   await expect(page.locator(".calendar-week")).toBeVisible();
  260 |   await page.getByRole("button", { name: "Month", exact: true }).click();
  261 |   await expect(page.locator(".calendar-month")).toBeVisible();
  262 |   await page.getByRole("button", { name: "Room", exact: true }).click();
  263 |   await expect(page.locator(".calendar-rooms")).toContainText("Learning Lab");
  264 |   await page.getByRole("button", { name: "Agenda", exact: true }).click();
  265 | 
  266 |   await page.getByRole("button", { name: /Media Library$/ }).click();
  267 |   const audioRow = page.locator(".media-table").filter({ hasText: "browser-test-audio.wav" });
> 268 |   await expect(audioRow).toBeVisible();
      |                          ^ Error: expect(locator).toBeVisible() failed
  269 |   await expect(audioRow.getByRole("button", { name: /Deletes/ })).toBeVisible();
  270 |   await expect(page.locator(".media-table").filter({ hasText: "Online Learning Page" })).toBeVisible();
  271 | 
  272 |   await page.getByRole("button", { name: /Settings$/ }).click();
  273 |   await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  274 |   await page.getByRole("button", { name: /Organization & accounts/ }).click();
  275 |   await expect(page.getByRole("heading", { name: "Registration & email" })).toBeVisible();
  276 |   const mfaPanel = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "Authenticator MFA" }) });
  277 |   await expect(mfaPanel).toHaveCount(1);
  278 |   await expect(mfaPanel).toBeVisible();
  279 |   await page.getByLabel("Enable Signage").check();
  280 |   await expect.poll(() => page.evaluate(async () =>
  281 |     (await fetch("/api/v1/admin/bootstrap").then(response => response.json())).settings.signageEnabled
  282 |   )).toBe(true);
  283 |   expect(await page.evaluate(async () => (await fetch("/api/v1/auth/register", {
  284 |     method: "POST", headers: { "Content-Type": "application/json" },
  285 |     body: JSON.stringify({ username: "closed-user", displayName: "Closed User", email: "closed@example.org", password: "ClosedAccount42", code: "even-with-a-code" })
  286 |   })).status)).toBe(403);
  287 |   await page.getByLabel("Label", { exact: true }).fill("Browser test registrations");
  288 |   await page.getByLabel("Maximum uses (optional)").fill("2");
  289 |   await page.getByRole("button", { name: "Create code" }).click();
  290 |   await expect(page.getByText("Copy this code now")).toBeVisible();
  291 |   const registrationCode = await page.locator(".secret-reveal code").textContent();
  292 |   expect(registrationCode).toMatch(/^[a-f0-9]{16}$/);
  293 |   const registrationRow = page.locator(".registration-code-list > div").filter({ hasText: "Browser test registrations" });
  294 |   await registrationRow.getByRole("button", { name: "Edit" }).click();
  295 |   const codeDialog = page.getByRole("dialog", { name: "Edit Browser test registrations" });
  296 |   await codeDialog.getByLabel("Maximum uses (leave blank for unlimited)").fill("3");
  297 |   await codeDialog.getByRole("button", { name: "Save limits" }).click();
  298 |   await expect(registrationRow).toContainText("0 of 3 uses");
  299 |   await registrationRow.getByRole("button", { name: "Revoke" }).click();
  300 |   await acceptActionDialog(page);
  301 |   await expect(registrationRow).toContainText("Inactive");
  302 |   await expect(page.getByRole("button", { name: "Save provider first" })).toBeDisabled();
  303 |   await page.getByLabel("Registration mode").selectOption("approval");
  304 |   await page.getByLabel("Account email provider").selectOption("resend");
  305 |   await page.getByLabel("Email API key").fill("browser-layout-placeholder-key");
  306 |   await page.getByLabel("Sender name").fill("LessonCue Browser Test");
  307 |   await page.getByLabel("Verified sender address").fill("accounts@example.org");
  308 |   await page.getByLabel("Public account-link address").fill(new URL(page.url()).origin);
  309 |   await page.getByRole("button", { name: "Save account settings" }).click();
  310 |   await expect(page.getByText("Registration and account email settings saved.", { exact: false })).toBeVisible();
  311 |   await page.getByRole("button", { name: /Media & storage/ }).click();
  312 |   await expect(mfaPanel).toBeHidden();
  313 |   await page.getByLabel("Approved folder paths").fill("General\nLessons\nSignage\nAudio/Classroom");
  314 |   await page.getByLabel("Approved tags").fill("Reusable\nIntro\nOutro\nReference\nWelcome");
  315 |   await page.getByRole("button", { name: "Save approved folders & tags" }).click();
  316 |   await expect(page.getByText("Approved media folders and tags saved.", { exact: false })).toBeVisible();
  317 |   expect(await page.evaluate(async () => (await fetch("/api/v1/media/link", {
  318 |     method: "POST", headers: { "Content-Type": "application/json" },
  319 |     body: JSON.stringify({ url: "https://example.org/rejected", title: "Rejected", folder: "Unapproved", tagsCsv: "Reusable" })
  320 |   })).status)).toBe(400);
  321 |   await page.getByRole("button", { name: /Media Library$/ }).click();
  322 | 
  323 |   await audioRow.getByRole("button", { name: "Manage versions & impact" }).click();
  324 |   await expect(page.getByRole("heading", { name: "Manage: browser-test-audio.wav" })).toBeVisible();
  325 |   await expect(page.getByText("Sample Lesson", { exact: false })).toBeVisible();
  326 |   await page.getByRole("button", { name: "Rename, folder & tags" }).click();
  327 |   const organizeDialog = page.getByRole("dialog", { name: "Organize: browser-test-audio.wav" });
  328 |   await organizeDialog.getByLabel("Folder").selectOption("Audio/Classroom");
  329 |   await organizeDialog.getByLabel("Welcome", { exact: true }).check();
  330 |   await organizeDialog.getByLabel("Reusable", { exact: true }).check();
  331 |   await organizeDialog.getByRole("button", { name: "Save organization" }).click();
  332 |   await expect(page.getByText("1 media item organized.", { exact: false })).toBeVisible();
  333 |   await expect(page.locator(".media-table").filter({ hasText: "Audio/Classroom" })).toBeVisible();
  334 |   await expect.poll(async () => page.evaluate(async () => {
  335 |     const items = await fetch("/api/v1/media").then(response => response.json());
  336 |     return items.find((item: { fileName: string }) => item.fileName === "browser-test-audio.wav")?.processingStatus;
  337 |   }), { timeout: 30_000 }).toBe("ready");
  338 | 
  339 |   await page.getByLabel("Select bulk-cue-one.wav").check();
  340 |   await page.getByLabel("Select bulk-cue-two.wav").check();
  341 |   await page.getByRole("button", { name: "Rename", exact: true }).click();
  342 |   const bulkRenameDialog = page.getByRole("dialog", { name: "Rename 2 selected media items" });
  343 |   await bulkRenameDialog.getByLabel("New name for bulk-cue-one.wav").fill("Term A — bulk-cue-one.wav");
  344 |   await bulkRenameDialog.getByLabel("New name for bulk-cue-two.wav").fill("Term A — bulk-cue-two.wav");
  345 |   await bulkRenameDialog.getByRole("button", { name: "Rename selected media" }).click();
  346 |   await expect(page.getByText("2 media items renamed.", { exact: false })).toBeVisible();
  347 |   await expect(page.locator(".media-table").filter({ hasText: "Term A — bulk-cue-one.wav" })).toBeVisible();
  348 |   await expect(page.locator(".media-table").filter({ hasText: "Term A — bulk-cue-two.wav" })).toBeVisible();
  349 |   await page.getByLabel("Select Term A — bulk-cue-one.wav").check();
  350 |   await page.getByRole("button", { name: "Rename", exact: true }).click();
  351 |   const conflictRenameDialog = page.getByRole("dialog", { name: "Rename 1 selected media item" });
  352 |   await conflictRenameDialog.getByLabel("New name").fill("Term A — bulk-cue-two.wav");
  353 |   await conflictRenameDialog.getByRole("button", { name: "Rename selected media" }).click();
  354 |   await expect(page.getByText(/already exists/, { exact: false })).toBeVisible();
  355 |   await conflictRenameDialog.getByLabel("New name").fill("Term A — bulk-cue-one.wav");
  356 |   await conflictRenameDialog.getByRole("button", { name: "Rename selected media" }).click();
  357 |   await expect(page.getByText("1 media item renamed.", { exact: false })).toBeVisible();
  358 | 
  359 |   const organizedRow = page.locator(".media-table").filter({ hasText: "browser-test-audio.wav" });
  360 |   await organizedRow.getByRole("button", { name: "Manage versions & impact" }).click();
  361 |   await page.getByLabel("Replace current file").setInputFiles({ name: "browser-test-audio-v2.wav", mimeType: "audio/wav", buffer: silentWav(1) });
  362 |   await page.getByRole("button", { name: "Preview impact and replace" }).click();
  363 |   await acceptActionDialog(page);
  364 |   await expect(page.getByText("previous version remains available", { exact: false })).toBeVisible();
  365 |   const replacedRow = page.locator(".media-table").filter({ hasText: "browser-test-audio-v2.wav" });
  366 |   await expect(replacedRow).toContainText("v2");
  367 |   await replacedRow.getByRole("button", { name: "Manage versions & impact" }).click();
  368 |   await expect(page.getByText("v1 · browser-test-audio.wav", { exact: false })).toBeVisible();
```