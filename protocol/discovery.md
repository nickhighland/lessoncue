# Discovery protocol

LessonCue servers expose `GET /.well-known/lessoncue` and advertise `_lessoncue._tcp` over DNS-SD with `serverId`, `serverName`, `apiVersion`, `secure`, and `port` TXT records.

Clients try the last paired address, `lessoncue.local`, DNS-SD browse, a rate-limited same-subnet probe of the discovery path, and finally manual entry. A discovery response is not authentication and must never supply a device credential.
