"""
Cross-cutting resilience helpers shared by every external-data adapter.

Three problems this module solves, all observed in production logs:

  1. **Repeated hammering of a dead provider.** When yfinance starts returning
     429, or Finnhub returns 403 on a paid-only endpoint, or Alpha Vantage
     exhausts its 25/day cap, the fallback chain used to re-hit that provider for
     *every* symbol — turning one outage into hundreds of doomed requests. The
     ``CircuitBreaker`` opens after a few consecutive failures and short-circuits
     subsequent calls for a cooldown window, then probes again (half-open).

  2. **Connection-pool exhaustion.** yfinance creates its own ``requests``
     session with a tiny urllib3 pool (default 10), so concurrent scans logged
     "Connection pool is full, discarding connection". ``get_yf_session`` hands
     yfinance a single shared session with a pool sized to our concurrency.

  3. **No HTTP connection reuse for REST providers.** Each Finnhub / Alpha
     Vantage / StockTwits call built a brand-new ``httpx.AsyncClient``.
     ``get_async_client`` returns one pooled client per provider.

Everything degrades gracefully: a tripped breaker simply raises
``ProviderUnavailable`` so the caller falls through to the next provider in the
chain (and ultimately to mock data), exactly as a network error would.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

import httpx

from app.core.logging import get_logger

log = get_logger("adapters.resilience")


class ProviderUnavailable(RuntimeError):
    """Raised when a circuit breaker is open, so the chain skips this provider."""


@dataclass
class CircuitBreaker:
    """A minimal, thread-safe circuit breaker.

    States: closed (normal) -> open (skip, after ``fail_threshold`` consecutive
    failures) -> half-open (one probe allowed after ``cooldown`` seconds). A
    success while half-open closes it; a failure re-opens it.
    """

    name: str
    fail_threshold: int = 3
    cooldown: float = 120.0           # seconds a provider stays "open"
    _failures: int = field(default=0, init=False)
    _opened_at: float | None = field(default=None, init=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False)

    def allow(self) -> bool:
        """Return True if a call may proceed; False if the breaker is open."""
        with self._lock:
            if self._opened_at is None:
                return True
            if time.monotonic() - self._opened_at >= self.cooldown:
                # Cooldown elapsed -> allow a single half-open probe.
                return True
            return False

    def record_success(self) -> None:
        with self._lock:
            if self._opened_at is not None:
                log.info("circuit.close", provider=self.name)
            self._failures = 0
            self._opened_at = None

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            if self._failures >= self.fail_threshold and self._opened_at is None:
                self._opened_at = time.monotonic()
                log.warning(
                    "circuit.open", provider=self.name,
                    failures=self._failures, cooldown=self.cooldown,
                )

    def trip(self, cooldown: float | None = None) -> None:
        """Force the breaker open immediately (e.g. a daily quota was hit)."""
        with self._lock:
            self._opened_at = time.monotonic()
            self._failures = max(self._failures, self.fail_threshold)
            if cooldown is not None:
                self.cooldown = cooldown
            log.warning("circuit.trip", provider=self.name, cooldown=self.cooldown)

    def guard(self) -> None:
        """Raise ProviderUnavailable if the breaker is open. Call before work."""
        if not self.allow():
            raise ProviderUnavailable(f"{self.name} circuit open")


# --- Shared registry of breakers so all instances of a provider share state ---
_breakers: dict[str, CircuitBreaker] = {}
_breakers_lock = threading.Lock()


def get_breaker(name: str, **kwargs) -> CircuitBreaker:
    with _breakers_lock:
        b = _breakers.get(name)
        if b is None:
            b = CircuitBreaker(name=name, **kwargs)
            _breakers[name] = b
        return b


def is_rate_limit_error(exc: Exception) -> bool:
    """Best-effort classifier for 429 / quota errors across libraries."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 403)
    text = str(exc).lower()
    return "429" in text or "too many requests" in text or "rate limit" in text


# --- Shared yfinance session (large connection pool, real browser UA) ---
_yf_session = None
_yf_session_lock = threading.Lock()


def get_yf_session(pool_size: int = 20):
    """Return a process-wide ``requests.Session`` for yfinance with a pool large
    enough for our scan concurrency, eliminating "connection pool is full"."""
    global _yf_session
    with _yf_session_lock:
        if _yf_session is None:
            import requests
            from requests.adapters import HTTPAdapter

            class _TimeoutHTTPAdapter(HTTPAdapter):
                """requests has no session-wide timeout -- it must be passed
                per-call, and yfinance's internal calls through this session
                don't pass one. A stalled connection (common hitting Yahoo
                from a shared cloud IP) then hangs the underlying socket
                forever. Since this runs inside asyncio.to_thread, an
                asyncio-level timeout on the caller doesn't help either: it
                only stops *waiting* on the thread, the thread itself (and
                its blocked socket) is never released back to the pool. This
                enforces a real timeout at the transport layer so the call
                actually raises and the thread actually returns."""

                def __init__(self, *args, timeout=8, **kwargs):
                    self._default_timeout = timeout
                    super().__init__(*args, **kwargs)

                def send(self, request, **kwargs):
                    if kwargs.get("timeout") is None:
                        kwargs["timeout"] = self._default_timeout
                    return super().send(request, **kwargs)

            s = requests.Session()
            s.headers.update({
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0 Safari/537.36"
                )
            })
            adapter = _TimeoutHTTPAdapter(
                pool_connections=pool_size,
                pool_maxsize=pool_size,
                max_retries=0,           # we do our own backoff
            )
            s.mount("https://", adapter)
            s.mount("http://", adapter)
            _yf_session = s
        return _yf_session


# --- Shared httpx clients, one per provider name (connection reuse) ---
_async_clients: dict[str, httpx.AsyncClient] = {}
_async_clients_lock = threading.Lock()


def get_async_client(name: str, timeout: float = 10.0) -> httpx.AsyncClient:
    """Return a pooled httpx.AsyncClient for a given provider name."""
    with _async_clients_lock:
        c = _async_clients.get(name)
        if c is None or c.is_closed:
            c = httpx.AsyncClient(
                timeout=timeout,
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
            _async_clients[name] = c
        return c


async def aclose_clients() -> None:
    """Close all shared async clients (call on app shutdown)."""
    with _async_clients_lock:
        clients = list(_async_clients.values())
        _async_clients.clear()
    for c in clients:
        try:
            await c.aclose()
        except Exception:
            pass
