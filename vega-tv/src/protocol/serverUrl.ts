/**
 * What counts as a LessonCue server address.
 *
 * A port of the Android client's ServerUrlPolicy, kept deliberately faithful:
 * this is the rule that stops a display sending its device token over plain
 * HTTP to somewhere on the public internet. Two clients disagreeing about that
 * would be a hole in one of them.
 *
 * Plain HTTP is allowed only where it cannot leave the building — a private
 * address, loopback, or a .local name. Everything else must be HTTPS.
 */

export function normalizeLessonCueServerUrl(value: string): string {
  const entered = value.trim().replace(/\/+$/, "");
  if (!entered) throw new Error("Enter the LessonCue server address.");

  const candidate = entered.includes("://") ? entered : `http://${entered}`;

  // Parsed here rather than with URL, because React Native ships a cut-down
  // polyfill without protocol, username, search or hash. Leaning on it would
  // not merely fail to compile -- it would quietly stop enforcing the rule
  // that keeps a device token off the open internet.
  const parts = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([/?#].*)?$/.exec(candidate);
  if (!parts) throw new Error("Enter a valid LessonCue server address.");

  const scheme = parts[1].toLowerCase();
  const authority = parts[2];
  const remainder = parts[3] ?? "";

  if (scheme !== "http" && scheme !== "https") {
    throw new Error("LessonCue addresses must use HTTP or HTTPS.");
  }
  if (authority.includes("@") || (remainder !== "" && remainder !== "/")) {
    throw new Error("Enter only the LessonCue server origin, without credentials, a path, query, or fragment.");
  }

  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(authority);
  const [rawHost, rawPort] = bracketed
    ? [bracketed[1], bracketed[2]]
    : (() => {
        const colons = authority.split(":").length - 1;
        // A bare IPv6 literal has several colons and no port; anything else
        // with one colon is host:port.
        if (colons > 1) return [authority, undefined] as const;
        const [host, port] = authority.split(":");
        return [host, port] as const;
      })();

  const host = rawHost.trim().toLowerCase();
  if (!host) throw new Error("The LessonCue address needs a hostname or IP address.");

  let port: number | undefined;
  if (rawPort !== undefined && rawPort !== "") {
    if (!/^\d+$/.test(rawPort)) throw new Error("The LessonCue port must be from 1 to 65535.");
    port = Number(rawPort);
    if (port < 1 || port > 65_535) throw new Error("The LessonCue port must be from 1 to 65535.");
  }

  if (scheme !== "https" && !isTrustedLocalHttpHost(host)) {
    throw new Error(
      "Public or ordinary DNS addresses require HTTPS. Use HTTP only for a private IP address, localhost, or a .local name.",
    );
  }

  const displayHost = host.includes(":") ? `[${host}]` : host;
  const keepPort = port !== undefined
    && !((scheme === "http" && port === 80) || (scheme === "https" && port === 443));
  return `${scheme}://${displayHost}${keepPort ? `:${port}` : ""}`;
}

/** Addresses that cannot leave the local network, so plain HTTP is safe. */
export function isTrustedLocalHttpHost(hostValue: string): boolean {
  const host = hostValue.trim().replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;

  const octets = host.split(".").map(part => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  if (octets.length === 4 && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    return octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168);
  }

  if (!host.includes(":")) return false;
  const bytes = parseIpv6(host);
  if (!bytes) return false;
  const loopback = bytes.slice(0, 15).every(byte => byte === 0) && bytes[15] === 1;
  const uniqueLocal = (bytes[0] & 0xfe) === 0xfc;
  const linkLocal = bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80;
  return loopback || uniqueLocal || linkLocal;
}

/**
 * An IPv6 literal as sixteen bytes, or null when it is not one.
 *
 * Written out rather than delegated because React Native has no address
 * parser, and the alternative — treating anything with a colon as local —
 * would let a public address through on plain HTTP.
 */
function parseIpv6(host: string): number[] | null {
  if (!/^[0-9a-f:.]+$/.test(host)) return null;
  const doubleColons = host.split("::").length - 1;
  if (doubleColons > 1) return null;

  const [head, tail] = doubleColons === 1 ? host.split("::") : [host, undefined];
  const readGroups = (text: string | undefined): number[] | null => {
    if (!text) return [];
    const groups: number[] = [];
    for (const part of text.split(":")) {
      if (part === "") return null;
      if (part.includes(".")) {
        // A trailing IPv4 form, as in ::ffff:192.168.0.1.
        const quad = part.split(".").map(Number);
        if (quad.length !== 4 || quad.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
        groups.push((quad[0] << 8) | quad[1], (quad[2] << 8) | quad[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      groups.push(Number.parseInt(part, 16));
    }
    return groups;
  };

  const left = readGroups(head);
  const right = readGroups(tail);
  if (left === null || right === null) return null;

  const missing = 8 - left.length - right.length;
  if (doubleColons === 0 ? missing !== 0 : missing < 0) return null;
  const groups = [...left, ...new Array<number>(doubleColons === 1 ? missing : 0).fill(0), ...right];
  if (groups.length !== 8) return null;

  return groups.flatMap(group => [(group >> 8) & 0xff, group & 0xff]);
}
