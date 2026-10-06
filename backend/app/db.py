"""SQLite-backed store. The whole (small) demo dataset is one JSON document with a
revision counter; every mutation runs on a copy and is committed atomically."""
import copy
import json
import os
import sqlite3
import threading
from contextlib import contextmanager

DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "app.db")


class Store:
    def __init__(self, path=None, seed_fn=None):
        self.path = path or os.environ.get("FCS_DB", DEFAULT_PATH)
        self.seed_fn = seed_fn
        self.lock = threading.RLock()
        self.state = None
        self._init()

    def _conn(self):
        return sqlite3.connect(self.path)

    def _init(self):
        if self.path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
        with self._conn() as c:
            c.execute("create table if not exists kv (k text primary key, v text not null)")
            row = c.execute("select v from kv where k='state'").fetchone()
        if row:
            self.state = json.loads(row[0])
        else:
            self.reset()

    def _persist(self, state):
        with self._conn() as c:
            c.execute("insert or replace into kv (k, v) values ('state', ?)", (json.dumps(state),))

    def reset(self):
        with self.lock:
            self.state = self.seed_fn()
            self.state["meta"]["rev"] = 1
            self._persist(self.state)

    @contextmanager
    def tx(self):
        """Mutate a copy; commit only if the block completes without raising."""
        with self.lock:
            working = copy.deepcopy(self.state)
            yield working
            working["meta"]["rev"] += 1
            self._persist(working)
            self.state = working
