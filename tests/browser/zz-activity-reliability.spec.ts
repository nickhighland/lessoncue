import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from './support/adminSession';

test.use({ serviceWorkers: 'block' });

async function lesson(page: Page, title: string) {
  const classes = await (await page.request.get('/api/v1/classes')).json();
  const response = await page.request.post('/api/v1/lessons', { data: { classId: classes[0].id, title } });
  expect(response.ok()).toBeTruthy();
  return await response.json() as { id: string; classId: string };
}

async function game(page: Page, lessonId: string, name: string) {
  const created = await page.request.post('/api/v1/activities', { data: {
    name, type: 'trivia', config: { title: name, autoPilot: false,
      questions: [{ id: 'q1', prompt: `${name} question`, options: ['Venus', 'Mars'], correctIndex: 1 }] },
  } });
  expect(created.ok()).toBeTruthy();
  const definition = await created.json();
  const started = await page.request.post('/api/v1/activity-runs', { data: { activityDefinitionId: definition.id, lessonId } });
  expect(started.ok()).toBeTruthy();
  return await started.json() as { runId: string; state: { joinCode: string } };
}

test('a phone recovers a failed join-page request and follows the lesson without rescanning', async ({ page, browser }) => {
  await signInAsAdmin(page, 'Reliability');
  const selectedLesson = await lesson(page, 'Phone handoff');
  const first = await game(page, selectedLesson.id, 'First game');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await context.newPage();
  try {
    let firstRequest = true;
    let lostJoinReply = false;
    await phone.route('**/api/v1/activity-sessions/join/**', async route => {
      if (firstRequest) { firstRequest = false; return route.abort('failed'); }
      if (route.request().method() === 'POST' && !lostJoinReply) {
        lostJoinReply = true;
        const accepted = await route.fetch();
        expect(accepted.ok()).toBeTruthy();
        return route.abort('failed');
      }
      return route.continue();
    });
    await phone.goto(`/play/${first.state.joinCode}`);
    await expect(phone.getByLabel('Display name')).toBeVisible({ timeout: 20000 });
    await phone.getByLabel('Display name').fill('Carmen');
    await phone.getByRole('button', { name: 'Join game' }).click();
    await expect(phone.locator('.participant-error')).toBeVisible();
    await phone.getByRole('button', { name: 'Join game' }).click();
    await expect(phone.getByText('You’re in.')).toBeVisible();

    // Miss the transition while this phone has no network. Its old run URL
    // must catch up to the new game, not make the old game current again.
    await context.setOffline(true);
    const second = await game(page, selectedLesson.id, 'Second game');
    await page.request.post(`/api/v1/activity-runs/${second.runId}/command`, { data: { action: 'open' } });
    await page.request.get(`/api/v1/activity-runs/${first.runId}`);
    await context.setOffline(false);
    await expect(phone.getByText('Second game question', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(phone.getByRole('button', { name: /Not Carmen/ })).toBeVisible();
    const roster = await (await page.request.get(`/api/v1/activity-sessions/${second.runId}/host-state`)).json();
    expect(roster.participants.map((p: { displayName: string }) => p.displayName)).toEqual(['Carmen']);

    await phone.getByRole('button', { name: /Not Carmen/ }).click();
    await expect(phone.getByRole('button', { name: 'Join game' })).toBeVisible();
    await phone.getByLabel('Display name').fill('Letty');
    await phone.getByRole('button', { name: 'Join game' }).click();
    await expect(phone.getByRole('button', { name: /Not Letty/ })).toBeVisible();
  } finally { await context.close(); }
});

test('temporary remotes host their lesson without an admin cookie, but cannot control another lesson', async ({ page, browser }) => {
  await signInAsAdmin(page, 'Remote reliability');
  const selectedLesson = await lesson(page, 'Scoped remote');
  const otherLesson = await lesson(page, 'Out of scope');
  const run = await game(page, selectedLesson.id, 'Remote game');
  const other = await game(page, otherLesson.id, 'Other game');
  const sessionResponse = await page.request.post('/api/v1/controller/sessions', { data: {
    classId: selectedLesson.classId, lessonId: selectedLesson.id, expiresInMinutes: 5,
  } });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  const context = await browser.newContext();
  try {
    const headers = { 'X-LessonCue-Controller': `session:${session.token}`, Host: 'lessoncue.local' };
    expect((await context.request.get(`/api/v1/activity-sessions/${run.runId}/host-state`, { headers })).status()).toBe(200);
    expect((await context.request.post(`/api/v1/activity-runs/${run.runId}/command`, { headers, data: { action: 'start' } })).status()).toBe(200);
    expect((await context.request.post(`/api/v1/activity-runs/${run.runId}/reset`, { headers, data: {} })).status()).toBe(200);
    expect((await context.request.get(`/api/v1/activity-sessions/${other.runId}/host-state`, { headers })).status()).toBe(401);
    expect((await context.request.post(`/api/v1/activity-runs/${other.runId}/command`, { headers, data: { action: 'start' } })).status()).toBe(401);
    expect((await context.request.get(`/api/v1/activity-sessions/${run.runId}/host-state`)).status()).toBe(401);
    expect((await context.request.post('/api/v1/activities', { headers, data: { name: 'Forbidden', type: 'trivia' } })).status()).toBe(401);
  } finally { await context.close(); }
});

test('simultaneous phone joins are idempotent and a classroom can answer together', async ({ page, browser }) => {
  await signInAsAdmin(page, 'Classroom reliability');
  const selectedLesson = await lesson(page, 'Classroom load');
  const run = await game(page, selectedLesson.id, 'Classroom');
  const context = await browser.newContext();
  try {
    const join = (token: string, name: string) => context.request.post(`/api/v1/activity-sessions/join/${run.state.joinCode}`,
      { data: { participantToken: token, displayName: name } });
    const retries = await Promise.all(Array.from({ length: 8 }, () => join('same-device-token-1234567890', 'Carmen')));
    for (const response of retries) expect(response.status()).toBe(200);
    const identities = await Promise.all(retries.map(response => response.json()));
    expect(new Set(identities.map(value => value.participant.participantId)).size).toBe(1);
    const joins = await Promise.all(Array.from({ length: 29 }, (_, i) => join(`classroom-device-token-${String(i).padStart(8, '0')}`, `Player ${i + 2}`)));
    for (const response of joins) expect(response.status()).toBe(200);
    const players = [identities[0], ...await Promise.all(joins.map(response => response.json()))];
    await page.request.post(`/api/v1/activity-runs/${run.runId}/command`, { data: { action: 'open' } });
    const answers = await Promise.all(players.map(player => context.request.post(`/api/v1/activity-sessions/${run.runId}/participant-action`,
      { data: { participantToken: player.token, action: 'answer', payload: { optionIndex: 1 } } })));
    for (const response of answers) expect(response.status()).toBe(200);
    const host = await (await page.request.get(`/api/v1/activity-sessions/${run.runId}/host-state`)).json();
    expect(host.participants).toHaveLength(30);
    expect(host.submissions).toHaveLength(30);
  } finally { await context.close(); }
});
