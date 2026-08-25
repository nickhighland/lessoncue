<?php

declare(strict_types=1);

namespace ShlinkUi;

use RuntimeException;

use function array_key_exists;
use function explode;
use function hash_equals;
use function implode;
use function in_array;
use function ini_set;
use function is_dir;
use function is_file;
use function is_string;
use function mkdir;
use function password_hash;
use function password_verify;
use function random_bytes;
use function session_destroy;
use function session_id;
use function session_name;
use function session_regenerate_id;
use function session_start;
use function session_status;
use function setcookie;
use function str_contains;
use function strlen;
use function strtolower;
use function time;
use function trim;

use const PASSWORD_DEFAULT;
use const PHP_SESSION_ACTIVE;
use const PHP_SESSION_NONE;

final class AuthService
{
    public const string ADMIN_ROLE = 'admin';
    public const string USER_ROLE = 'user';
    private const string SESSION_NAME = 'shlink_ui';

    /**
     * @param non-empty-string $sessionDirectory
     */
    public function __construct(private readonly string $sessionDirectory)
    {
        if (!is_dir($this->sessionDirectory) && !mkdir($this->sessionDirectory, 0o700, true) && !is_dir($this->sessionDirectory)) {
            throw new RuntimeException('The companion session directory could not be created.');
        }

        ini_set('session.use_cookies', '0');
        ini_set('session.use_strict_mode', '1');
        ini_set('session.save_path', $this->sessionDirectory);
    }

    /**
     * @param self::ADMIN_ROLE|self::USER_ROLE $role
     * @param array<string, mixed> $config
     */
    public function isConfigured(string $role, array $config): bool
    {
        return $this->configuredCredential($role, $config) !== null;
    }

    /**
     * @param array<string, mixed> $config
     */
    public function isSetupRequired(array $config): bool
    {
        return !$this->isConfigured(self::ADMIN_ROLE, $config)
            || !$this->isConfigured(self::USER_ROLE, $config);
    }

    /**
     * @param self::ADMIN_ROLE|self::USER_ROLE $role
     * @param array<string, mixed> $config
     * @return array{role: string, csrf: string, authenticatedAt: int}
     */
    public function login(string $role, string $password, array $config): array
    {
        if (!in_array($role, [self::ADMIN_ROLE, self::USER_ROLE], true)) {
            throw new UiHttpException('That account type is not available.', 422);
        }

        if (!$this->verifyPassword($role, $password, $config)) {
            throw new UiHttpException('The password is not correct.', 401);
        }

        $this->openSession();
        session_regenerate_id(true);
        $session = [
            'role' => $role,
            'csrf' => bin2hex(random_bytes(32)),
            'authenticatedAt' => time(),
        ];
        $_SESSION = $session;
        $sessionId = session_id();
        session_write_close();
        $this->setSessionCookie($sessionId);

        return $session;
    }

    /**
     * @return array{role: string, csrf: string, authenticatedAt: int}|null
     */
    public function current(): array|null
    {
        if ($this->cookieSessionId() === null) {
            return null;
        }

        $this->openSession();
        $session = $_SESSION;
        session_write_close();
        if (!is_array($session)) {
            return null;
        }

        $role = $session['role'] ?? null;
        $csrf = $session['csrf'] ?? null;
        $authenticatedAt = $session['authenticatedAt'] ?? null;
        if (!is_string($role) || !is_string($csrf) || !is_int($authenticatedAt)) {
            return null;
        }

        return ['role' => $role, 'csrf' => $csrf, 'authenticatedAt' => $authenticatedAt];
    }

    public function hasValidCsrf(): bool
    {
        $session = $this->current();
        $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        return $session !== null && is_string($provided) && hash_equals($session['csrf'], $provided);
    }

    public function logout(): void
    {
        if ($this->cookieSessionId() !== null) {
            $this->openSession();
            $_SESSION = [];
            session_destroy();
        }

        setcookie(self::SESSION_NAME, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'secure' => $this->isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    /**
     * @param self::ADMIN_ROLE|self::USER_ROLE $role
     * @param array<string, mixed> $config
     */
    private function verifyPassword(string $role, string $password, array $config): bool
    {
        $environmentHash = $this->environmentValue($this->environmentName($role, 'PASSWORD_HASH'));
        if ($environmentHash !== null) {
            return password_verify($password, $environmentHash);
        }

        $environmentPassword = $this->environmentValue($this->environmentName($role, 'PASSWORD'));
        if ($environmentPassword !== null) {
            return hash_equals($environmentPassword, $password);
        }

        $storedHash = $config[$role . 'PasswordHash'] ?? null;
        return is_string($storedHash) && $storedHash !== '' && password_verify($password, $storedHash);
    }

    /**
     * @param self::ADMIN_ROLE|self::USER_ROLE $role
     * @param array<string, mixed> $config
     */
    private function configuredCredential(string $role, array $config): string|null
    {
        return $this->environmentValue($this->environmentName($role, 'PASSWORD_HASH'))
            ?? $this->environmentValue($this->environmentName($role, 'PASSWORD'))
            ?? (is_string($config[$role . 'PasswordHash'] ?? null) ? $config[$role . 'PasswordHash'] : null);
    }

    /** @param self::ADMIN_ROLE|self::USER_ROLE $role */
    private function environmentName(string $role, string $suffix): string
    {
        return 'COMPANION_' . ($role === self::ADMIN_ROLE ? 'ADMIN' : 'USER') . '_' . $suffix;
    }

    private function openSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        session_name(self::SESSION_NAME);
        $sessionId = $this->cookieSessionId();
        if ($sessionId !== null) {
            session_id($sessionId);
        }
        session_start();
    }

    private function cookieSessionId(): string|null
    {
        $cookie = $_COOKIE[self::SESSION_NAME] ?? null;
        return is_string($cookie) && $cookie !== '' ? $cookie : null;
    }

    private function setSessionCookie(string $sessionId): void
    {
        setcookie(self::SESSION_NAME, $sessionId, [
            'expires' => 0,
            'path' => '/',
            'secure' => $this->isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private function isHttps(): bool
    {
        return strtolower((string) ($_SERVER['HTTPS'] ?? '')) === 'on'
            || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    }

    private function environmentValue(string $name): string|null
    {
        $file = getenv($name . '_FILE');
        if ($file !== false && is_file($file)) {
            $contents = file_get_contents($file);
            if ($contents !== false && trim($contents) !== '') {
                return trim($contents);
            }
        }

        $value = getenv($name);
        return $value === false || trim($value) === '' ? null : trim($value);
    }
}
