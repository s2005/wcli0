import http from 'http';
import type { Socket } from 'net';

// Loopback hostnames that are always trusted as request origins. `URL.hostname`
// returns the bracketed form for IPv6, so both `::1` and `[::1]` are listed.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// Open TCP sockets tracked per server so closeHttpServer() can force-destroy
// them on Node runtimes that lack http.Server.closeAllConnections() (added in
// 18.2). Keyed weakly so entries disappear when a server is garbage-collected.
const serverSockets = new WeakMap<http.Server, Set<Socket>>();

/**
 * Extract the lowercased host from a configured allowed-origin entry. Accepts
 * either a full origin URL (`https://app.example.com:8443`) or a bare host
 * (`app.example.com`, `192.168.1.10`); only the host component is compared,
 * matching the host-only comparison used for the bind host. Returns `undefined`
 * for values that cannot be parsed into a host.
 */
function parseAllowedOriginHost(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    // Bare host without a scheme. Retry with a dummy scheme so `URL` can still
    // parse `host` and `host:port` forms.
    try {
      return new URL(`http://${trimmed}`).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }
}

/**
 * Decide whether an incoming request's `Origin` header may use an HTTP-based
 * transport (legacy SSE or Streamable HTTP). Requests with no `Origin` header
 * are treated as non-browser clients (native MCP clients, curl) and are
 * permitted. A present `Origin` must point at a loopback host, the configured
 * bind host, or one of the explicitly configured `allowedOrigins`; everything
 * else -- including malformed values and the literal `null` origin used by
 * sandboxed iframes and `file://` pages -- is rejected.
 *
 * This blocks DNS-rebinding attacks: the browser sets `Origin` to the page's own
 * domain (for example `https://evil.example`), not the rebound `127.0.0.1`
 * address, so allowlisting trusted origins rejects the attacker even when their
 * domain resolves to loopback.
 *
 * The `allowedOrigins` list is required to admit browser clients when binding to
 * a wildcard address (`0.0.0.0` / `::`): the bind host is then not a usable
 * origin to compare against, and a reverse-proxy deployment whose public
 * hostname differs from the bind host needs its origin listed explicitly. The
 * list is empty by default, so the loopback-only default behavior is unchanged.
 */
export function isOriginAllowed(
  originHeader: string | undefined,
  bindHost: string,
  allowedOrigins: readonly string[] = []
): boolean {
  // No Origin header => non-browser client. Allow.
  if (originHeader === undefined) {
    return true;
  }
  // The literal "null" origin and empty values are untrusted.
  if (originHeader === 'null' || originHeader.trim() === '') {
    return false;
  }
  let hostname: string;
  try {
    hostname = new URL(originHeader).hostname.toLowerCase();
  } catch {
    // Malformed Origin header.
    return false;
  }
  if (LOOPBACK_HOSTS.has(hostname)) {
    return true;
  }
  if (bindHost.trim() !== '' && hostname === bindHost.trim().toLowerCase()) {
    return true;
  }
  // Explicitly configured origins (compared by host).
  for (const allowed of allowedOrigins) {
    if (parseAllowedOriginHost(allowed) === hostname) {
      return true;
    }
  }
  return false;
}

/**
 * Return the `Origin` value to echo back via CORS headers, or `undefined` when
 * the request is from a non-browser client (no usable Origin). Only call this
 * after isOriginAllowed() has accepted the request, so a returned value is
 * guaranteed to be a trusted origin that is safe to reflect.
 */
export function corsOriginToEcho(originHeader: string | undefined): string | undefined {
  if (originHeader === undefined || originHeader === 'null' || originHeader.trim() === '') {
    return undefined;
  }
  return originHeader;
}

/**
 * Track every accepted TCP socket on `httpServer` so closeHttpServer() can force
 * them closed on shutdown. Long-lived streams (SSE, Streamable HTTP GET) would
 * otherwise keep http.Server.close() pending and the event loop alive.
 */
export function trackSockets(httpServer: http.Server): void {
  const openSockets = new Set<Socket>();
  serverSockets.set(httpServer, openSockets);
  httpServer.on('connection', (socket) => {
    openSockets.add(socket);
    socket.once('close', () => openSockets.delete(socket));
  });
}

/**
 * Close an HTTP server and release its port even when long-lived streams are
 * open. http.Server.close() only stops accepting new connections and waits for
 * existing ones to end on their own; SSE / Streamable HTTP streams are
 * long-lived, so without forcibly destroying open sockets the server never
 * finishes closing and the event loop stays alive (surfacing as the Jest
 * "worker failed to exit gracefully" warning).
 */
export function closeHttpServer(server: http.Server): Promise<void> {
  const destroyOpenConnections = () => {
    const closeAll = (server as { closeAllConnections?: () => void }).closeAllConnections;
    if (typeof closeAll === 'function') {
      closeAll.call(server);
      return;
    }
    // closeAllConnections() was added in Node 18.2. On 18.0/18.1 it is
    // undefined, so destroy the sockets tracked at accept time instead;
    // otherwise close() would hang waiting for active streams to end.
    const openSockets = serverSockets.get(server);
    openSockets?.forEach((socket) => socket.destroy());
  };

  return new Promise((resolve, reject) => {
    if (!server.listening) {
      destroyOpenConnections();
      resolve();
      return;
    }
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    // Destroy lingering sockets so close() can complete promptly.
    destroyOpenConnections();
  });
}
