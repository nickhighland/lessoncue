# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: zz-accessibility.spec.ts >> confirmation dialogs trap focus, close with Escape, and restore focus
- Location: tests/browser/zz-accessibility.spec.ts:75:1

# Error details

```
Error: confirmation dialog accessibility violations:
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
+                   ".sidebar",
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
+                   ".sidebar",
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
+                   ".sidebar",
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
          - button [ref=e18] [cursor=pointer]:
            - generic [ref=e19]: ⌂
            - generic [ref=e20]: Dashboard
          - button [ref=e21] [cursor=pointer]:
            - generic [ref=e22]: ⌁
            - generic [ref=e23]: Controller
          - button [ref=e24] [cursor=pointer]:
            - generic [ref=e25]: ▤
            - generic [ref=e26]: Classes
          - button [ref=e27] [cursor=pointer]:
            - generic [ref=e28]: ↻
            - generic [ref=e29]: Templates
          - button [ref=e30] [cursor=pointer]:
            - generic [ref=e31]: ◉
            - generic [ref=e32]: Audience
          - button [ref=e33] [cursor=pointer]:
            - generic [ref=e34]: □
            - generic [ref=e35]: Calendar
        - generic [ref=e36]:
          - generic [ref=e37]: Media & Devices
          - button [ref=e38] [cursor=pointer]:
            - generic [ref=e39]: ▶
            - generic [ref=e40]: Media Library
          - button [ref=e41] [cursor=pointer]:
            - generic [ref=e42]: ▣
            - generic [ref=e43]: Screens
        - generic [ref=e44]:
          - generic [ref=e45]: Administration
          - button [ref=e46] [cursor=pointer]:
            - generic [ref=e47]: ♙
            - generic [ref=e48]: Users
          - button [ref=e49] [cursor=pointer]:
            - generic [ref=e50]: ⚙
            - generic [ref=e51]: Settings
      - generic [ref=e52]:
        - generic [ref=e55]:
          - strong [ref=e56]: Server online
          - generic [ref=e57]: 127.0.0.1:5117
        - button [ref=e58] [cursor=pointer]:
          - text: Test Administrator Updated
          - generic [ref=e59]: Service Admin · Manage account
    - main [ref=e60]:
      - generic [ref=e61]:
        - generic [ref=e62]:
          - text: PROGRAMMING
          - heading [level=1] [ref=e63]: Classes & lessons
          - paragraph [ref=e64]: Schedule lessons and compose exactly what your screens will play.
        - button [ref=e65] [cursor=pointer]: New class
      - generic [ref=e66]:
        - complementary [ref=e67]:
          - heading [level=3] [ref=e68]: Your classes
          - button [ref=e69] [cursor=pointer]:
            - generic [ref=e70]: L
            - generic [ref=e71]:
              - strong [ref=e72]: Learning Lab
              - generic [ref=e73]: 1 lessons · 0 screens
        - generic [ref=e74]:
          - generic [ref=e75]:
            - generic [ref=e76]:
              - text: CLASS
              - heading [level=2] [ref=e77]: Learning Lab
              - paragraph [ref=e78]: A ready-to-use example class for any learning environment.
            - generic [ref=e79]:
              - button [ref=e80] [cursor=pointer]: Edit class
              - button [ref=e81] [cursor=pointer]: Controller link
          - dialog [ref=e83]:
            - generic [ref=e84]:
              - heading [level=2] [ref=e85]: Edit Learning Lab
              - button [ref=e86] [cursor=pointer]: ×
            - generic [ref=e87]:
              - generic [ref=e88]:
                - generic [ref=e89]: Class name
                - textbox [ref=e90]: Learning Lab
              - generic [ref=e91]:
                - generic [ref=e92]: Description
                - textbox [ref=e93]: A ready-to-use example class for any learning environment.
              - generic [ref=e94]:
                - generic [ref=e95]: Theme color
                - generic [ref=e96]:
                  - textbox [ref=e97] [cursor=pointer]: "#2d6a4f"
                  - status [ref=e98]: "#2D6A4F"
              - button [ref=e99] [cursor=pointer]: Save class
              - button [ref=e100] [cursor=pointer]: Move class to recycling bin
          - generic [ref=e101]:
            - textbox [ref=e102]:
              - /placeholder: New lesson title
            - generic [ref=e103]: Lesson date
            - textbox [ref=e104]: 2026-08-03
            - button [ref=e105] [cursor=pointer]: Create lesson
          - generic [ref=e106]:
            - generic [ref=e107]:
              - generic [ref=e108]:
                - checkbox [ref=e109]
                - text: Select all lessons
              - generic [ref=e110]: 0 archived
            - article [ref=e111]:
              - checkbox [ref=e113]
              - button [ref=e114] [cursor=pointer]:
                - generic [ref=e115]:
                  - generic [ref=e116]: Aug
                  - strong [ref=e117]: "10"
                - generic [ref=e118]:
                  - strong [ref=e119]: Sample Lesson
                  - generic [ref=e120]: 8 items · Version 16
                - generic [ref=e121]:
                  - generic [ref=e122]: Pre-roll ×1
                  - generic [ref=e123]: Countdown
                - generic [ref=e124]: ›
  - alertdialog "Confirm deletion" [ref=e126]:
    - generic [ref=e127]:
      - generic [ref=e128]:
        - heading "Confirm deletion" [level=2] [ref=e129]
        - button "Cancel and close dialog" [ref=e130] [cursor=pointer]: ×
      - paragraph [ref=e131]: Move Learning Lab and all of its lessons to the recycling bin? They can be restored for 30 days.
      - generic [ref=e132]:
        - button "Cancel" [ref=e133] [cursor=pointer]
        - button "Move to recycling bin" [active] [ref=e134] [cursor=pointer]
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
     |     ^ Error: confirmation dialog accessibility violations:
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