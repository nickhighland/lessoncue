<?php

declare(strict_types=1);

namespace ShlinkUi;

use JsonException;
use Throwable;

use function array_key_exists;
use function array_replace;
use function base64_decode;
use function file_get_contents;
use function header;
use function http_response_code;
use function is_array;
use function is_bool;
use function is_float;
use function is_file;
use function is_int;
use function is_string;
use function json_decode;
use function json_encode;
use function max;
use function min;
use function random_bytes;
use function rename;
use function parse_url;
use function preg_match;
use function rawurldecode;
use function sprintf;
use function strlen;
use function str_starts_with;
use function trim;
use function unlink;

use const JSON_THROW_ON_ERROR;
use const JSON_UNESCAPED_SLASHES;
use const PHP_URL_PATH;

final class Application
{
    private const array FEATURES = ['dashboard', 'links', 'analytics', 'tags', 'domains'];

    public function __construct(
        private readonly ConfigRepository $config,
        private readonly AuthService $auth,
        private readonly ShlinkClient $shlink,
        private readonly string $frontendFile,
        private readonly string|null $passwordResetFile = null,
    ) {
    }

    public function run(): void
    {
        try {
            $this->applyPasswordReset();
            $path = (string) (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
            $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

            if ($this->isFrontendRoute($path, $method)) {
                $this->frontend();
                return;
            }

            if (str_starts_with($path, '/ui-api')) {
                [$payload, $status] = $this->api($method, $path);
                $this->json($payload, $status);
                return;
            }

            throw new UiHttpException('The requested companion route was not found.', 404);
        } catch (UiHttpException $e) {
            $this->json(['error' => $e->getMessage()], $e->statusCode);
        } catch (ShlinkApiException $e) {
            $this->json(['error' => $e->getMessage()], 502);
        } catch (Throwable) {
            $this->json(['error' => 'The companion could not complete that request.'], 500);
        }
    }

    /**
     * Apply a password selected in LessonCue to the companion's own stored
     * credentials. Claim the file by rename first, so a concurrent LessonCue
     * write cannot be deleted by an older request. This is deliberately a
     * stored-hash update rather than an environment override: passwords later
     * changed in Access & brand must remain effective.
     */
    private function applyPasswordReset(): void
    {
        $path = $this->passwordResetFile;
        if ($path === null || !is_file($path)) {
            return;
        }

        $processing = $path . '.processing.' . bin2hex(random_bytes(8));
        if (!rename($path, $processing)) {
            return;
        }

        try {
            $contents = file_get_contents($processing);
            if ($contents === false || trim($contents) === '') {
                throw new UiHttpException('The companion password reset request is empty.', 500);
            }

            try {
                $body = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                throw new UiHttpException('The companion password reset request is invalid.', 500);
            }

            if (!is_array($body)) {
                throw new UiHttpException('The companion password reset request is invalid.', 500);
            }

            $adminPassword = $body['adminPassword'] ?? null;
            $userPassword = $body['userPassword'] ?? null;
            if (!is_string($adminPassword) || !is_string($userPassword)
                || strlen($adminPassword) < 8 || strlen($adminPassword) > 200
                || strlen($userPassword) < 8 || strlen($userPassword) > 200) {
                throw new UiHttpException('The companion password reset request is invalid.', 500);
            }

            $this->config->update(function (array $current) use ($adminPassword, $userPassword): array {
                $current['adminPasswordHash'] = $this->auth->hashPassword($adminPassword);
                $current['userPasswordHash'] = $this->auth->hashPassword($userPassword);
                return $current;
            });

            if (is_file($processing) && !unlink($processing)) {
                throw new UiHttpException('The companion password reset request could not be cleared.', 500);
            }
        } catch (Throwable $error) {
            // Keep a failed request available for the next request rather than
            // silently locking the operator out after a transient write error.
            if (is_file($processing) && !is_file($path)) {
                rename($processing, $path);
            }
            throw $error;
        }
    }

    /**
     * @return array{0: array<string, mixed>, 1: int}
     */
    private function api(string $method, string $path): array
    {
        if ($path === '/ui-api/session' && $method === 'GET') {
            return [$this->sessionPayload(), 200];
        }

        if ($path === '/ui-api/auth/login' && $method === 'POST') {
            return [$this->login(), 200];
        }

        if ($path === '/ui-api/auth/logout' && $method === 'POST') {
            $this->requireCsrf();
            $this->auth->logout();
            return [['authenticated' => false], 200];
        }

        if ($path === '/ui-api/setup' && $method === 'POST') {
            return [$this->setup(), 201];
        }

        if ($path === '/ui-api/settings') {
            $this->requireAdmin();
            if ($method === 'GET') {
                return [$this->settingsPayload(), 200];
            }
            if ($method === 'PUT') {
                return [$this->saveSettings(), 200];
            }
            throw new UiHttpException('That settings method is not allowed.', 405);
        }

        if ($path === '/ui-api/link-prefix' && $method === 'GET') {
            $this->requireFeature('links');
            return [['prefix' => $this->shlink->shortUrlBase()], 200];
        }

        if (preg_match('#^/ui-api/links/([^/]+)/visits$#', $path, $matches) === 1 && $method === 'GET') {
            $this->requireFeature('analytics');
            return [$this->shlink->linkVisits(rawurldecode($matches[1]), $_GET, $this->domain()), 200];
        }

        if (preg_match('#^/ui-api/links/([^/]+)$#', $path, $matches) === 1) {
            $this->requireFeature('links');
            $shortCode = rawurldecode($matches[1]);
            if ($method === 'DELETE') {
                $this->requireCsrf();
                $this->shlink->deleteLink($shortCode, $this->domain());
                return [['deleted' => true], 200];
            }
            if ($method === 'PATCH') {
                $this->requireCsrf();
                return [['shortUrl' => $this->shlink->updateLink($shortCode, $this->body(), $this->domain())], 200];
            }
        }

        if ($path === '/ui-api/links') {
            $this->requireFeature('links');
            if ($method === 'GET') {
                return [$this->shlink->listLinks($_GET), 200];
            }
            if ($method === 'POST') {
                $this->requireCsrf();
                $body = $this->body();
                unset($body['apiKey']);
                return [['shortUrl' => $this->shlink->createLink($body)], 201];
            }
        }

        if ($path === '/ui-api/analytics' && $method === 'GET') {
            $this->requireFeature('analytics');
            return [$this->shlink->analytics(), 200];
        }

        if ($path === '/ui-api/tags' && $method === 'GET') {
            $this->requireFeature('tags');
            return [$this->shlink->tags($_GET), 200];
        }

        if ($path === '/ui-api/domains' && $method === 'GET') {
            $this->requireFeature('domains');
            return [$this->shlink->domains(), 200];
        }

        throw new UiHttpException('The requested companion API route was not found.', 404);
    }

    private function isFrontendRoute(string $path, string $method): bool
    {
        return $method === 'GET' && in_array($path, ['/', '/admin', '/app'], true);
    }

    private function frontend(): void
    {
        if (!is_file($this->frontendFile)) {
            throw new UiHttpException('The companion frontend is not installed.', 500);
        }

        $contents = file_get_contents($this->frontendFile);
        if ($contents === false) {
            throw new UiHttpException('The companion frontend could not be read.', 500);
        }

        http_response_code(200);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        header('Content-Security-Policy: default-src \'self\'; img-src \'self\' data:; style-src \'self\'; script-src \'self\'; connect-src \'self\'');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        echo $contents;
    }

    /** @return array<string, mixed> */
    private function sessionPayload(): array
    {
        $config = $this->config->get();
        $session = $this->auth->current();
        $payload = [
            'authenticated' => $session !== null,
            'setupRequired' => $this->auth->isSetupRequired($config),
            'branding' => $this->branding($config),
        ];
        if ($session !== null) {
            $payload += [
                'role' => $session['role'],
                'csrf' => $session['csrf'],
                'features' => $this->featuresForRole($session['role'], $config),
            ];
        }

        return $payload;
    }

    /** @return array<string, mixed> */
    private function login(): array
    {
        $body = $this->body();
        $role = is_string($body['role'] ?? null) ? $body['role'] : '';
        $password = is_string($body['password'] ?? null) ? $body['password'] : '';
        $login = $this->auth->login($role, $password, $this->config->get());
        return $this->authenticatedPayload($login, $this->config->get());
    }

    /** @return array<string, mixed> */
    private function setup(): array
    {
        $config = $this->config->get();
        if (!$this->auth->isSetupRequired($config)) {
            throw new UiHttpException('The companion has already been configured.', 409);
        }

        $body = $this->body();
        $adminPassword = is_string($body['adminPassword'] ?? null) ? $body['adminPassword'] : '';
        $userPassword = is_string($body['userPassword'] ?? null) ? $body['userPassword'] : '';
        $this->validatePassword($adminPassword, 'The administrator password');
        $this->validatePassword($userPassword, 'The Link Studio password');

        $this->config->update(function (array $current) use ($adminPassword, $userPassword): array {
            $current['adminPasswordHash'] = $this->auth->hashPassword($adminPassword);
            $current['userPasswordHash'] = $this->auth->hashPassword($userPassword);
            return $current;
        });

        $login = $this->auth->login(AuthService::ADMIN_ROLE, $adminPassword, $this->config->get());
        return $this->authenticatedPayload($login, $this->config->get());
    }

    /** @return array<string, mixed> */
    private function saveSettings(): array
    {
        $this->requireCsrf();
        $body = $this->body();
        $current = $this->config->get();
        $appName = $body['appName'] ?? $current['appName'];
        $accentColor = $body['accentColor'] ?? $current['accentColor'];
        $mainColor = $body['mainColor'] ?? ($current['mainColor'] ?? '#101827');
        $logoSize = $body['logoSize'] ?? ($current['logoSize'] ?? 100);
        $showBrandName = $body['showBrandName'] ?? ($current['showBrandName'] ?? true);
        if (!is_string($appName) || trim($appName) === '' || strlen($appName) > 64) {
            throw new UiHttpException('The application name must be between 1 and 64 characters.', 422);
        }
        if (!is_string($accentColor) || preg_match('/^#[0-9a-fA-F]{6}$/', $accentColor) !== 1) {
            throw new UiHttpException('The accent color must be a six-digit hexadecimal color.', 422);
        }
        if (!is_string($mainColor) || preg_match('/^#[0-9a-fA-F]{6}$/', $mainColor) !== 1) {
            throw new UiHttpException('The main color must be a six-digit hexadecimal color.', 422);
        }
        if ((!is_int($logoSize) && !is_float($logoSize)) || (float) (int) $logoSize !== (float) $logoSize || $logoSize < 40 || $logoSize > 260) {
            throw new UiHttpException('The logo size must be a whole number between 40 and 260.', 422);
        }
        if (!is_bool($showBrandName)) {
            throw new UiHttpException('The logo name visibility setting must be boolean.', 422);
        }
        $logoSize = (int) $logoSize;

        $hasLogo = array_key_exists('logoData', $body);
        $logoData = $hasLogo ? $body['logoData'] : $current['logoData'];
        $this->validateLogo($logoData);
        $features = $this->featuresFromBody($body['features'] ?? $current['features'], $current['features']);
        $adminPasswordHash = $this->optionalPasswordHash($body['adminPassword'] ?? null, 'The administrator password');
        $userPasswordHash = $this->optionalPasswordHash($body['userPassword'] ?? null, 'The Link Studio password');

        $updated = $this->config->update(function (array $stored) use (
            $appName,
            $accentColor,
            $mainColor,
            $logoSize,
            $showBrandName,
            $logoData,
            $features,
            $adminPasswordHash,
            $userPasswordHash,
        ): array {
            $stored['appName'] = trim($appName);
            $stored['accentColor'] = $accentColor;
            $stored['mainColor'] = $mainColor;
            $stored['logoSize'] = $logoSize;
            $stored['showBrandName'] = $showBrandName;
            $stored['logoData'] = $logoData;
            $stored['features'] = $features;
            if ($adminPasswordHash !== null) {
                $stored['adminPasswordHash'] = $adminPasswordHash;
            }
            if ($userPasswordHash !== null) {
                $stored['userPasswordHash'] = $userPasswordHash;
            }
            return $stored;
        });

        return [
            ...$this->settingsPayload($updated),
            'saved' => true,
            'authenticatedAs' => AuthService::ADMIN_ROLE,
        ];
    }

    /** @param array{role: string, csrf: string, authenticatedAt: int} $session */
    private function authenticatedPayload(array $session, array $config): array
    {
        return [
            'authenticated' => true,
            'role' => $session['role'],
            'csrf' => $session['csrf'],
            'branding' => $this->branding($config),
            'features' => $this->featuresForRole($session['role'], $config),
        ];
    }

    /** @param array<string, mixed> $config */
    private function settingsPayload(array|null $config = null): array
    {
        $config ??= $this->config->get();
        return [
            'branding' => $this->branding($config),
            'features' => $this->featuresForRole(AuthService::USER_ROLE, $config),
            'userPasswordConfigured' => $this->auth->isConfigured(AuthService::USER_ROLE, $config),
            'adminPasswordConfigured' => $this->auth->isConfigured(AuthService::ADMIN_ROLE, $config),
            'apiConfigured' => $this->shlink->isConfigured(),
        ];
    }

    /** @param array<string, mixed> $config */
    private function branding(array $config): array
    {
        return [
            'appName' => is_string($config['appName'] ?? null) ? $config['appName'] : 'Link Shortener',
            'accentColor' => is_string($config['accentColor'] ?? null) ? $config['accentColor'] : '#86E7B7',
            'mainColor' => is_string($config['mainColor'] ?? null) && preg_match('/^#[0-9a-fA-F]{6}$/', $config['mainColor']) === 1 ? $config['mainColor'] : '#101827',
            'logoSize' => is_int($config['logoSize'] ?? null) ? max(40, min(260, $config['logoSize'])) : 100,
            'showBrandName' => ($config['showBrandName'] ?? true) !== false,
            'logoData' => is_string($config['logoData'] ?? null) ? $config['logoData'] : null,
        ];
    }

    /** @param array<string, mixed> $config */
    private function featuresForRole(string $role, array $config): array
    {
        if ($role === AuthService::ADMIN_ROLE) {
            return array_fill_keys(self::FEATURES, true);
        }

        return $this->featuresFromBody($config['features'] ?? [], []);
    }

    /** @param array<string, mixed> $body */
    private function featuresFromBody(mixed $body, mixed $fallback): array
    {
        $fallback = is_array($fallback) ? $fallback : [];
        if (!is_array($body)) {
            throw new UiHttpException('Features must be an object of boolean values.', 422);
        }

        $features = [];
        foreach (self::FEATURES as $feature) {
            $value = array_key_exists($feature, $body) ? $body[$feature] : ($fallback[$feature] ?? true);
            if (!is_bool($value)) {
                throw new UiHttpException('Feature switches must be boolean values.', 422);
            }
            $features[$feature] = $value;
        }

        return $features;
    }

    private function validatePassword(string $password, string $label): void
    {
        if (strlen($password) < 8 || strlen($password) > 200) {
            throw new UiHttpException($label . ' must be between 8 and 200 characters.', 422);
        }
    }

    private function optionalPasswordHash(mixed $password, string $label): string|null
    {
        if ($password === null || $password === '') {
            return null;
        }
        if (!is_string($password)) {
            throw new UiHttpException($label . ' must be a string.', 422);
        }
        $this->validatePassword($password, $label);
        return $this->auth->hashPassword($password);
    }

    private function validateLogo(mixed $logoData): void
    {
        if ($logoData === null) {
            return;
        }
        if (!is_string($logoData) || strlen($logoData) > 700_000) {
            throw new UiHttpException('The logo must be a small PNG, JPEG, GIF, or WebP data URL.', 422);
        }
        if (preg_match('/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+\/]+={0,2})$/', $logoData, $matches) !== 1
            || base64_decode($matches[2], true) === false) {
            throw new UiHttpException('The logo must be a valid base64 image data URL.', 422);
        }
    }

    /** @return array<string, mixed> */
    private function body(): array
    {
        $contents = file_get_contents('php://input');
        if ($contents === false || trim($contents) === '') {
            return [];
        }

        try {
            $body = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new UiHttpException('The request body must be valid JSON.', 400);
        }
        if (!is_array($body)) {
            throw new UiHttpException('The request body must be a JSON object.', 400);
        }

        return $body;
    }

    /** @return array{role: string, csrf: string, authenticatedAt: int} */
    private function requireSession(): array
    {
        $session = $this->auth->current();
        if ($session === null) {
            throw new UiHttpException('Your session has expired. Please sign in again.', 401);
        }

        return $session;
    }

    /** @return array{role: string, csrf: string, authenticatedAt: int} */
    private function requireAdmin(): array
    {
        $session = $this->requireSession();
        if ($session['role'] !== AuthService::ADMIN_ROLE) {
            throw new UiHttpException('Administrator access is required for this area.', 403);
        }

        return $session;
    }

    private function requireFeature(string $feature): void
    {
        $session = $this->requireSession();
        if ($session['role'] === AuthService::ADMIN_ROLE) {
            return;
        }

        $config = $this->config->get();
        $features = $this->featuresFromBody($config['features'] ?? [], []);
        if (($features[$feature] ?? false) !== true) {
            throw new UiHttpException('That feature is not enabled for your account.', 403);
        }
    }

    private function requireCsrf(): void
    {
        if (!$this->auth->hasValidCsrf()) {
            throw new UiHttpException('Your session token is no longer valid. Refresh and try again.', 403);
        }
    }

    private function domain(): string|null
    {
        $domain = $_GET['domain'] ?? null;
        return is_string($domain) && $domain !== '' ? $domain : null;
    }

    /** @param array<string, mixed> $payload */
    private function json(array $payload, int $status): void
    {
        http_response_code($status);
        header('Cache-Control: no-store');
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
}
