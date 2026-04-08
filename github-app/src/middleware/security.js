import crypto from "crypto";

/**
 * Security middleware stack.
 *
 * Applied to all routes except the GitHub/GitLab webhook endpoints
 * (those have their own signature verification).
 */

// ── Rate limiting ─────────────────────────────────────────────────────────────

const requestCounts = new Map(); // ip -> { count, resetAt }
const WINDOW_MS = 60_000;        // 1 minute window
const MAX_REQUESTS = 100;        // per IP per window

export function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: "Too many requests",
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
  }

  next();
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestCounts.entries()) {
    if (now > entry.resetAt) requestCounts.delete(ip);
  }
}, 5 * 60_000);

// ── Secure HTTP headers ───────────────────────────────────────────────────────

export function secureHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'none'; object-src 'none'"
  );
  // Remove server fingerprinting
  res.removeHeader("X-Powered-By");
  next();
}

// ── Dashboard API authentication ──────────────────────────────────────────────

/**
 * Simple bearer token auth for the dashboard API.
 * In production, replace with a proper JWT or OAuth2 flow.
 */
export function requireApiKey(req, res, next) {
  const apiKey = process.env.DASHBOARD_API_KEY;

  // If no key is configured, skip auth (development mode)
  if (!apiKey) return next();

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authorization header required" });
  }

  // Constant-time comparison to prevent timing attacks
  const expectedBuf = Buffer.from(apiKey, "utf8");
  const actualBuf = Buffer.from(token, "utf8");

  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  next();
}

// ── Request logging ───────────────────────────────────────────────────────────

export function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, url, ip } = req;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" :
                  res.statusCode >= 400 ? "WARN" : "INFO";
    console.log(`[${level}] ${method} ${url} ${res.statusCode} ${duration}ms ip=${ip}`);
  });

  next();
}

// ── Error handler ─────────────────────────────────────────────────────────────

export function errorHandler(err, req, res, _next) {
  console.error("Unhandled error:", err);

  // Don't leak internal error details in production
  const isDev = process.env.NODE_ENV !== "production";

  res.status(err.status || 500).json({
    error: isDev ? err.message : "Internal server error",
    ...(isDev && { stack: err.stack }),
  });
}
