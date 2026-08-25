<?php

declare(strict_types=1);

namespace ShlinkUi;

use RuntimeException;

final class ShlinkApiException extends RuntimeException
{
    public function __construct(string $message, public readonly int $upstreamStatus = 502)
    {
        parent::__construct($message);
    }
}
