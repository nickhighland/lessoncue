# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: zz-accessibility.spec.ts >> primary administration paths meet the automated WCAG 2.2 AA baseline
- Location: tests/browser/zz-accessibility.spec.ts:54:1

# Error details

```
Error: dashboard accessibility violations:
color-contrast: Elements must meet minimum color contrast ratio thresholds
  .nav-section:nth-child(1) > .nav-section-label — Fix any of the following:
  Element has insufficient color contrast of 2.85 (foreground color: #5e7870, background color: #25302d, font size: 6.8pt (9px), font weight: bold). Expected contrast ratio of 4.5:1
  .nav-section:nth-child(2) > .nav-section-label — Fix any of the following:
  Element has insufficient color contrast of 2.85 (foreground color: #5e7870, background color: #25302d, font size: 6.8pt (9px), font weight: bold). Expected contrast ratio of 4.5:1
  .nav-section:nth-child(3) > .nav-section-label — Fix any of the following:
  Element has insufficient color contrast of 2.85 (foreground color: #5e7870, background color: #25302d, font size: 6.8pt (9px), font weight: bold). Expected contrast ratio of 4.5:1

expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 128

- Array []
+ Array [
+   Object {
+     "description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
+     "help": "Elements must meet minimum color contrast ratio thresholds",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/color-contrast?application=playwright",
+     "id": "color-contrast",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#25302d",
+               "contrastRatio": 2.85,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#5e7870",
+               "fontSize": "6.8pt (9px)",
+               "fontWeight": "bold",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 2.85 (foreground color: #5e7870, background color: #25302d, font size: 6.8pt (9px), font weight: bold). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"sidebar\">",
+                 "target": Array [
+                   "aside",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 2.85 (foreground color: #5e7870, background color: #25302d, font size: 6.8pt (9px), font weight: bold). Expected contrast ratio of 4.5:1",
+         "html": "<div class=\"nav-section-label\">Teaching</div>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           ".nav-section:nth-child(1) > .nav-section-label",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#25302d",
+               "contrastRatio": 2.85,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#5e7870",
+               "fontSize": "6.8pt (9px)",
+               "fontWeight": "bold",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 2.85 (foreground color: #5e7870, background color: #25302d, font size: 6.8pt (9px), font weight: bold). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"sidebar\">",
+                 "target": Array [
+                   "aside",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 2.85 (foreground color: #5e7870, background color: #25302d, font size: 6.8pt (9px), font weight: bold). Expected contrast ratio of 4.5:1",
+         "html": "<div class=\"nav-section-label\">Media &amp; Devices</div>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           ".nav-section:nth-child(2) > .nav-section-label",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#25302d",
+               "contrastRatio": 2.85,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#5e7870",
+               "fontSize": "6.8pt (9px)",
+               "fontWeight": "bold",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 2.85 (foreground color: #5e7870, background color: #25302d, font size: 6.8pt (9px), font weight: bold). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"sidebar\">",
+                 "target": Array [
+                   "aside",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 2.85 (foreground color: #5e7870, background color: #25302d, font size: 6.8pt (9px), font weight: bold). Expected contrast ratio of 4.5:1",
+         "html": "<div class=\"nav-section-label\">Administration</div>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           ".nav-section:nth-child(3) > .nav-section-label",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.color",
+       "wcag2aa",
+       "wcag143",
+       "TTv5",
+       "TT13.c",
+       "EN-301-549",
+       "EN-9.1.4.3",
+       "ACT",
+       "RGAAv4",
+       "RGAA-3.2.1",
+     ],
+   },
+ ]
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "Skip to main content" [ref=e3] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - generic [ref=e8]:
        - strong [ref=e9]: LessonCue
        - generic [ref=e10]: LessonCue Browser Test
      - generic [ref=e11]:
        - generic [ref=e12]: ↥
        - generic [ref=e13]:
          - strong [ref=e14]: 50.2 GB
          - text: upload space free
      - navigation [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Teaching
          - button "⌂ Dashboard" [ref=e18] [cursor=pointer]:
            - generic [ref=e19]: ⌂
            - generic [ref=e20]: Dashboard
          - button "⌁ Controller" [ref=e21] [cursor=pointer]:
            - generic [ref=e22]: ⌁
            - generic [ref=e23]: Controller
          - button "▤ Classes" [ref=e24] [cursor=pointer]:
            - generic [ref=e25]: ▤
            - generic [ref=e26]: Classes
          - button "↻ Templates" [ref=e27] [cursor=pointer]:
            - generic [ref=e28]: ↻
            - generic [ref=e29]: Templates
          - button "◉ Audience" [ref=e30] [cursor=pointer]:
            - generic [ref=e31]: ◉
            - generic [ref=e32]: Audience
          - button "□ Calendar" [ref=e33] [cursor=pointer]:
            - generic [ref=e34]: □
            - generic [ref=e35]: Calendar
        - generic [ref=e36]:
          - generic [ref=e37]: Media & Devices
          - button "▶ Media Library" [ref=e38] [cursor=pointer]:
            - generic [ref=e39]: ▶
            - generic [ref=e40]: Media Library
          - button "▣ Screens" [ref=e41] [cursor=pointer]:
            - generic [ref=e42]: ▣
            - generic [ref=e43]: Screens
        - generic [ref=e44]:
          - generic [ref=e45]: Administration
          - button "♙ Users" [ref=e46] [cursor=pointer]:
            - generic [ref=e47]: ♙
            - generic [ref=e48]: Users
          - button "⚙ Settings" [ref=e49] [cursor=pointer]:
            - generic [ref=e50]: ⚙
            - generic [ref=e51]: Settings
      - generic [ref=e52]:
        - generic [ref=e55]:
          - strong [ref=e56]: Server online
          - generic [ref=e57]: 127.0.0.1:5117
        - button "Test Administrator Updated Service Admin · Manage account" [ref=e58] [cursor=pointer]:
          - text: Test Administrator Updated
          - generic [ref=e59]: Service Admin · Manage account
    - main [active] [ref=e60]:
      - generic [ref=e62]:
        - text: OVERVIEW
        - heading "Good evening." [level=1] [ref=e63]
        - paragraph [ref=e64]: LessonCue Browser Test runs entirely on this local server.
      - generic [ref=e65]:
        - button "▤ Classes Plan lessons & playlists" [ref=e66] [cursor=pointer]:
          - generic [ref=e67]: ▤
          - generic [ref=e68]:
            - strong [ref=e69]: Classes
            - generic [ref=e70]: Plan lessons & playlists
        - button "↥ Upload Media Add videos, audio, slides" [ref=e71] [cursor=pointer]:
          - generic [ref=e72]: ↥
          - generic [ref=e73]:
            - strong [ref=e74]: Upload Media
            - generic [ref=e75]: Add videos, audio, slides
        - button "▣ Screens 0 of 0 online" [ref=e76] [cursor=pointer]:
          - generic [ref=e77]: ▣
          - generic [ref=e78]:
            - strong [ref=e79]: Screens
            - generic [ref=e80]: 0 of 0 online
        - button "⌁ Controller Playback & remote control" [ref=e81] [cursor=pointer]:
          - generic [ref=e82]: ⌁
          - generic [ref=e83]:
            - strong [ref=e84]: Controller
            - generic [ref=e85]: Playback & remote control
      - generic [ref=e86]:
        - generic [ref=e87]:
          - text: Classes
          - strong [ref=e88]: "1"
          - text: 1 lessons
        - generic [ref=e89]:
          - text: Media files
          - strong [ref=e90]: "5"
          - text: stored locally
        - generic [ref=e91]:
          - text: Paired screens
          - strong [ref=e92]: "0"
          - text: 0 online now
        - generic [ref=e93]:
          - text: Pairing PIN
          - strong [ref=e94]: "987772"
          - text: enter on a new screen
      - generic [ref=e95]:
        - generic [ref=e96]:
          - generic [ref=e97]:
            - heading "Upcoming lessons" [level=2] [ref=e98]
            - button "View all →" [ref=e99] [cursor=pointer]
          - generic [ref=e101]:
            - generic [ref=e102]:
              - generic [ref=e103]: Aug
              - strong [ref=e104]: "10"
            - generic [ref=e105]:
              - strong [ref=e106]: Sample Lesson
              - generic [ref=e107]: Learning Lab · 8 playlist items
            - generic [ref=e108]:
              - generic [ref=e109]: Pre-roll ×1
              - generic [ref=e110]: Countdown
        - generic [ref=e111]:
          - generic [ref=e112]:
            - heading "Screen health" [level=2] [ref=e113]
            - button "View all →" [ref=e114] [cursor=pointer]
          - generic [ref=e115]:
            - generic [ref=e116]: ◇
            - strong [ref=e117]: No paired screens
            - paragraph [ref=e118]: Open LessonCue TV and enter PIN 987772.
      - generic [ref=e119]:
        - heading "Recent activity" [level=2] [ref=e121]
        - generic [ref=e125]:
          - strong [ref=e126]: Sample Lesson
          - generic [ref=e127]: Learning Lab · Monday, August 10, 2026 · 8 items
```

# Test source

```ts
  1  | import AxeBuilder from "@axe-core/playwright";
  2  | import { expect, Page, test } from "@playwright/test";
  3  | 
  4  | const password = "LessonCueTest42";
  5  | 
  6  | async function scan(page: Page, label: string) {
  7  |   const result = await new AxeBuilder({ page })
  8  |     .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
  9  |     .analyze();
  10 |   expect(
  11 |     result.violations,
  12 |     `${label} accessibility violations:\n${result.violations
  13 |       .map(
  14 |         violation =>
  15 |           `${violation.id}: ${violation.help}\n${violation.nodes
  16 |             .map(node => `  ${node.target.join(" ")} — ${node.failureSummary}`)
  17 |             .join("\n")}`,
  18 |       )
  19 |       .join("\n")}`,
> 20 |   ).toEqual([]);
     |     ^ Error: dashboard accessibility violations:
  21 | }
  22 | 
  23 | async function authenticate(page: Page) {
  24 |   await page.goto("/");
  25 |   const setupHeading = page.getByRole("heading", {
  26 |     name: "Create your Service Admin",
  27 |   });
  28 |   const loginHeading = page.getByRole("heading", {
  29 |     name: "Sign in to LessonCue",
  30 |   });
  31 |   await expect(setupHeading.or(loginHeading)).toBeVisible();
  32 |   if (
  33 |     await setupHeading.isVisible()
  34 |   ) {
  35 |     await scan(page, "first-run setup");
  36 |     await page.getByLabel("Organization name").fill("Accessibility Test");
  37 |     await page.getByLabel("Your name").fill("Accessibility Administrator");
  38 |     await page.getByLabel("Username").fill("browser-admin");
  39 |     await page.getByLabel("Password").fill(password);
  40 |     await page.getByRole("button", { name: "Finish setup" }).click();
  41 |   } else if (
  42 |     await loginHeading.isVisible()
  43 |   ) {
  44 |     await scan(page, "sign-in");
  45 |     await page.getByLabel("Username").fill("browser-admin");
  46 |     await page.getByLabel("Password").fill(password);
  47 |     await page.getByRole("button", { name: "Sign in" }).click();
  48 |   }
  49 |   await expect(
  50 |     page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ }),
  51 |   ).toBeVisible();
  52 | }
  53 | 
  54 | test("primary administration paths meet the automated WCAG 2.2 AA baseline", async ({
  55 |   page,
  56 | }) => {
  57 |   await page.setViewportSize({ width: 1440, height: 1000 });
  58 |   await authenticate(page);
  59 | 
  60 |   await scan(page, "dashboard");
  61 | 
  62 |   await page.getByRole("button", { name: /Classes$/ }).click();
  63 |   await expect(page.getByRole("heading", { name: "Classes & lessons" })).toBeVisible();
  64 |   await scan(page, "classes");
  65 | 
  66 |   await page.getByRole("button", { name: /Media Library$/ }).click();
  67 |   await expect(page.getByRole("heading", { name: "Media library" })).toBeVisible();
  68 |   await scan(page, "media library");
  69 | 
  70 |   await page.getByRole("button", { name: /Settings$/ }).click();
  71 |   await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  72 |   await scan(page, "settings");
  73 | });
  74 | 
  75 | test("confirmation dialogs trap focus, close with Escape, and restore focus", async ({
  76 |   page,
  77 | }) => {
  78 |   await authenticate(page);
  79 |   await page.getByRole("button", { name: /Classes$/ }).click();
  80 |   await page.locator(".class-list button").first().click();
  81 |   await page.getByRole("button", { name: "Edit class" }).click();
  82 |   const deleteButton = page.getByRole("button", {
  83 |     name: "Move class to recycling bin",
  84 |   });
  85 |   await deleteButton.focus();
  86 |   await deleteButton.click();
  87 | 
  88 |   const dialog = page.getByRole("alertdialog");
  89 |   await expect(dialog).toBeVisible();
  90 |   await expect(dialog).toHaveAttribute("aria-modal", "true");
  91 |   await expect(dialog.getByRole("button", { name: "Move to recycling bin" })).toBeFocused();
  92 |   await scan(page, "confirmation dialog");
  93 | 
  94 |   await page.keyboard.press("Escape");
  95 |   await expect(dialog).toBeHidden();
  96 |   await expect(deleteButton).toBeFocused();
  97 | });
  98 | 
```