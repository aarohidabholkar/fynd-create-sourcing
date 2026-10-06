"""Shared helpers for operations: errors, ids, events, notifications, permissions, registry."""
from .clock import TODAY, now


class ApiError(Exception):
    def __init__(self, status, detail, code=None, **extra):
        self.status, self.detail, self.code, self.extra = status, detail, code, extra


OPS = {}


def op(name):
    def deco(fn):
        OPS[name] = fn
        return fn
    return deco


def nid(st, prefix):
    st["seq"] += 1
    return f"{prefix}{st['seq']}"


def need(user, cap, msg=None):
    if cap not in user["caps"]:
        raise ApiError(403, msg or f"Your demo role ({user['role']}) does not have permission for this. (Demo permission; no real authority is implied.)", "forbidden")


def get(st, coll, rid, label=None):
    rec = st[coll].get(rid)
    if rec is None:
        raise ApiError(404, f"{label or coll[:-1].capitalize()} not found.", "not_found")
    return rec


def require(body, *fields):
    for f in fields:
        v = body.get(f)
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ApiError(422, f"'{f.replace('_', ' ')}' is required.", "validation", field=f)


def touch(rec):
    rec["rev"] = rec.get("rev", 1) + 1


def check_rev(rec, body):
    """Concurrent-edit protection: refuse silently overwriting a record that changed since the client loaded it."""
    expected = body.get("if_rev")
    if expected is not None and expected != rec.get("rev", 1):
        raise ApiError(409, "This record changed while you were editing it. The latest version has been loaded; review it and try again.",
                       "conflict", current_rev=rec.get("rev", 1))


def add_event(st, actor_id, kind, title, detail="", scope=None, origin="prototype", source_id=None):
    eid = nid(st, "e")
    ev = {"id": eid, "ts": now(), "actor_id": actor_id, "kind": kind, "title": title, "detail": detail, "scope": scope or {},
          "origin": origin, "source_id": source_id}
    st["events"][eid] = ev
    return ev


def notify(st, recipient_id, kind, text, route, exclude=None):
    if recipient_id is None or recipient_id == exclude:
        return None
    nid_ = nid(st, "nt")
    st["notifications"][nid_] = {"id": nid_, "recipient_id": recipient_id, "ts": now(), "kind": kind, "text": text, "route": route,
                                 "read_at": None, "demo": True}
    return nid_


def bump_work(st, wid):
    """Shared 'last meaningful update'. Viewing never calls this."""
    if wid and wid in st["works"]:
        st["works"][wid]["updated_at"] = now()


def person(st, uid):
    u = st["users"].get(uid)
    return f"John Doe ({u['role']})" if u else "Unknown"


def scope_for_action(st, a):
    w = st["works"].get(a.get("work_id")) if a.get("work_id") else None
    sc = {"action_id": a["id"]}
    if w:
        sc.update({"work_id": w["id"], "brand_id": w["brand_id"]})
    if a.get("issue_id"):
        sc["issue_id"] = a["issue_id"]
    if a.get("style_id"):
        sc["style_id"] = a["style_id"]
    if a.get("vendor_id"):
        sc["vendor_id"] = a["vendor_id"]
    return sc


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def action_route(a):
    return f"/my-work?open={a['id']}"


__all__ = ["TODAY"]
