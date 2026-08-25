<?php

declare(strict_types=1);

namespace ShlinkUi;

use RuntimeException;
use Throwable;

use function array_replace_recursive;
use function chmod;
use function dirname;
use function file_get_contents;
use function file_put_contents;
use function getenv;
use function is_array;
use function is_dir;
use function is_file;
use function json_decode;
use function json_encode;
use function mkdir;
use function rename;
use function tempnam;
use function trim;
use function unlink;

use const JSON_PRETTY_PRINT;
use const JSON_THROW_ON_ERROR;
use const JSON_UNESCAPED_SLASHES;
use const LOCK_EX;
use const PHP_EOL;

final class ConfigRepository
{
    /**
     * @param non-empty-string $storageFile
     */
    public function __construct(private readonly string $storageFile)
    {
    }

    /**
     * @return array{
     *     appName: string,
     *     accentColor: string,
     *     mainColor: string,
     *     logoSize: int,
     *     showBrandName: bool,
     *     logoData: string|null,
     *     features: array<string, bool>,
     *     adminPasswordHash: string|null,
     *     userPasswordHash: string|null
     * }
     */
    public function get(): array
    {
        $defaults = $this->defaults();
        if (!is_file($this->storageFile)) {
            return $defaults;
        }

        $contents = file_get_contents($this->storageFile);
        if ($contents === false || $contents === '') {
            throw new RuntimeException('The companion configuration could not be read.');
        }

        try {
            $stored = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('The companion configuration is not valid JSON.', previous: $e);
        }

        if (!is_array($stored)) {
            throw new RuntimeException('The companion configuration has an invalid structure.');
        }

        /** @var array{appName?: mixed, accentColor?: mixed, mainColor?: mixed, logoSize?: mixed, showBrandName?: mixed, logoData?: mixed, features?: mixed, adminPasswordHash?: mixed, userPasswordHash?: mixed} $stored */
        return array_replace_recursive($defaults, $stored);
    }

    /**
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    public function save(array $config): array
    {
        $config = array_replace_recursive($this->defaults(), $config);
        $directory = dirname($this->storageFile);

        if (!is_dir($directory) && !mkdir($directory, 0o750, true) && !is_dir($directory)) {
            throw new RuntimeException('The companion configuration directory could not be created.');
        }

        $temporaryFile = tempnam($directory, 'ui-config-');
        if ($temporaryFile === false) {
            throw new RuntimeException('The companion configuration could not be written.');
        }

        try {
            $encoded = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            if (file_put_contents($temporaryFile, $encoded . PHP_EOL, LOCK_EX) === false) {
                throw new RuntimeException('The companion configuration could not be written.');
            }

            chmod($temporaryFile, 0o600);
            if (!rename($temporaryFile, $this->storageFile)) {
                throw new RuntimeException('The companion configuration could not be saved.');
            }
        } finally {
            if (is_file($temporaryFile)) {
                unlink($temporaryFile);
            }
        }

        return $config;
    }

    /**
     * @param callable(array<string, mixed>): array<string, mixed> $updater
     * @return array<string, mixed>
     */
    public function update(callable $updater): array
    {
        return $this->save($updater($this->get()));
    }

    /**
     * @return array{
     *     appName: string,
     *     accentColor: string,
     *     mainColor: string,
     *     logoSize: int,
     *     showBrandName: bool,
     *     logoData: string|null,
     *     features: array<string, bool>,
     *     adminPasswordHash: string|null,
     *     userPasswordHash: string|null
     * }
     */
    private function defaults(): array
    {
        return [
            'appName' => $this->environmentValue('COMPANION_APP_NAME') ?? 'Link Shortener',
            'accentColor' => $this->environmentValue('COMPANION_ACCENT_COLOR') ?? '#86E7B7',
            'mainColor' => $this->environmentValue('COMPANION_MAIN_COLOR') ?? '#101827',
            'logoSize' => 100,
            'showBrandName' => true,
            'logoData' => null,
            'features' => [
                'dashboard' => true,
                'links' => true,
                'analytics' => true,
                'tags' => true,
                'domains' => true,
            ],
            'adminPasswordHash' => null,
            'userPasswordHash' => null,
        ];
    }

    private function environmentValue(string $name): string|null
    {
        $fileValue = getenv($name . '_FILE');
        if ($fileValue !== false && is_file($fileValue)) {
            $contents = file_get_contents($fileValue);
            if ($contents !== false && trim($contents) !== '') {
                return trim($contents);
            }
        }

        $value = getenv($name);
        return $value === false || trim($value) === '' ? null : trim($value);
    }
}
