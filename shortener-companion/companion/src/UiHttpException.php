<?php

declare(strict_types=1);

namespace ShlinkUi;

use RuntimeException;

final class UiHttpException extends RuntimeException
{
    public function __construct(string $message, public readonly int $statusCode)
    {
        parent::__construct($message);
    }
}
