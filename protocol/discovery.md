# Discovery protocol

LessonCue servers expose `GET /.well-known/lessoncue` and advertise `_lessoncue._tcp` over DNS-SD. The service record carries the active TCP port and the TXT record repeats `apiVersion`, `secure`, and `port` so clients can construct the browser address without assuming a fixed port. Server identity and display name come from the discovery document.

Clients try the last paired address, `lessoncue.local`, DNS-SD browse, a rate-limited same-subnet probe of the discovery path, and finally manual entry. A discovery response is not authentication and must never supply a device credential.
