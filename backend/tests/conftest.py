import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ["FCS_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402


@pytest.fixture()
def api():
    main.reset_state()
    c = TestClient(main.app)

    class Api:
        def get(self, user="u_head"):
            return c.get("/api/state", headers={"X-Demo-User": user}).json()

        def op(self, name, body=None, user="u_head", expect=200, key=None, fail=False):
            h = {"X-Demo-User": user}
            if key:
                h["Idempotency-Key"] = key
            if fail:
                h["X-Simulate-Failure"] = "1"
            r = c.post(f"/api/ops/{name}", json=body or {}, headers=h)
            assert r.status_code == expect, f"{name}: {r.status_code} {r.text}"
            return r.json()

    return Api()
