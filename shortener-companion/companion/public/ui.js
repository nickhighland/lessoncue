(() => {
    'use strict';

    const API_BASE = 'ui-api';
    const state = { session: null, view: 'dashboard', loginRole: 'user', settings: null, links: [], searchTerm: '' };
    const navigation = [
        { id: 'dashboard', label: 'Overview', kicker: 'OVERVIEW', title: 'Good to see you.', icon: 'grid' },
        { id: 'links', label: 'Links', kicker: 'LINK MANAGEMENT', title: 'Your links.', icon: 'link' },
        { id: 'analytics', label: 'Analytics', kicker: 'PERFORMANCE', title: 'See what is working.', icon: 'chart' },
        { id: 'tags', label: 'Tags', kicker: 'ORGANIZATION', title: 'Keep links in context.', icon: 'tag' },
        { id: 'domains', label: 'Domains', kicker: 'INFRASTRUCTURE', title: 'Your short-link domains.', icon: 'globe' },
    ];
    const icons = {
        grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
        link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13.9 8.1 15.8a3.7 3.7 0 0 1-5.2-5.2l3-3a3.7 3.7 0 0 1 5.2 0"/><path d="m14 10.1 1.9-1.9a3.7 3.7 0 1 1 5.2 5.2l-3 3a3.7 3.7 0 0 1-5.2 0"/><path d="m8.5 15.5 7-7"/></svg>',
        chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/></svg>',
        tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5V10l8.5 8.5a2.1 2.1 0 0 0 3 0l3-3a2.1 2.1 0 0 0 0-3L10 4H5.5A1.5 1.5 0 0 0 4 5.5Z"/><circle cx="8" cy="8" r="1"/></svg>',
        globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg>',
        settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 4 .5 1.7a6.9 6.9 0 0 1 4 0l.5-1.7 2.1.9-.7 1.6a7 7 0 0 1 2.8 2.8l1.6-.7.9 2.1-1.7.5a6.9 6.9 0 0 1 0 4l1.7.5-.9 2.1-1.6-.7a7 7 0 0 1-2.8 2.8l.7 1.6-2.1.9-.5-1.7a6.9 6.9 0 0 1-4 0l-.5 1.7-2.1-.9.7-1.6a7 7 0 0 1-2.8-2.8l-1.6.7-.9-2.1 1.7-.5a6.9 6.9 0 0 1 0-4l-1.7-.5.9-2.1 1.6.7a7 7 0 0 1 2.8-2.8l-.7-1.6L9.5 4Z"/><circle cx="12" cy="12" r="2.7"/></svg>',
        search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="5.8"/><path d="m15.2 15.2 4.3 4.3"/></svg>',
        copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>',
        trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 4h4l1 3H9l1-3ZM7 7l.8 13h8.4L17 7M10 10v6M14 10v6"/></svg>',
        close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    };
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const icon = (name) => icons[name] || '';
    const hasFeature = (feature) => state.session?.features?.[feature] === true || state.session?.role === 'admin';
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

    async function api(path, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
        const request = Object.assign({}, options, { method, credentials: 'same-origin', headers });
        if (request.body && typeof request.body !== 'string') {
            headers['Content-Type'] = 'application/json';
            request.body = JSON.stringify(request.body);
        }
        if (state.session?.csrf && method !== 'GET') headers['X-CSRF-Token'] = state.session.csrf;
        const response = await fetch(API_BASE + path, request);
        let payload = {};
        try { payload = await response.json(); } catch (_) { /* status below is authoritative */ }
        if (response.status === 401 && path !== '/session') {
            state.session = null;
            showAuth();
        }
        if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
        return payload;
    }

    function applyBranding(branding = {}) {
        const name = branding.appName || 'Link Shortener';
        const accent = /^#[0-9a-fA-F]{6}$/.test(branding.accentColor || '') ? branding.accentColor : '#86E7B7';
        const mainColor = /^#[0-9a-fA-F]{6}$/.test(branding.mainColor || '') ? branding.mainColor : '#101827';
        const logoSizeValue = Number(branding.logoSize);
        const logoSize = Number.isFinite(logoSizeValue) ? Math.min(260, Math.max(40, logoSizeValue)) : 100;
        const showBrandName = branding.showBrandName !== false;
        document.documentElement.style.setProperty('--accent', accent);
        document.documentElement.style.setProperty('--navy', mainColor);
        document.documentElement.style.setProperty('--navy-light', blendHex(mainColor, '#ffffff', .12));
        document.documentElement.style.setProperty('--navy-foreground', contrastColor(mainColor));
        setLogoScale(logoSize);
        document.title = name;
        const siteFavicon = document.getElementById('site-favicon');
        if (siteFavicon) {
            const faviconType = typeof branding.faviconData === 'string' ? branding.faviconData.match(/^data:(image\/[^;]+);/)?.[1] : null;
            siteFavicon.setAttribute('href', branding.faviconData || 'favicon.ico');
            siteFavicon.setAttribute('type', faviconType || 'image/x-icon');
        }
        ['auth-brand-name', 'setup-brand-name', 'sidebar-brand-name'].forEach((id) => {
            const element = document.getElementById(id);
            if (!element) return;
            element.textContent = name;
            element.classList.toggle('is-hidden', !showBrandName);
        });
        const sidebarBrand = document.querySelector('.sidebar-brand');
        if (sidebarBrand) sidebarBrand.classList.toggle('is-logo-only', !showBrandName);
        ['auth-logo', 'setup-logo', 'sidebar-logo'].forEach((id) => {
            const logo = document.getElementById(id);
            if (!logo) return;
            logo.innerHTML = branding.logoData ? '<img src="' + escapeHtml(branding.logoData) + '" alt="">' : '<span></span><span></span>';
            logo.classList.toggle('has-image', Boolean(branding.logoData));
        });
    }
    function setLogoScale(value) {
        const size = Math.min(260, Math.max(40, Number(value) || 100));
        const scale = String(size / 100);
        document.documentElement.style.setProperty('--logo-scale', scale);
        document.documentElement.style.setProperty('--logo-preview-scale', scale);
        document.documentElement.style.setProperty('--sidebar-logo-width', Math.min(100, size) + '%');
    }
    function blendHex(hex, target, ratio) {
        const sourceRgb = hexToRgb(hex);
        const targetRgb = hexToRgb(target);
        if (!sourceRgb || !targetRgb) return hex;
        const channels = ['r', 'g', 'b'].map((channel) => Math.round(sourceRgb[channel] + (targetRgb[channel] - sourceRgb[channel]) * ratio));
        return '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('');
    }
    function contrastColor(hex) {
        const rgb = hexToRgb(hex);
        if (!rgb) return '#ffffff';
        const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
        return luminance > .58 ? '#101827' : '#ffffff';
    }
    function hexToRgb(hex) {
        const match = /^#([0-9a-fA-F]{6})$/.exec(hex || '');
        if (!match) return null;
        return { r: parseInt(match[1].slice(0, 2), 16), g: parseInt(match[1].slice(2, 4), 16), b: parseInt(match[1].slice(4, 6), 16) };
    }

    function showAuth() {
        $('#auth-screen').classList.remove('is-hidden');
        $('#setup-screen').classList.add('is-hidden');
        $('#app-screen').classList.add('is-hidden');
        const password = $('#login-password');
        if (password) password.focus();
    }
    function showSetup() {
        $('#auth-screen').classList.add('is-hidden');
        $('#setup-screen').classList.remove('is-hidden');
        $('#app-screen').classList.add('is-hidden');
        $('#setup-admin-password').focus();
    }
    function showApp() {
        $('#auth-screen').classList.add('is-hidden');
        $('#setup-screen').classList.add('is-hidden');
        $('#app-screen').classList.remove('is-hidden');
        updateAccount();
        renderNav();
    }
    function updateAccount() {
        const isAdmin = state.session?.role === 'admin';
        $('#account-name').textContent = isAdmin ? 'Administrator' : 'Link Studio';
        $('#account-role').textContent = isAdmin ? 'Full access' : 'Enabled features';
        $('#account-avatar').textContent = isAdmin ? 'A' : 'T';
    }
    function renderNav() {
        const items = navigation.filter((item) => hasFeature(item.id));
        if (state.session?.role === 'admin') items.push({ id: 'settings', label: 'Access & brand', kicker: 'SETTINGS', title: 'Shape the workspace.', icon: 'settings' });
        $('#primary-nav').innerHTML = items.map((item) => '<button type="button" class="nav-item ' + (state.view === item.id ? 'is-active' : '') + '" data-view="' + item.id + '"><span class="nav-icon">' + icon(item.icon) + '</span><span>' + escapeHtml(item.label) + '</span></button>').join('');
    }
    function setTopbar(view) {
        const item = navigation.find((entry) => entry.id === view) || { kicker: 'SETTINGS', title: 'Shape the workspace.' };
        $('#topbar-kicker').textContent = item.kicker;
        $('#topbar-title').textContent = item.title;
        $('#topbar-add-link').classList.toggle('is-hidden', !hasFeature('links') || view === 'settings');
    }

    async function openView(view) {
        if (view !== 'settings' && !hasFeature(view)) view = navigation.find((item) => hasFeature(item.id))?.id || 'dashboard';
        state.view = view;
        renderNav();
        setTopbar(view);
        $('#sidebar').classList.remove('is-open');
        const content = $('#app-content');
        content.innerHTML = '<div class="skeleton skeleton-short"></div><div class="skeleton skeleton-tall"></div>';
        try {
            if (view === 'dashboard') await renderDashboard(content);
            if (view === 'links') await renderLinksPage(content);
            if (view === 'analytics') await renderAnalyticsPage(content);
            if (view === 'tags') await renderTagsPage(content);
            if (view === 'domains') await renderDomainsPage(content);
            if (view === 'settings') await renderSettingsPage(content);
        } catch (error) {
            content.innerHTML = '<div class="empty-state panel"><div class="empty-state-icon">!</div><h3>Could not load this view</h3><p>' + escapeHtml(error.message) + '</p><button class="button button-quiet" data-retry-view="' + escapeHtml(view) + '">Try again</button></div>';
        }
    }

    async function renderDashboard(content) {
        const results = await Promise.all([
            hasFeature('links') ? api('/links?itemsPerPage=8') : Promise.resolve(null),
            hasFeature('analytics') ? api('/analytics') : Promise.resolve(null),
        ]);
        const linksPayload = results[0];
        const analyticsPayload = results[1];
        const links = linksPayload ? getPageData(linksPayload.shortUrls) : [];
        state.links = links;
        const visits = analyticsPayload?.visits;
        const totalClicks = visits?.nonOrphanVisits?.total ?? 0;
        const userFeatures = navigation.filter((item) => hasFeature(item.id)).length;
        const accessTags = navigation.filter((item) => hasFeature(item.id)).map((item) => '<span class="tag">' + escapeHtml(item.label) + '</span>').join('');
        content.innerHTML =
            '<div class="page-intro"><div><p class="eyebrow">' + (state.session?.role === 'admin' ? 'ADMINISTRATOR VIEW' : 'PRIVATE WORKSPACE') + '</p><h1>Your link command center.</h1><p>Everything you need to share less noise and learn more from every click.</p></div>' +
            (hasFeature('links') ? '<div class="page-actions"><button class="button button-primary" data-add-link><span aria-hidden="true">＋</span> Create a link</button></div>' : '') + '</div>' +
            '<div class="grid stats-grid">' +
            statCard('Total links', linksPayload ? (linksPayload.shortUrls?.pagination?.totalItems ?? links.length) : '—', 'Across your workspace', '↗') +
            statCard('Total clicks', analyticsPayload ? formatNumber(totalClicks) : '—', analyticsPayload ? 'Tracked visits' : 'Analytics is off', '◌') +
            statCard('Non-bot clicks', analyticsPayload ? formatNumber(visits?.nonOrphanVisits?.nonBots ?? 0) : '—', 'Human activity', '✦') +
            statCard('Available areas', userFeatures, state.session?.role === 'admin' ? 'Admin sees everything' : 'Enabled for you', '⊙') +
            '</div>' +
            (!hasFeature('analytics') ? '<div class="feature-banner"><div><h3>Analytics is not part of your workspace.</h3><p>An administrator can enable visit reporting when your team needs it.</p></div></div>' : '') +
            '<div class="grid two-column"><section class="panel"><div class="panel-heading"><div><h3>Recent links</h3><p>The latest destinations added to this workspace.</p></div>' + (hasFeature('links') ? '<button class="panel-link" data-view-link="links">View all ↗</button>' : '') + '</div>' +
            (hasFeature('links') ? linksTable(links, true) : emptyState('Links are not enabled', 'Your administrator has not made link management available to this account.', null)) +
            '</section>' +
            (hasFeature('links') ? '<section class="quick-add"><h3>Have a destination in mind?</h3><p>Turn a long URL into a clean, trackable link in seconds.</p><button class="button button-primary" data-add-link>Create a link <span aria-hidden="true">↗</span></button></section>' : '<section class="panel"><div class="panel-heading"><div><h3>Your access</h3><p>Features available in this workspace.</p></div></div><div class="tag-list">' + accessTags + '</div></section>') +
            '</div>';
    }
    function statCard(label, value, detail, symbol) {
        return '<div class="stat-card"><div class="stat-label"><span>' + escapeHtml(label) + '</span><span>' + symbol + '</span></div><div class="stat-value">' + escapeHtml(value) + '</div><div class="stat-detail">' + escapeHtml(detail) + '</div></div>';
    }

    async function renderLinksPage(content) {
        const search = state.searchTerm || '';
        const payload = await api('/links?itemsPerPage=100' + (search ? '&searchTerm=' + encodeURIComponent(search) : ''));
        const links = getPageData(payload.shortUrls);
        state.links = links;
        content.innerHTML =
            '<div class="page-intro"><div><p class="eyebrow">LINK LIBRARY</p><h1>Your links.</h1><p>Create, copy, and keep an eye on every short URL.</p></div><div class="page-actions"><button class="button button-primary" data-add-link><span aria-hidden="true">＋</span> New link</button></div></div>' +
            '<section class="panel"><div class="toolbar"><form id="search-form" class="search-box"><span>' + icon('search') + '</span><input id="link-search" value="' + escapeHtml(search) + '" placeholder="Search destinations or slugs" aria-label="Search links"></form><div class="filter-pills"><span class="filter-pill is-active">' + links.length + ' visible</span></div></div>' + linksTable(links) + '</section>';
        $('#search-form').addEventListener('submit', (event) => {
            event.preventDefault();
            state.searchTerm = $('#link-search').value.trim();
            openView('links');
        });
    }
    function linksTable(links, compact = false) {
        if (!links.length) return emptyState('No links yet', 'Create your first short link and it will appear here.', hasFeature('links') ? 'Create a link' : null);
        return '<div class="table-wrap"><table class="data-table"><thead><tr><th>Short link</th><th>Destination</th><th>Clicks</th>' + (compact ? '' : '<th>Added</th>') + '<th></th></tr></thead><tbody>' + links.map((link) => linkRow(link, compact)).join('') + '</tbody></table></div>';
    }
    function linkRow(link, compact) {
        const shortUrl = link.shortUrl || link.shortCode || '';
        const clicks = link.visitsSummary?.total ?? 0;
        const nonBots = link.visitsSummary?.nonBots ?? clicks;
        return '<tr><td data-label="Short link"><div class="link-main"><span class="link-glyph">' + icon('link') + '</span><div><strong>' + escapeHtml(shortUrl) + '</strong><small>' + escapeHtml(link.title || 'Untitled destination') + '</small></div></div></td><td data-label="Destination"><div class="destination" title="' + escapeHtml(link.longUrl) + '">' + escapeHtml(link.longUrl) + '</div></td><td data-label="Clicks"><div class="click-count">' + formatNumber(clicks) + '<small>' + formatNumber(nonBots) + ' human</small></div></td>' + (compact ? '' : '<td data-label="Added"><span class="muted">' + formatDate(link.dateCreated) + '</span></td>') + '<td data-label="Actions"><div class="row-actions"><button class="small-action" data-copy-link="' + escapeHtml(shortUrl) + '" title="Copy short link">' + icon('copy') + '</button><button class="small-action danger" data-delete-link="' + escapeHtml(link.shortCode) + '" data-delete-domain="' + escapeHtml(link.domain || '') + '" title="Delete link">' + icon('trash') + '</button></div></td></tr>';
    }
    function emptyState(title, description, action) {
        return '<div class="empty-state"><div class="empty-state-icon">↗</div><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(description) + '</p>' + (action ? '<button class="button button-primary" data-add-link>' + escapeHtml(action) + ' <span aria-hidden="true">↗</span></button>' : '') + '</div>';
    }

    async function renderAnalyticsPage(content) {
        const results = await Promise.all([api('/analytics'), hasFeature('links') ? api('/links?itemsPerPage=100') : Promise.resolve(null)]);
        const analytics = results[0] || {};
        const visits = analytics.visits || {};
        const summary = visits.nonOrphanVisits || {};
        const links = results[1] ? getPageData(results[1].shortUrls) : [];
        const visitDetails = Array.isArray(analytics.visitDetails) ? analytics.visitDetails : [];
        const analyticsWindow = Number(analytics.analyticsWindowDays) || 30;
        const trackedVisits = Number(summary.total) || 0;
        const humanVisits = Number(summary.nonBots) || 0;
        const potentialBots = Math.max(0, trackedVisits - humanVisits);
        const orphanVisits = Number(visits.orphanVisits?.total) || 0;
        const linkChart = linksByClicks(links);
        const dailyVisits = buildDailyVisits(visitDetails, 14);
        const platforms = limitBreakdown(aggregateVisits(visitDetails, classifyPlatform));
        const devices = limitBreakdown(aggregateVisits(visitDetails, classifyDevice), 3);
        const countries = limitBreakdown(aggregateVisits(visitDetails, classifyCountry));
        const referrers = limitBreakdown(aggregateVisits(visitDetails, classifyReferrer));

        content.innerHTML =
            '<div class="page-intro"><div><p class="eyebrow">PERFORMANCE SNAPSHOT</p><h1>See what is working.</h1><p>Understand the attention your shared destinations earn, from daily views to the devices behind them.</p></div><div class="page-actions"><span class="filter-pill is-active">Last ' + analyticsWindow + ' days</span></div></div>' +
            '<div class="grid stats-grid">' + statCard('Tracked visits', formatNumber(trackedVisits), 'All non-orphan traffic', '↗') + statCard('Human visits', formatNumber(humanVisits), 'Bot-filtered activity', '✦') + statCard('Active links', formatNumber(links.length), 'Links in this workspace', '⌁') + statCard('Recent visits', formatNumber(visitDetails.length), 'Loaded for this view', '◌') + '</div>' +
            '<section class="panel analytics-wide"><div class="panel-heading"><div><h3>Views per day</h3><p>Daily non-orphan visits across the most recent two weeks.</p></div><span class="chart-caption">UTC dates</span></div>' + dailyBarChart(dailyVisits) + '</section>' +
            '<div class="grid analytics-grid"><section class="panel"><div class="panel-heading"><div><h3>Platform mix</h3><p>Operating systems detected from visitor user agents.</p></div></div>' + pieChart(platforms, 'platform') + '</section>' +
            '<section class="panel"><div class="panel-heading"><div><h3>Device mix</h3><p>Desktop and mobile share of recent visits.</p></div></div>' + pieChart(devices, 'device') + '</section></div>' +
            '<div class="grid two-column"><section class="panel"><div class="panel-heading"><div><h3>Clicks by link</h3><p>Ranked by total tracked visits.</p></div></div>' + (links.length ? '<div class="chart-list">' + linkChart + '</div>' : emptyState('No link data yet', 'Create links to start seeing how they perform.', hasFeature('links') ? 'Create a link' : null)) + '</section>' +
            '<section class="panel"><div class="panel-heading"><div><h3>Traffic quality</h3><p>A clear view of what the counter includes.</p></div></div><div class="metric-stack"><div class="metric-row"><span>Non-orphan visits</span><strong>' + formatNumber(trackedVisits) + '</strong></div><div class="metric-row"><span>Human visits</span><strong>' + formatNumber(humanVisits) + '</strong></div><div class="metric-row"><span>Potential bots</span><strong>' + formatNumber(potentialBots) + '</strong></div><div class="metric-row"><span>Orphan visits</span><strong>' + formatNumber(orphanVisits) + '</strong></div></div></section></div>' +
            '<div class="grid two-column analytics-detail-grid"><section class="panel"><div class="panel-heading"><div><h3>Top locations</h3><p>Countries represented in recent visits.</p></div></div>' + breakdownList(countries, 'No location data yet') + '</section>' +
            '<section class="panel"><div class="panel-heading"><div><h3>Traffic sources</h3><p>Referring sites when a browser provides one.</p></div></div>' + breakdownList(referrers, 'No referral data yet') + '</section></div>';
    }
    function linksByClicks(links) {
        const ranked = links.slice().sort((a, b) => (Number(b.visitsSummary?.total) || 0) - (Number(a.visitsSummary?.total) || 0)).slice(0, 8);
        const maxClicks = Math.max(...ranked.map((link) => Number(link.visitsSummary?.total) || 0), 1);
        return ranked.map((link) => {
            const clicks = Number(link.visitsSummary?.total) || 0;
            return '<div class="chart-item"><div class="chart-label" title="' + escapeHtml(link.shortUrl || link.shortCode) + '">' + escapeHtml(link.shortUrl || link.shortCode) + '</div><div class="bar-track"><div class="bar-fill ' + chartPercentClass(clicks, maxClicks, 'width') + '"></div></div><div class="chart-value">' + formatNumber(clicks) + '</div></div>';
        }).join('');
    }
    function buildDailyVisits(visits, dayCount) {
        const counts = new Map();
        visits.forEach((visit) => {
            const date = String(visit.date || '').slice(0, 10);
            if (date) counts.set(date, (counts.get(date) || 0) + 1);
        });
        const today = new Date();
        const result = [];
        for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
            const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
            const key = date.toISOString().slice(0, 10);
            result.push({ key, label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date), value: counts.get(key) || 0 });
        }
        return result;
    }
    function dailyBarChart(days) {
        const max = Math.max(...days.map((day) => day.value), 1);
        return '<div class="daily-chart" role="img" aria-label="Views per day bar chart">' + days.map((day) => {
            return '<div class="daily-column" title="' + escapeHtml(day.label + ': ' + formatNumber(day.value) + ' visits') + '"><span class="daily-value">' + formatNumber(day.value) + '</span><div class="daily-bar-track"><div class="daily-bar ' + chartPercentClass(day.value, max, 'height') + '"></div></div><span class="daily-label">' + escapeHtml(day.label) + '</span></div>';
        }).join('') + '</div>';
    }
    function chartPercentClass(value, max, dimension) {
        if (!value || !max) return 'chart-' + dimension + '-0';
        const percent = Math.min(100, Math.max(5, Math.round(value / max * 20) * 5));
        return 'chart-' + dimension + '-' + percent;
    }
    function aggregateVisits(visits, labeler) {
        const counts = new Map();
        visits.forEach((visit) => {
            const label = labeler(visit);
            counts.set(label, (counts.get(label) || 0) + 1);
        });
        return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    }
    function limitBreakdown(entries, max = 6) {
        if (entries.length <= max) return entries;
        const visible = entries.slice(0, max - 1);
        visible.push({ label: 'Other', value: entries.slice(max - 1).reduce((total, entry) => total + entry.value, 0) });
        return visible;
    }
    function classifyPlatform(visit) {
        const userAgent = String(visit.userAgent || '');
        if (/windows phone|windows/i.test(userAgent)) return 'Windows';
        if (/cros/i.test(userAgent)) return 'ChromeOS';
        if (/iphone|ipad|ipod|ios/i.test(userAgent)) return 'iOS';
        if (/android/i.test(userAgent)) return 'Android';
        if (/macintosh|mac os x/i.test(userAgent)) return 'macOS';
        if (/linux/i.test(userAgent)) return 'Linux';
        return userAgent ? 'Other' : 'Unknown';
    }
    function classifyDevice(visit) {
        const userAgent = String(visit.userAgent || '');
        if (!userAgent) return 'Unknown';
        return /mobile|android|iphone|ipad|ipod|windows phone/i.test(userAgent) ? 'Mobile' : 'Desktop';
    }
    function classifyCountry(visit) {
        const location = visit.visitLocation || {};
        return String(location.countryName || location.countryCode || 'Unknown');
    }
    function classifyReferrer(visit) {
        const referrer = String(visit.referer || '').trim();
        if (!referrer) return 'Direct / unknown';
        try { return new URL(referrer).hostname.replace(/^www\./, ''); } catch (_) { return 'Other'; }
    }
    function pieChart(entries, kind) {
        if (!entries.length) return '<div class="chart-empty-note">No recent ' + (kind === 'device' ? 'device' : 'platform') + ' data yet.<small>It will appear after tracked visits arrive.</small></div>';
        const total = entries.reduce((sum, entry) => sum + entry.value, 0);
        const colors = kind === 'device' ? ['#36bb7e', '#4778ff', '#a4afb9'] : ['#36bb7e', '#4778ff', '#ffa95a', '#8d6de8', '#e55e86', '#58b8c8', '#a4afb9'];
        const circumference = 2 * Math.PI * 52;
        let offset = 0;
        const rings = entries.map((entry, index) => {
            const share = entry.value / total;
            const dash = share * circumference;
            const dashAttributes = share >= 1 ? '' : ' stroke-dasharray="' + dash.toFixed(3) + ' ' + (circumference - dash).toFixed(3) + '" stroke-dashoffset="' + (-offset).toFixed(3) + '"';
            const ring = '<circle class="pie-segment pie-color-' + (index % colors.length) + '" cx="60" cy="60" r="52"' + dashAttributes + ' transform="rotate(-90 60 60)"></circle>';
            offset += dash;
            return ring;
        }).join('');
        const legend = entries.map((entry, index) => '<div class="legend-row"><span class="legend-swatch ' + kind + '-color-' + (index % colors.length) + '"></span><span class="legend-label">' + escapeHtml(entry.label) + '</span><strong>' + formatNumber(entry.value) + ' <small>' + Math.round(entry.value / total * 100) + '%</small></strong></div>').join('');
        return '<div class="pie-layout"><div class="pie-chart-visual"><svg class="pie-chart-svg" data-kind="' + kind + '" viewBox="0 0 120 120" role="img" aria-label="' + escapeHtml(kind + ' mix') + '">' + rings + '</svg><div class="pie-chart-center"><strong>' + formatNumber(total) + '</strong><small>visits</small></div></div><div class="pie-legend">' + legend + '</div></div>';
    }
    function breakdownList(entries, emptyMessage) {
        if (!entries.length) return '<div class="chart-empty-note">' + escapeHtml(emptyMessage) + '<small>More detail will appear as visits accumulate.</small></div>';
        const max = Math.max(...entries.map((entry) => entry.value), 1);
        return '<div class="breakdown-list">' + entries.map((entry) => '<div class="breakdown-row"><div class="breakdown-heading"><span>' + escapeHtml(entry.label) + '</span><strong>' + formatNumber(entry.value) + '</strong></div><div class="bar-track"><div class="bar-fill ' + chartPercentClass(entry.value, max, 'width') + '"></div></div></div>').join('') + '</div>';
    }
    async function renderTagsPage(content) {
        const tags = getPageData((await api('/tags?itemsPerPage=100')).tags);
        const cards = tags.map((tag) => '<div class="info-card"><div class="info-card-main"><span class="info-card-icon">' + icon('tag') + '</span><div><strong>' + escapeHtml(tag) + '</strong><small>Available to filter from the link library</small></div></div><span class="info-card-badge">Tag</span></div>').join('');
        content.innerHTML = '<div class="page-intro"><div><p class="eyebrow">LINK ORGANIZATION</p><h1>Keep links in context.</h1><p>Tags make a growing link library easier to scan.</p></div></div><section class="panel">' + (tags.length ? '<div class="list-cards">' + cards + '</div>' : emptyState('No tags yet', 'Tags will appear here as you add them to links.', hasFeature('links') ? 'Create a link' : null)) + '</section>';
    }
    async function renderDomainsPage(content) {
        const domains = (await api('/domains')).domains || [];
        const cards = domains.map((domain) => '<div class="info-card"><div class="info-card-main"><span class="info-card-icon">' + icon('globe') + '</span><div><strong>' + escapeHtml(domain.domain || domain.authority || '') + '</strong><small>' + (domain.isDefault ? 'Default domain' : 'Configured domain') + '</small></div></div>' + (domain.isDefault ? '<span class="info-card-badge">Default</span>' : '') + '</div>').join('');
        content.innerHTML = '<div class="page-intro"><div><p class="eyebrow">SHORT-LINK INFRASTRUCTURE</p><h1>Your short-link domains.</h1><p>See which domains are available for this workspace.</p></div></div><section class="panel">' + (domains.length ? '<div class="list-cards">' + cards + '</div>' : emptyState('No domains configured', 'The default domain will appear after the first link is created.', null)) + '</section>';
    }

    async function renderSettingsPage(content) {
        const settings = await api('/settings');
        state.settings = settings;
        const branding = settings.branding || {};
        const features = settings.features || {};
        const logo = branding.logoData ? '<img src="' + escapeHtml(branding.logoData) + '" alt="Current logo">' : '<span class="brand-mark"><span></span><span></span></span>';
        const favicon = branding.faviconData ? '<img src="' + escapeHtml(branding.faviconData) + '" alt="Current favicon">' : '<span class="favicon-placeholder" aria-hidden="true">✦</span>';
        content.innerHTML =
            '<div class="page-intro"><div><p class="eyebrow">ADMINISTRATOR CONTROLS</p><h1>Shape the workspace.</h1><p>Decide what Link Studio users can access and make the product feel like yours.</p></div></div>' +
            '<div class="grid settings-grid"><section class="panel settings-card"><h3>Branding</h3><p class="section-copy">These details are visible to everyone who signs in.</p><form id="settings-form" class="settings-form">' +
            '<label class="field"><span>Application name</span><input id="settings-app-name" value="' + escapeHtml(branding.appName || '') + '" maxlength="64" required></label>' +
            '<div class="branding-color-grid"><div class="color-field"><label class="field"><span>Accent color</span><input id="settings-accent" value="' + escapeHtml(branding.accentColor || '#86E7B7') + '" pattern="^#[0-9a-fA-F]{6}$"></label><label class="field"><span>Pick</span><input id="settings-color-picker" type="color" value="' + escapeHtml(branding.accentColor || '#86E7B7') + '"></label></div><div class="color-field"><label class="field"><span>Main color</span><input id="settings-main-color" value="' + escapeHtml(branding.mainColor || '#101827') + '" pattern="^#[0-9a-fA-F]{6}$"></label><label class="field"><span>Pick</span><input id="settings-main-color-picker" type="color" value="' + escapeHtml(branding.mainColor || '#101827') + '"></label></div></div>' +
            '<div class="field"><span>Logo</span><div class="logo-drop"><div id="settings-logo-preview" class="logo-preview">' + logo + '</div><div><p>Use a PNG, JPEG, GIF, or WebP image under 512 KB.</p><label for="settings-logo-file">Choose a logo<input id="settings-logo-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label><button type="button" id="remove-logo" class="panel-link ' + (branding.logoData ? '' : 'is-hidden') + '">Remove</button></div></div></div>' +
            '<div class="field"><span>Favicon</span><div class="logo-drop favicon-drop"><div id="settings-favicon-preview" class="favicon-preview">' + favicon + '</div><div><p>Use a square PNG, JPEG, GIF, WebP, or ICO image under 512 KB.</p><label for="settings-favicon-file">Choose a favicon<input id="settings-favicon-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/x-icon,.ico"></label><button type="button" id="remove-favicon" class="panel-link ' + (branding.faviconData ? '' : 'is-hidden') + '">Remove</button></div></div></div>' +
            '<div class="logo-size-field"><div class="logo-size-heading"><span>Logo size</span><output id="settings-logo-size-value">' + escapeHtml(branding.logoSize || 100) + '%</output></div><input id="settings-logo-size" type="range" min="40" max="260" step="1" value="' + escapeHtml(branding.logoSize || 100) + '" aria-label="Logo size"><small>Drag to preview the logo size immediately. Save changes to keep it.</small></div>' +
            '<label class="check-field"><input id="settings-show-brand-name" type="checkbox" ' + (branding.showBrandName !== false ? 'checked' : '') + '><span><strong>Show name beside logo</strong><small>Turn this off when the logo already includes the application name.</small></span></label>' +
            '<div class="settings-divider"></div><div><h3>Passwords</h3><p class="section-copy">Leave a password blank to keep the current one.</p></div>' +
            '<label class="field"><span>Link Studio password <small class="muted">(' + (settings.userPasswordConfigured ? 'configured' : 'not configured') + ')</small></span><input id="settings-user-password" type="password" autocomplete="new-password" minlength="8" placeholder="Set a new Link Studio password"></label>' +
            '<label class="field"><span>Administrator password</span><input id="settings-admin-password" type="password" autocomplete="new-password" minlength="8" placeholder="Set a new admin password"></label>' +
            '<div class="page-actions"><button class="button button-primary" type="submit">Save changes <span aria-hidden="true">↗</span></button><p id="settings-message" class="form-message"></p></div></form></section>' +
            '<section class="panel settings-card"><h3>Link Studio access</h3><p class="section-copy">Toggle the pages and capabilities available to Link Studio users. Administrators always retain full access.</p><div class="switch-list">' +
            switchRow('dashboard', 'Overview', 'Summary of links and workspace activity.', features.dashboard) + switchRow('links', 'Link management', 'Create, delete, copy, and organize links.', features.links) + switchRow('analytics', 'Analytics', 'Monitor visits and traffic quality.', features.analytics) + switchRow('tags', 'Tags', 'Browse the shared tag vocabulary.', features.tags) + switchRow('domains', 'Domains', 'See the short-link domains in use.', features.domains) +
            '</div><div class="security-status settings-security"><span class="security-icon">⌁</span><div><strong>Protected workspace</strong>Access changes are enforced by the companion service, not just hidden in the browser.</div></div></section></div>';
        bindSettingsForm(settings);
    }
    function switchRow(id, label, description, enabled) {
        return '<div class="switch-row"><div><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(description) + '</small></div><button type="button" class="switch ' + (enabled ? 'is-on' : '') + '" data-feature-toggle="' + id + '" aria-pressed="' + Boolean(enabled) + '" title="Toggle ' + escapeHtml(label) + '"></button></div>';
    }
    function bindSettingsForm(settings) {
        let logoData = settings.branding?.logoData || null;
        let faviconData = settings.branding?.faviconData || null;
        $('#settings-color-picker').addEventListener('input', (event) => { $('#settings-accent').value = event.target.value.toUpperCase(); });
        $('#settings-accent').addEventListener('input', (event) => { if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) $('#settings-color-picker').value = event.target.value; });
        $('#settings-main-color-picker').addEventListener('input', (event) => { $('#settings-main-color').value = event.target.value.toUpperCase(); });
        $('#settings-main-color').addEventListener('input', (event) => { if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) $('#settings-main-color-picker').value = event.target.value; });
        $('#settings-logo-size').addEventListener('input', (event) => { $('#settings-logo-size-value').textContent = event.target.value + '%'; setLogoScale(event.target.value); });
        $('#settings-logo-file').addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 512 * 1024) return showToast('Logo files must be smaller than 512 KB.', true);
            logoData = await readFileAsDataUrl(file);
            $('#settings-logo-preview').innerHTML = '<img src="' + escapeHtml(logoData) + '" alt="New logo">';
            $('#remove-logo').classList.remove('is-hidden');
        });
        $('#remove-logo').addEventListener('click', () => { logoData = null; $('#settings-logo-preview').innerHTML = '<span class="brand-mark"><span></span><span></span></span>'; $('#remove-logo').classList.add('is-hidden'); });
        $('#settings-favicon-file').addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 512 * 1024) return showToast('Favicon files must be smaller than 512 KB.', true);
            faviconData = await readFileAsDataUrl(file);
            $('#settings-favicon-preview').innerHTML = '<img src="' + escapeHtml(faviconData) + '" alt="New favicon">';
            $('#remove-favicon').classList.remove('is-hidden');
        });
        $('#remove-favicon').addEventListener('click', () => { faviconData = null; $('#settings-favicon-preview').innerHTML = '<span class="favicon-placeholder" aria-hidden="true">✦</span>'; $('#remove-favicon').classList.add('is-hidden'); });
        $('#settings-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const message = $('#settings-message');
            message.textContent = '';
            const features = {};
            $$('[data-feature-toggle]').forEach((toggle) => { features[toggle.dataset.featureToggle] = toggle.classList.contains('is-on'); });
            const body = { appName: $('#settings-app-name').value.trim(), accentColor: $('#settings-accent').value.trim(), mainColor: $('#settings-main-color').value.trim(), logoSize: Number($('#settings-logo-size').value), showBrandName: $('#settings-show-brand-name').checked, logoData, faviconData, features };
            const userPassword = $('#settings-user-password').value;
            const adminPassword = $('#settings-admin-password').value;
            if (userPassword) body.userPassword = userPassword;
            if (adminPassword) body.adminPassword = adminPassword;
            try {
                const payload = await api('/settings', { method: 'PUT', body });
                state.session.branding = payload.branding;
                applyBranding(payload.branding);
                message.textContent = 'Saved.';
                message.classList.add('is-success');
                $('#settings-user-password').value = '';
                $('#settings-admin-password').value = '';
                showToast('Workspace settings saved.');
                setTimeout(() => message.classList.remove('is-success'), 2200);
            } catch (error) { message.textContent = error.message; }
        });
    }

    async function openAddLinkModal() {
        $('#modal-root').innerHTML =
            '<div class="modal-backdrop" data-close-modal><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-link-heading"><div class="modal-heading"><div><p class="eyebrow">NEW SHORT LINK</p><h2 id="add-link-heading">Create a link.</h2><p>Give your destination a clean, shareable front door.</p></div><button class="modal-close" type="button" data-close-modal aria-label="Close">' + icon('close') + '</button></div>' +
            '<form id="add-link-form" class="stack-form"><label class="field"><span>Destination URL</span><input id="new-long-url" type="url" placeholder="https://example.com/your-destination" required autofocus></label><label class="field"><span>Custom alias <small class="muted">(optional)</small></span><div class="url-composer"><span id="short-url-prefix" class="url-prefix">Loading domain…</span><input id="new-custom-slug" placeholder="your-code" aria-label="Custom alias"></div><small class="field-help">Only enter the part after the slash.</small></label><label class="field"><span>Tags <small class="muted">(optional, comma separated)</small></span><input id="new-tags" placeholder="campaign, social"></label><label class="field"><span>Title <small class="muted">(optional)</small></span><input id="new-title" placeholder="How this link should be remembered"></label><div class="modal-actions"><button class="button button-quiet" type="button" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Create link <span aria-hidden="true">↗</span></button></div><p id="add-link-message" class="form-message"></p></form></section></div>';
        $('#add-link-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const message = $('#add-link-message');
            message.textContent = '';
            const tags = $('#new-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
            const body = { longUrl: $('#new-long-url').value.trim(), tags, title: $('#new-title').value.trim() || null, customSlug: $('#new-custom-slug').value.trim() || null };
            try {
                const payload = await api('/links', { method: 'POST', body });
                closeModal();
                showToast('Created ' + (payload.shortUrl?.shortUrl || 'a new link') + '.');
                await openView(state.view);
            } catch (error) { message.textContent = error.message; }
        });
        $('#new-long-url').focus();
        try {
            const payload = await api('/link-prefix');
            if ($('#short-url-prefix') && payload.prefix) $('#short-url-prefix').textContent = payload.prefix;
        } catch (_) {
            if ($('#short-url-prefix')) $('#short-url-prefix').textContent = 'Configured domain/';
        }
    }
    function closeModal() { $('#modal-root').innerHTML = ''; }
    async function deleteLink(shortCode, domain) {
        if (!window.confirm('Delete ' + shortCode + '? This cannot be undone.')) return;
        const query = domain ? '?domain=' + encodeURIComponent(domain) : '';
        try { await api('/links/' + encodeURIComponent(shortCode) + query, { method: 'DELETE' }); showToast('Link deleted.'); await openView(state.view); } catch (error) { showToast(error.message, true); }
    }
    async function copyLink(shortUrl) {
        try { await navigator.clipboard.writeText(shortUrl); showToast('Short link copied to your clipboard.'); } catch (_) { showToast('Copy was blocked by the browser.', true); }
    }
    function getPageData(page) { return Array.isArray(page?.data) ? page.data : Array.isArray(page) ? page : []; }
    function formatNumber(number) { return new Intl.NumberFormat().format(Number(number) || 0); }
    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    }
    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    }
    function showToast(message, error = false) {
        const toast = document.createElement('div');
        toast.className = 'toast' + (error ? ' is-error' : '');
        toast.textContent = message;
        $('#toast-region').appendChild(toast);
        setTimeout(() => toast.remove(), 3400);
    }
    async function enterSession(session) {
        state.session = session;
        state.view = navigation.find((item) => hasFeature(item.id))?.id || 'dashboard';
        applyBranding(session.branding);
        showApp();
        await openView(state.view);
    }

    document.addEventListener('click', (event) => {
        const roleButton = event.target.closest('[data-login-role]');
        if (roleButton) { state.loginRole = roleButton.dataset.loginRole; $$('[data-login-role]').forEach((button) => button.classList.toggle('is-active', button === roleButton)); }
        const navButton = event.target.closest('[data-view]');
        if (navButton) openView(navButton.dataset.view);
        const viewLink = event.target.closest('[data-view-link]');
        if (viewLink) openView(viewLink.dataset.viewLink);
        if (event.target.closest('[data-add-link]')) openAddLinkModal();
        const copyButton = event.target.closest('[data-copy-link]');
        if (copyButton) copyLink(copyButton.dataset.copyLink);
        const deleteButton = event.target.closest('[data-delete-link]');
        if (deleteButton) deleteLink(deleteButton.dataset.deleteLink, deleteButton.dataset.deleteDomain);
        if (event.target.closest('[data-close-modal]') && (!event.target.closest('.modal-card') || event.target.closest('.modal-close'))) closeModal();
        const retry = event.target.closest('[data-retry-view]');
        if (retry) openView(retry.dataset.retryView);
        const featureToggle = event.target.closest('[data-feature-toggle]');
        if (featureToggle) { featureToggle.classList.toggle('is-on'); featureToggle.setAttribute('aria-pressed', featureToggle.classList.contains('is-on')); }
    });
    $('#login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = $('#login-message');
        message.textContent = '';
        try { const session = await api('/auth/login', { method: 'POST', body: { role: state.loginRole, password: $('#login-password').value } }); $('#login-password').value = ''; await enterSession(session); } catch (error) { message.textContent = error.message; }
    });
    $('#setup-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = $('#setup-message');
        message.textContent = '';
        try { const session = await api('/setup', { method: 'POST', body: { adminPassword: $('#setup-admin-password').value, userPassword: $('#setup-user-password').value } }); await enterSession(session); } catch (error) { message.textContent = error.message; }
    });
    $('#logout-button').addEventListener('click', async () => { try { await api('/auth/logout', { method: 'POST' }); } catch (_) { /* local state is cleared below */ } state.session = null; showAuth(); });
    $('#topbar-add-link').addEventListener('click', openAddLinkModal);
    $('#menu-button').addEventListener('click', () => $('#sidebar').classList.toggle('is-open'));

    (async function bootstrap() {
        try {
            const session = await api('/session');
            applyBranding(session.branding);
            if (session.authenticated) await enterSession(session);
            else if (session.setupRequired) showSetup();
            else showAuth();
        } catch (error) {
            showAuth();
            $('#login-message').textContent = error.message;
        }
    })();
})();
