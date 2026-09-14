import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from './support/adminSession';
import { DRAWING_PRESETS } from '../../web-admin/src/activities/activityPresetRegistry';

test.use({ serviceWorkers: 'block' });

test('the eraser removes the middle of a sparse stroke, not just its recorded endpoints', async ({ page, browser }) => {
  await signInAsAdmin(page, 'Drawing eraser');
  const run = await launch(page, 'Sparse stroke eraser', { maxPointsPerStroke: 2, autoPilot: false });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  try {
    await phone.goto(`/play/${run.state.joinCode}`);
    await phone.getByLabel('Display name').fill('Thea');
    await phone.getByRole('button', { name: 'Join game' }).click();
    await expect(phone.getByText('You’re in.')).toBeVisible();
    await command(page, run.runId, 'start');
    await command(page, run.runId, 'open');
    const canvas = phone.getByLabel('Draw your answer');
    await canvas.scrollIntoViewIfNeeded();
    const rect = (await canvas.boundingBox())!;
    const session = await context.newCDPSession(phone);
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width * .2, y: rect.y + rect.height * .5 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + rect.width * .8, y: rect.y + rect.height * .5 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await session.detach(); }
    await expect(phone.getByRole('button', { name: 'Submit drawing' })).toBeEnabled();
    await phone.getByRole('button', { name: 'Eraser' }).tap();
    await canvas.tap({ position: { x: rect.width * .5, y: rect.height * .5 } });
    await expect(phone.getByRole('button', { name: 'Submit drawing' })).toBeDisabled();
  } finally { await context.close(); }
});

for (const preset of DRAWING_PRESETS) {
  test(`drawing preset ${preset.label} opens and accepts a phone sketch`, async ({ page, browser }) => {
    await signInAsAdmin(page, 'Drawing presets');
    const run = await launch(page, preset.label, { ...preset.config, autoPilot: false });
    const context = await browser.newContext({ viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true });
    const phone = await context.newPage();
    try {
      await phone.goto(`/play/${run.state.joinCode}`);
      await phone.getByLabel('Display name').fill('Kade');
      await phone.getByRole('button', { name: 'Join game' }).click();
      await expect(phone.getByText('You’re in.')).toBeVisible();
      await command(page, run.runId, 'start');
      await command(page, run.runId, 'open');
      await expect(phone.getByLabel('Draw your answer')).toBeVisible();
      expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
      await draw(phone, true);
      await phone.getByRole('button', { name: 'Submit drawing' }).tap();
      await expect(phone.getByRole('button', { name: 'Drawing saved' })).toBeVisible();
      await expect(phone.locator('.participant-error')).toHaveCount(0);
      expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    } finally { await context.close(); }
  });
}
async function launch(page: Page, name: string, config: Record<string, unknown>) {
  const created = await page.request.post('/api/v1/activities', { data: { name, type: 'drawing', config: {
    title: name, introSeconds: 1, responseSeconds: 120, revealSeconds: 2, standingsSeconds: 1,
    prompts: [{ id: 'p1', prompt: 'Draw a penguin', points: 100 }], ...config,
  } } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const definition = await created.json();
  const response = await page.request.post('/api/v1/activity-runs', { data: { activityDefinitionId: definition.id } });
  expect(response.ok()).toBeTruthy();
  return await response.json() as { runId: string; state: { joinCode: string } };
}
async function command(page: Page, runId: string, action: string, payload?: unknown) {
  const result = await page.request.post(`/api/v1/activity-runs/${runId}/command`, { data: { action, payload } });
  expect(result.ok(), await result.text()).toBeTruthy();
}
async function draw(phone: Page, dot = false) {
  const canvas = phone.getByLabel('Draw your answer');
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  const session = await phone.context().newCDPSession(phone);
  const point = (index: number) => ({ x: rect.x + rect.width * (.1 + index / 200), y: rect.y + rect.height * (.5 + Math.sin(index / 8) * .25) });
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0)] });
    if (!dot) for (let index = 1; index <= 150; index++)
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(index)] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
  await expect(phone.getByRole('button', { name: 'Submit drawing' })).toBeEnabled();
}

test('touch drawings submit, moderation protects the gallery, and phones can vote', async ({ page, browser }) => {
  await signInAsAdmin(page, 'Drawing reliability');
  const run = await launch(page, 'Touch gallery', { maxPointsPerStroke: 12, requireModeration: true, votingSeconds: 30 });
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })));
  const phones = await Promise.all(contexts.map(context => context.newPage()));
  try {
    for (let index = 0; index < phones.length; index++) {
      await phones[index].goto(`/play/${run.state.joinCode}`);
      await phones[index].getByLabel('Display name').fill(['Carmen', 'Letty'][index]);
      await phones[index].getByRole('button', { name: 'Join game' }).click();
      await expect(phones[index].getByText('You’re in.')).toBeVisible();
    }
    await command(page, run.runId, 'start');
    await expect(phones[0].getByLabel('Draw your answer')).toBeVisible();
    await draw(phones[0]);
    await phones[0].getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(phones[0].getByRole('button', { name: 'Submit drawing' })).toBeDisabled();
    await draw(phones[0]);
    await phones[0].route('**/participant-action', route => route.abort('failed'), { times: 1 });
    await phones[0].getByRole('button', { name: 'Submit drawing' }).click();
    await expect(phones[0].locator('.participant-error')).toBeVisible();
    await expect(phones[0].getByRole('button', { name: 'Submit drawing' })).toBeEnabled();
    await phones[0].getByRole('button', { name: 'Submit drawing' }).click();
    await expect(phones[0].getByRole('button', { name: 'Drawing saved' })).toBeVisible();
    await draw(phones[1], true);
    await phones[1].getByRole('button', { name: 'Submit drawing' }).click();

    await expect(phones[0].getByText('Locked in.', { exact: true })).toBeVisible();
    const host = await (await page.request.get(`/api/v1/activity-sessions/${run.runId}/host-state`)).json();
    expect(host.submissions).toHaveLength(2);
    expect(host.submissions.find((entry: { participantName: string }) => entry.participantName === 'Carmen').payload.strokes[0].points.length).toBeLessThanOrEqual(12);
    const display = await (await page.request.get(`/api/v1/activity-runs/${run.runId}`)).json();
    expect(display.state.drawings ?? []).toHaveLength(0);
    for (const entry of host.submissions) await command(page, run.runId, 'moderate', { submissionId: entry.id, status: 'approved' });
    for (const phone of phones) {
      await expect(phone.getByRole('heading', { name: 'Vote for a drawing' })).toBeVisible({ timeout: 15000 });
      // The only available option is the other player's work.
      await expect(phone.getByRole('button', { name: /Vote for drawing/ })).toHaveCount(1);
    }
    await expect(phones[0].locator('.drawing-response-grid circle')).toHaveCount(1, { timeout: 10000 });
    for (const phone of phones) await phone.getByRole('button', { name: /Vote for drawing/ }).click();
    await expect.poll(async () => (await (await page.request.get(`/api/v1/activity-sessions/${run.runId}/host-state`)).json()).votes.length).toBe(2);
    await expect.poll(async () => (await (await page.request.get(`/api/v1/activity-runs/${run.runId}`)).json()).state.phase, { timeout: 10000 }).not.toBe('voting');
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('telephone drawings pass to another phone and progress through description and redraw', async ({ page, browser }) => {
  await signInAsAdmin(page, 'Telephone reliability');
  const run = await launch(page, 'Telephone', { requireModeration: false, telephoneChain: true, chainSteps: [
    { kind: 'drawing', label: 'Draw it', prompt: 'Draw this animal', phrase: 'A dancing penguin' },
    { kind: 'description', label: 'Describe it', prompt: 'Describe the sketch' },
    { kind: 'drawing', label: 'Redraw it', prompt: 'Draw the description' },
  ] });
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })));
  const phones = await Promise.all(contexts.map(context => context.newPage()));
  try {
    for (let index = 0; index < phones.length; index++) {
      await phones[index].goto(`/play/${run.state.joinCode}`);
      await phones[index].getByLabel('Display name').fill(['Thea', 'Raelynn'][index]);
      await phones[index].getByRole('button', { name: 'Join game' }).click();
      await expect(phones[index].getByText('You’re in.')).toBeVisible();
    }
    await command(page, run.runId, 'start');
    for (const phone of phones) {
      await expect(phone.getByText('A dancing penguin', { exact: true })).toBeVisible();
      await draw(phone, true);
      await phone.getByRole('button', { name: 'Submit drawing' }).click();
    }
    for (let index = 0; index < phones.length; index++) {
      const phone = phones[index];
      await expect(phone.getByPlaceholder('Describe what you see…')).toBeVisible({ timeout: 15000 });
      await expect(phone.locator('.telephone-source circle')).toHaveCount(1);
      await phone.getByPlaceholder('Describe what you see…').fill(`Description by ${['Thea', 'Raelynn'][index]}`);
      if (index === 0) {
        await phone.route('**/participant-action', route => route.abort('failed'), { times: 1 });
        await phone.getByRole('button', { name: 'Pass it on' }).click();
        await expect(phone.locator('.participant-error')).toBeVisible();
        await expect(phone.getByPlaceholder('Describe what you see…')).toHaveValue('Description by Thea');
      }
      await phone.getByRole('button', { name: 'Pass it on' }).click();
    }
    for (let index = 0; index < phones.length; index++) {
      await expect(phones[index].getByText(`Description by ${['Raelynn', 'Thea'][index]}`, { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(phones[index].getByRole('button', { name: 'Submit drawing' })).toBeDisabled();
      await draw(phones[index], true);
      await phones[index].getByRole('button', { name: 'Submit drawing' }).click();
    }
    await expect.poll(async () => (await (await page.request.get(`/api/v1/activity-runs/${run.runId}`)).json()).state.phase, { timeout: 15000 }).toBe('finalResults');
    const final = await (await page.request.get(`/api/v1/activity-runs/${run.runId}`)).json();
    expect(final.state.telephoneChain).toHaveLength(6);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
