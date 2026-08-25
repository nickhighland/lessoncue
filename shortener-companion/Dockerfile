FROM php:8.5-cli-alpine3.22

WORKDIR /var/www/companion

# The companion talks to Shlink over HTTP through PHP's cURL extension. Keep
# the image limited to the runtime it actually needs; the full Shlink source
# tree is not part of this image.
RUN apk add --no-cache libcurl \
    && apk add --no-cache --virtual .build-deps curl-dev \
    && docker-php-ext-install curl \
    && apk del .build-deps

COPY companion/ ./

RUN addgroup -S -g 10001 lessoncue \
    && adduser -S -D -H -u 10001 -G lessoncue lessoncue \
    && mkdir -p data/ui-sessions \
    && chown -R lessoncue:lessoncue /var/www/companion

USER lessoncue:lessoncue

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD php -r "exit(@file_get_contents('http://127.0.0.1:8080/') === false ? 1 : 0);"

CMD ["php", "-S", "0.0.0.0:8080", "-t", "/var/www/companion/public", "/var/www/companion/public/index.php"]
