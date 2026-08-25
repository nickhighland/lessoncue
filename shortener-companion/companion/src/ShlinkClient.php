<?php

declare(strict_types=1);

namespace ShlinkUi;

use function array_filter;
use function curl_errno;
use function curl_error;
use function curl_exec;
use function curl_getinfo;
use function curl_init;
use function curl_setopt_array;
use function http_build_query;
use function is_array;
use function is_string;
use function json_decode;
use function json_encode;
use function gmdate;
use function preg_match;
use function preg_replace;
use function rtrim;
use function sprintf;
use function str_starts_with;
use function time;

use const CURLINFO_HTTP_CODE;
use const CURLOPT_CONNECTTIMEOUT;
use const CURLOPT_CUSTOMREQUEST;
use const CURLOPT_HTTPHEADER;
use const CURLOPT_POSTFIELDS;
use const CURLOPT_RETURNTRANSFER;
use const CURLOPT_TIMEOUT;
use const CURLOPT_FOLLOWLOCATION;
use const JSON_THROW_ON_ERROR;
use const JSON_UNESCAPED_SLASHES;

final class ShlinkClient
{
    private readonly string $apiUrl;
    private readonly string|null $apiKey;
    private readonly string|null $shortUrlBase;

    public function __construct(string $apiUrl, string|null $apiKey, string|null $shortUrlBase = null)
    {
        $apiUrl = rtrim($apiUrl, '/');
        $this->apiUrl = preg_match('#/rest/v[0-9]+$#', $apiUrl) === 1 ? $apiUrl : $apiUrl . '/rest/v3';
        $this->apiKey = $apiKey;
        $this->shortUrlBase = $this->normalizeUrlBase($shortUrlBase);
    }

    public function isConfigured(): bool
    {
        return $this->apiKey !== null;
    }

    /**
     * @param array<string, scalar|array<scalar>|null> $query
     * @return array<string, mixed>
     */
    public function request(string $method, string $path, array $query = [], array|null $body = null): array
    {
        if ($this->apiKey === null) {
            throw new ShlinkApiException('The companion is not connected to a Shlink API key.', 503);
        }

        $query = array_filter($query, static fn (mixed $value): bool => $value !== null && $value !== '');
        $url = $this->apiUrl . '/' . ltrim($path, '/');
        if ($query !== []) {
            $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        }

        $handle = curl_init($url);
        if ($handle === false) {
            throw new ShlinkApiException('The companion could not initialize its Shlink connection.', 503);
        }

        $headers = [
            'Accept: application/json',
            'X-Api-Key: ' . $this->apiKey,
        ];
        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => $headers,
        ];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            $options[CURLOPT_HTTPHEADER] = $headers;
            $options[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        }

        curl_setopt_array($handle, $options);
        $response = curl_exec($handle);
        $error = curl_error($handle);
        $errorNumber = curl_errno($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        if ($response === false || $errorNumber !== 0) {
            throw new ShlinkApiException(
                sprintf('The companion could not reach Shlink: %s', $error !== '' ? $error : 'connection failed.'),
                503,
            );
        }

        $decoded = json_decode($response, true);
        if ($status < 200 || $status >= 300) {
            $message = is_array($decoded)
                ? (string) ($decoded['detail'] ?? $decoded['title'] ?? $decoded['error'] ?? 'Shlink rejected the request.')
                : 'Shlink rejected the request.';
            throw new ShlinkApiException($message, $status > 0 ? $status : 502);
        }

        if ($response === '' || $status === 204) {
            return [];
        }

        if (!is_array($decoded)) {
            throw new ShlinkApiException('Shlink returned an invalid response.', 502);
        }

        return $decoded;
    }

    /** @param array<string, scalar|null> $query */
    public function listLinks(array $query): array
    {
        return $this->request('GET', '/short-urls', $query);
    }

    /** @param array<string, mixed> $body */
    public function createLink(array $body): array
    {
        return $this->request('POST', '/short-urls', body: $body);
    }

    /** @param array<string, mixed> $body */
    public function updateLink(string $shortCode, array $body, string|null $domain = null): array
    {
        return $this->request('PATCH', '/short-urls/' . rawurlencode($shortCode), ['domain' => $domain], $body);
    }

    public function deleteLink(string $shortCode, string|null $domain = null): array
    {
        return $this->request('DELETE', '/short-urls/' . rawurlencode($shortCode), ['domain' => $domain]);
    }

    public function analytics(): array
    {
        $summary = $this->request('GET', '/visits');
        $recentVisits = $this->request('GET', '/visits/non-orphan', [
            'itemsPerPage' => -1,
            'startDate' => gmdate('c', time() - (30 * 86400)),
        ]);

        $visitDetails = $recentVisits['visits']['data'] ?? [];
        return [
            ...$summary,
            'visitDetails' => is_array($visitDetails) ? $visitDetails : [],
            'analyticsWindowDays' => 30,
        ];
    }

    public function shortUrlBase(): string
    {
        if ($this->shortUrlBase !== null) {
            return $this->shortUrlBase;
        }

        try {
            $response = $this->request('GET', '/domains');
            $domains = $response['domains']['data'] ?? [];
            if (is_array($domains)) {
                foreach ($domains as $domain) {
                    if (!is_array($domain) || ($domain['isDefault'] ?? false) !== true) {
                        continue;
                    }

                    $configuredDomain = is_string($domain['domain'] ?? null) ? trim($domain['domain']) : '';
                    if ($configuredDomain !== '') {
                        return 'https://' . rtrim($configuredDomain, '/') . '/';
                    }
                }
            }
        } catch (ShlinkApiException) {
            // The API base remains a useful fallback when domains are restricted or unavailable.
        }

        $base = preg_replace('#/rest/v[0-9]+$#', '', $this->apiUrl) ?: $this->apiUrl;
        return rtrim($base, '/') . '/';
    }

    /** @param array<string, scalar|null> $query */
    public function linkVisits(string $shortCode, array $query, string|null $domain = null): array
    {
        return $this->request('GET', '/short-urls/' . rawurlencode($shortCode) . '/visits', ['domain' => $domain, ...$query]);
    }

    /** @param array<string, scalar|null> $query */
    public function tags(array $query): array
    {
        return $this->request('GET', '/tags', $query);
    }

    public function domains(): array
    {
        $response = $this->request('GET', '/domains');
        $domains = $response['domains'] ?? [];
        return ['domains' => is_array($domains['data'] ?? null) ? $domains['data'] : $domains];
    }

    private function normalizeUrlBase(string|null $url): string|null
    {
        if ($url === null || trim($url) === '') {
            return null;
        }

        $url = trim($url);
        if (!str_starts_with($url, 'http://') && !str_starts_with($url, 'https://')) {
            $url = 'https://' . $url;
        }

        return rtrim($url, '/') . '/';
    }
}
