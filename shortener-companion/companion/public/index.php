<?php

declare(strict_types=1);

use ShlinkUi\Application;
use ShlinkUi\AuthService;
use ShlinkUi\ConfigRepository;
use ShlinkUi\ShlinkClient;

spl_autoload_register(static function (string $class): void {
    $prefix = 'ShlinkUi\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $file = __DIR__ . '/../src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

if (PHP_SAPI === 'cli-server') {
    $path = (string) (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    $staticFile = __DIR__ . $path;
    if ($path !== '/' && is_file($staticFile)) {
        return false;
    }
}

$projectRoot = dirname(__DIR__);
$storageFile = getenv('COMPANION_STORAGE_FILE') ?: $projectRoot . '/data/ui-config.json';
$sessionDirectory = getenv('COMPANION_SESSION_DIR') ?: $projectRoot . '/data/ui-sessions';
$apiUrl = getenv('SHLINK_API_URL') ?: getenv('SHLINK_URL') ?: 'http://127.0.0.1:8080';
$apiKey = getenv('SHLINK_API_KEY');
$apiKeyFile = getenv('SHLINK_API_KEY_FILE');
if ($apiKeyFile !== false && is_file($apiKeyFile)) {
    $fileValue = file_get_contents($apiKeyFile);
    if ($fileValue !== false && trim($fileValue) !== '') {
        $apiKey = $fileValue;
    }
}
$apiKey = $apiKey === false || trim($apiKey) === '' ? null : trim($apiKey);
$shortUrlBase = getenv('SHLINK_SHORT_URL_BASE') ?: getenv('COMPANION_SHORT_URL_BASE') ?: null;
$passwordResetFile = getenv('COMPANION_PASSWORD_RESET_FILE');
$passwordResetFile = $passwordResetFile === false || trim($passwordResetFile) === ''
    ? null
    : trim($passwordResetFile);

$application = new Application(
    new ConfigRepository($storageFile),
    new AuthService($sessionDirectory),
    new ShlinkClient($apiUrl, $apiKey, $shortUrlBase),
    $projectRoot . '/public/index.html',
    $passwordResetFile,
);
$application->run();
