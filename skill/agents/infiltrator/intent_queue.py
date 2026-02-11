import asyncio
from typing import Any, Dict, List, Optional


class ActionIntentQueue:
    """Persistent priority queue with TTL and expiration metrics."""

    def __init__(self, items: Optional[List[Dict[str, Any]]] = None, max_size: int = 40, default_ttl_sec: int = 90):
        self.max_size = max_size
        self.default_ttl_sec = max(5, int(default_ttl_sec))
        self._queue: List[Dict[str, Any]] = []
        self.metrics: Dict[str, Any] = {
            "enqueued": 0,
            "dequeued": 0,
            "dropped": 0,
            "expired": 0,
            "lastEnqueueAt": None,
            "lastDequeueAt": None,
            "maxDepth": 0
        }
        for item in list(items or []):
            self._restore_item(item)
        self._sort()
        self.metrics["maxDepth"] = len(self._queue)

    def _now_ms(self) -> int:
        return int(asyncio.get_event_loop().time() * 1000)

    def _sort(self) -> None:
        self._queue.sort(key=lambda it: float(it.get("priority", 0.0)), reverse=True)

    def _purge_expired(self) -> None:
        now = self._now_ms()
        kept: List[Dict[str, Any]] = []
        expired = 0
        for item in self._queue:
            expires_at = item.get("expiresAt")
            if isinstance(expires_at, (int, float)) and now > int(expires_at):
                expired += 1
                continue
            kept.append(item)
        if expired:
            self.metrics["expired"] = int(self.metrics.get("expired", 0)) + expired
        self._queue = kept

    def _normalize_item(self, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        action = item.get("action") if isinstance(item.get("action"), dict) else None
        if not action:
            return None
        created_at = int(item.get("createdAt") or self._now_ms())
        ttl_ms = int(item.get("ttlMs") or (self.default_ttl_sec * 1000))
        ttl_ms = max(1000, ttl_ms)
        expires_at = int(item.get("expiresAt") or (created_at + ttl_ms))
        return {
            "action": action,
            "priority": float(item.get("priority", 1.0)),
            "source": str(item.get("source", "plan")),
            "attempts": int(item.get("attempts", 0)),
            "createdAt": created_at,
            "ttlMs": ttl_ms,
            "expiresAt": expires_at
        }

    def _restore_item(self, raw: Dict[str, Any]) -> None:
        if not isinstance(raw, dict):
            return
        if isinstance(raw.get("action"), dict):
            item = self._normalize_item(raw)
        else:
            # Backward compatibility with legacy payloads storing action only
            item = self._normalize_item({"action": raw, "source": "legacy"})
        if item is not None:
            self._queue.append(item)

    def enqueue(self, action: Dict[str, Any], source: str = "plan", priority: float = 1.0, ttl_sec: Optional[int] = None) -> None:
        if not isinstance(action, dict):
            return
        created_at = self._now_ms()
        ttl_ms = int((ttl_sec if isinstance(ttl_sec, (int, float)) else self.default_ttl_sec) * 1000)
        ttl_ms = max(1000, ttl_ms)
        item = {
            "action": action,
            "priority": float(priority),
            "source": source,
            "attempts": 0,
            "createdAt": created_at,
            "ttlMs": ttl_ms,
            "expiresAt": created_at + ttl_ms
        }
        self._queue.append(item)
        self._sort()
        if len(self._queue) > self.max_size:
            overflow = len(self._queue) - self.max_size
            if overflow > 0:
                self._queue = self._queue[:self.max_size]
                self.metrics["dropped"] = int(self.metrics.get("dropped", 0)) + overflow
        self.metrics["enqueued"] = int(self.metrics.get("enqueued", 0)) + 1
        self.metrics["lastEnqueueAt"] = self._now_ms()
        self.metrics["maxDepth"] = max(int(self.metrics.get("maxDepth", 0)), len(self._queue))

    def dequeue(self) -> Optional[Dict[str, Any]]:
        self._purge_expired()
        if not self._queue:
            return None
        item = self._queue.pop(0)
        self.metrics["dequeued"] = int(self.metrics.get("dequeued", 0)) + 1
        self.metrics["lastDequeueAt"] = self._now_ms()
        return item

    def snapshot(self) -> List[Dict[str, Any]]:
        self._purge_expired()
        return self._queue[:self.max_size]

    def depth(self) -> int:
        self._purge_expired()
        return len(self._queue)
