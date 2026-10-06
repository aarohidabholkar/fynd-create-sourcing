import copy
import os

from fastapi import FastAPI, Header, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import derive
from .common import OPS, ApiError
from .db import Store
from .seed import build as build_seed
from . import ops_core, ops_styles, ops_vendors  # noqa: F401  (register operations)

app = FastAPI(title="Fynd Create Sourcing (prototype API)")
store = Store(seed_fn=build_seed)


def _seed_viewer(st):
    """Everyone has viewed every work at yesterday 08:00, so 'updated since your last view' markers are meaningful."""
    from .clock import dt
    for uid in st["users"]:
        st["viewer"].setdefault(uid, {"work_views": {w: {"last_viewed": dt(-1, "08:00"), "previous": None} for w in st["works"]}, "response_reads": {}})


with store.tx() as _s:
    if not _s["viewer"]:
        _seed_viewer(_s)


def serialize(st, user_id):
    """Per-user view of the shared state. Private notes of others and commercial fields are removed server-side."""
    s = copy.deepcopy(st)
    user = s["users"][user_id]
    s["notes"] = {k: n for k, n in s["notes"].items() if n["visibility"] == "posted" or n["author_id"] == user_id}
    s["notifications"] = {k: n for k, n in s["notifications"].items() if n["recipient_id"] == user_id}
    # drafts are visible only to their author
    s["visits"] = {k: v for k, v in s["visits"].items() if v["state"] == "published" or v["author_id"] == user_id}
    if "commercial" not in user["caps"]:
        for q in s["quotes"].values():
            q["restricted"] = True
            q["components"] = []
            q["total"] = None
            q["terms"] = None
        for o in s["orders"].values():
            for l in o["lines"]:
                l["price"] = None
            o["payment_terms"] = None
            o["restricted"] = True
        for r in s["quote_requests"].values():
            r["target_price"] = None
        for v in s["vendors"].values():
            v["indicative_pricing"] = {"text": "Restricted (commercial visibility required)", "currency": None, "basis": None, "date": None}
            v["payment_terms"] = "Restricted"
    s["viewer"] = s["viewer"].get(user_id, {"work_views": {}, "response_reads": {}})
    s.pop("idem", None)
    s["derived"] = derive.build(st, user_id)
    s["derived"]["quote_comparison"] = _compare(st) if "commercial" in user["caps"] else {}
    s["me"] = user_id
    return s


def _compare(st):
    """Like-for-like comparison. Non-comparable inputs are flagged instead of declaring a cheapest winner."""
    out = {}
    for sid in st["styles"]:
        qs = [q for q in st["quotes"].values() if q["style_id"] == sid and q["state"] in ("approved", "received")]
        latest = {}
        for q in qs:
            cur = latest.get(q["vendor_id"])
            if not cur or q["version"] > cur["version"]:
                latest[q["vendor_id"]] = q
        if len(latest) < 2:
            continue
        rows = list(latest.values())
        flags = []
        for field, label in (("qty", "quantity basis"), ("currency", "currency"), ("spec_version", "specification version")):
            if len({r[field] for r in rows}) > 1:
                flags.append(f"Different {label}")
        terms = {(r["terms"] or "").split(";")[0] for r in rows}
        if len(terms) > 1:
            flags.append("Different commercial/logistics terms (" + " vs ".join(sorted(t for t in terms if t)) + ")")
        if any(c["value"] is None for r in rows for c in r["components"]):
            flags.append("Some components are not stated by one or more vendors (unknown is not zero)")
        out[sid] = {"quote_ids": [r["id"] for r in rows], "flags": flags, "comparable": not flags}
    return out


def _user(x_demo_user):
    uid = x_demo_user or "u_head"
    if uid not in store.state["users"]:
        raise ApiError(400, "Unknown demo user.", "validation")
    return uid


@app.exception_handler(ApiError)
async def api_error(_req: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.detail, "code": exc.code, **exc.extra})


@app.get("/api/state")
def get_state(x_demo_user: str | None = Header(default=None)):
    uid = _user(x_demo_user)
    return serialize(store.state, uid)


@app.post("/api/ops/{name}")
async def run_op(name: str, request: Request, x_demo_user: str | None = Header(default=None),
                 x_simulate_failure: str | None = Header(default=None), idempotency_key: str | None = Header(default=None)):
    uid = _user(x_demo_user)
    if name not in OPS:
        raise ApiError(404, "Unknown operation.", "not_found")
    if x_simulate_failure == "1":
        # Demo control: the operation fails before touching any data, so input must be preserved by the client.
        raise ApiError(503, "Simulated failure (demo control). Nothing was saved. Your input has been kept; try again.", "simulated_failure")
    body = await request.json() if await request.body() else {}
    with store.lock:
        idem = store.state.get("idem", {})
        if idempotency_key and idempotency_key in idem:
            return {"result": idem[idempotency_key], "state": serialize(store.state, uid), "duplicate": True}
        with store.tx() as st:
            user = st["users"][uid]
            result = OPS[name](st, user, body) or {}
            if idempotency_key:
                st.setdefault("idem", {})[idempotency_key] = result
    return {"result": result, "state": serialize(store.state, uid)}


def reset_state():
    store.reset()
    with store.tx() as s:
        _seed_viewer(s)


@app.post("/api/demo/reset")
def reset(x_demo_user: str | None = Header(default=None)):
    reset_state()
    return serialize(store.state, _user(x_demo_user))


DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        path = os.path.join(DIST, full_path)
        if full_path and os.path.isfile(path):
            return FileResponse(path)
        return FileResponse(os.path.join(DIST, "index.html"))
