"""Core shared-record operations: actions, update requests, issues, commitments, notes, notifications."""
from .clock import TODAY, now
from .common import (ApiError, action_route, add_event, bump_work, check_rev, get, need, nid, notify, op, person, require,
                     scope_for_action, touch)
from .derive import OPEN


# ---------- viewing ----------
@op("view_work")
def view_work(st, user, body):
    """Per-user last-viewed. Captures the previous viewing point before updating; never touches shared updated_at
    and never marks any response as read."""
    wid = body["work_id"]
    get(st, "works", wid, "Work")
    v = st["viewer"].setdefault(user["id"], {"work_views": {}, "response_reads": {}})
    cur = v["work_views"].get(wid)
    previous = cur["last_viewed"] if cur else None
    v["work_views"][wid] = {"last_viewed": now(), "previous": previous}
    return {"previous": previous}


# ---------- update requests ----------
def _active_request(st, action_id):
    return next((r for r in st["requests"].values() if r["action_id"] == action_id and r["state"] == "awaiting"), None)


@op("request_update")
def request_update(st, user, body):
    require(body, "action_id", "question")
    a = get(st, "actions", body["action_id"], "Action")
    if a["status"] in ("completed", "cancelled"):
        raise ApiError(409, "This action is already closed. Reopen it before requesting an update.", "closed")
    existing = _active_request(st, a["id"])
    if existing:
        raise ApiError(409, f"An update request is already awaiting a response on this action (requested by {person(st, existing['requester_id'])}). Open it instead of creating another.",
                       "duplicate_request", request_id=existing["id"])
    rd = body.get("response_due") or None
    if rd and rd < TODAY:
        raise ApiError(422, "Response due date cannot be in the past.", "validation", field="response_due")
    recipient = body.get("recipient_id") or a["assignee_id"]
    rid = nid(st, "r")
    st["requests"][rid] = {"id": rid, "action_id": a["id"], "requester_id": user["id"], "recipient_id": recipient, "question": body["question"].strip(),
                           "requested_at": now(), "response_due": rd, "state": "awaiting", "response": None, "reminders": [],
                           "requester_read_at": None, "leadership": "Leadership" in user["role"], "withdrawn": None, "recipient_history": []}
    sc = scope_for_action(st, a); sc["request_id"] = rid
    add_event(st, user["id"], "update_requested", f"Update requested · {person(st, recipient)} · Today",
              f"{body['question'].strip()}" + (f" Reply requested by {rd}." if rd else ""), sc)
    notify(st, recipient, "update_requested", f"Update requested on: {a['title']}", action_route(a), exclude=user["id"])
    bump_work(st, a.get("work_id"))
    touch(a)
    return {"request_id": rid}


@op("remind_request")
def remind_request(st, user, body):
    r = get(st, "requests", body["request_id"], "Request")
    if r["state"] != "awaiting":
        raise ApiError(409, "This request has already been answered or closed.", "closed")
    a = st["actions"][r["action_id"]]
    r["reminders"].append({"at": now(), "by": user["id"], "note": body.get("note", "")})
    sc = scope_for_action(st, a); sc["request_id"] = r["id"]
    add_event(st, user["id"], "reminder", "Reminder on the same update request", "", sc)
    notify(st, r["recipient_id"], "reminder", f"Reminder: update requested on {a['title']}", action_route(a), exclude=user["id"])
    return {}


@op("withdraw_request")
def withdraw_request(st, user, body):
    require(body, "request_id", "reason")
    r = get(st, "requests", body["request_id"], "Request")
    if user["id"] != r["requester_id"]:
        need(user, "assign", "Only the requester or someone allowed to assign work can withdraw a request.")
    if r["state"] != "awaiting":
        raise ApiError(409, "This request is not awaiting a response.", "closed")
    r["state"] = "withdrawn"
    r["withdrawn"] = {"by": user["id"], "at": now(), "reason": body["reason"]}
    a = st["actions"][r["action_id"]]
    sc = scope_for_action(st, a); sc["request_id"] = r["id"]
    add_event(st, user["id"], "request_withdrawn", "Update request withdrawn", body["reason"], sc)
    return {}


@op("respond_request")
def respond_request(st, user, body):
    require(body, "request_id", "text")
    r = get(st, "requests", body["request_id"], "Request")
    if user["id"] != r["recipient_id"]:
        raise ApiError(403, "Only the person this request is currently assigned to can respond. If you are covering for them, ask for the action to be reassigned first.", "forbidden")
    if r["state"] != "awaiting":
        raise ApiError(409, "This request has already been answered or closed.", "closed")
    r["state"] = "responded"
    r["response"] = {"by": user["id"], "at": now(), "text": body["text"].strip(), "evidence": (body.get("evidence") or "").strip() or None}
    r["requester_read_at"] = None
    a = st["actions"][r["action_id"]]
    sc = scope_for_action(st, a); sc["request_id"] = r["id"]
    add_event(st, user["id"], "response_received", "Response received on update request",
              "Response recorded. The action and its issue are unchanged until explicitly completed or resolved.", sc)
    for w in st["waiting"].values():
        if w["action_id"] == a["id"] and w["tracker_id"] == r["requester_id"] and w["state"] == "open":
            w["update_received"] = True
            w["latest"] = "Update received. Not yet reviewed."
    route = f"/overview?work={a['work_id']}&action={a['id']}&request={r['id']}" if a.get("work_id") else action_route(a)
    notify(st, r["requester_id"], "response_received", f"New response on: {a['title']}", route, exclude=user["id"])
    bump_work(st, a.get("work_id"))
    return {}


@op("read_response")
def read_response(st, user, body):
    """Called only when the requester actually opens the response content."""
    r = get(st, "requests", body["request_id"], "Request")
    if user["id"] != r["requester_id"]:
        raise ApiError(403, "Only the requester can mark this response as read.", "forbidden")
    if r["state"] != "responded":
        return {}
    r["requester_read_at"] = now()
    v = st["viewer"].setdefault(user["id"], {"work_views": {}, "response_reads": {}})
    v["response_reads"][r["id"]] = now()
    for w in st["waiting"].values():
        if w["action_id"] == r["action_id"] and w["tracker_id"] == user["id"] and w["update_received"]:
            w["update_received"] = False
            w["latest"] = "Response reviewed. Expected output still pending." if w["state"] == "open" else w["latest"]
    return {}


@op("follow_up")
def follow_up(st, user, body):
    """Follow up from My Work/Overview. Internal requests become an UpdateRequest on the existing action;
    external follow-ups are only *logged* (simulated: nothing is sent)."""
    require(body, "action_id", "message")
    a = get(st, "actions", body["action_id"], "Action")
    ch = body.get("channel", "internal_request")
    if ch == "internal_request":
        return request_update(st, user, {"action_id": a["id"], "question": body["message"], "response_due": body.get("response_due"),
                                         "recipient_id": body.get("recipient_id")})
    entry = {"id": nid(st, "fu"), "at": now(), "by": user["id"], "channel": ch, "message": body["message"].strip(), "simulated": True,
             "response_due": body.get("response_due")}
    a.setdefault("followups", []).append(entry)
    sc = scope_for_action(st, a)
    add_event(st, user["id"], "followup_logged", f"Follow-up logged via {ch.replace('_', ' ')} (simulated: no message was sent)",
              body["message"].strip(), sc)
    return {"followup_id": entry["id"]}


# ---------- actions ----------
@op("add_action")
def add_action(st, user, body):
    require(body, "title", "assignee_id")
    if body["assignee_id"] not in st["users"]:
        raise ApiError(422, "Choose a valid assignee.", "validation", field="assignee_id")
    due = body.get("due") or None
    wid = body.get("work_id")
    if wid:
        get(st, "works", wid, "Work")
    aid = nid(st, "a")
    st["actions"][aid] = {"id": aid, "work_id": wid, "issue_id": body.get("issue_id"), "title": body["title"].strip(), "expected_outcome": (body.get("expected_outcome") or "").strip(),
                          "assignee_id": body["assignee_id"], "assignment_confirmed": True, "assigned_at": now(), "due": due, "status": "open", "blocked": None,
                          "requires_review": bool(body.get("requires_review")), "style_id": body.get("style_id"), "vendor_id": body.get("vendor_id"),
                          "sample_round_id": None, "completion": None, "created_at": now(), "origin": "prototype", "source_id": None, "rev": 1}
    if body.get("finding_id"):
        st["actions"][aid]["finding_id"] = body["finding_id"]
    if body.get("issue_id"):
        iss = get(st, "issues", body["issue_id"], "Issue")
        iss["action_ids"].append(aid)
    a = st["actions"][aid]
    add_event(st, user["id"], "action_added", f"Action added: {a['title']}", f"Assigned to {person(st, a['assignee_id'])}" + (f", due {due}" if due else ""),
              scope_for_action(st, a))
    notify(st, a["assignee_id"], "assignment", f"New action assigned: {a['title']}", action_route(a), exclude=user["id"])
    bump_work(st, wid)
    return {"action_id": aid}


@op("reassign_action")
def reassign_action(st, user, body):
    require(body, "action_id", "assignee_id")
    need(user, "assign")
    a = get(st, "actions", body["action_id"], "Action")
    check_rev(a, body)
    if body["assignee_id"] not in st["users"]:
        raise ApiError(422, "Choose a valid assignee.", "validation")
    if a["status"] in ("completed", "cancelled"):
        raise ApiError(409, "Closed actions cannot be reassigned. Reopen the action first.", "closed")
    old = a["assignee_id"]
    if old == body["assignee_id"]:
        return {}
    a["assignee_id"] = body["assignee_id"]
    a["assignment_confirmed"] = True
    a["assigned_at"] = now()
    touch(a)
    sc = scope_for_action(st, a)
    r = _active_request(st, a["id"])
    extra = ""
    if r:
        r.setdefault("recipient_history", []).append({"recipient_id": r["recipient_id"], "until": now()})
        r["recipient_id"] = a["assignee_id"]
        extra = " The pending update request moved with the action; the original request stays in history."
        sc["request_id"] = r["id"]
    add_event(st, user["id"], "reassignment", f"Reassigned: {person(st, old)} → {person(st, a['assignee_id'])}", f"Work owner unchanged.{extra}", sc)
    notify(st, a["assignee_id"], "assignment", f"Action reassigned to you: {a['title']}", action_route(a), exclude=user["id"])
    bump_work(st, a.get("work_id"))
    return {}


def _guard_actor(user, a):
    if user["id"] != a["assignee_id"]:
        need(user, "assign", "Only the assignee, or someone allowed to assign work, can do this.")


@op("complete_action")
def complete_action(st, user, body):
    require(body, "action_id", "outcome")
    a = get(st, "actions", body["action_id"], "Action")
    check_rev(a, body)
    _guard_actor(user, a)
    if a["status"] in ("completed", "cancelled"):
        raise ApiError(409, "This action is already closed.", "closed")
    if a["requires_review"]:
        raise ApiError(409, "This action needs formal review. Use Submit for review; it cannot be completed directly.", "needs_review")
    _complete(st, user, a, body["outcome"].strip(), body.get("evidence"))
    return {}


def _complete(st, user, a, outcome, evidence=None, by=None):
    a["status"] = "completed"
    a["blocked"] = None
    a["completion"] = {"by": by or user["id"], "at": now(), "outcome": outcome, "evidence": evidence}
    touch(a)
    for w in st["waiting"].values():
        if w["action_id"] == a["id"] and w["state"] == "open":
            w["state"] = "closed"
            w["latest"] = "Linked action completed."
    add_event(st, user["id"], "action_completed", f"Action completed: {a['title']}",
              f"{outcome} Related issues and other actions are unchanged.", scope_for_action(st, a))
    bump_work(st, a.get("work_id"))


@op("submit_review")
def submit_review(st, user, body):
    a = get(st, "actions", body["action_id"], "Action")
    _guard_actor(user, a)
    if a["status"] not in ("open", "blocked"):
        raise ApiError(409, "Only an open action can be submitted for review.", "closed")
    if not a["requires_review"]:
        raise ApiError(409, "This action does not require formal review. Use Mark complete.", "validation")
    require(body, "note")
    a["status"] = "awaiting_review"
    a["review"] = {"submitted_by": user["id"], "at": now(), "note": body["note"].strip()}
    touch(a)
    add_event(st, user["id"], "review_submitted", f"Submitted for review: {a['title']}", body["note"].strip(), scope_for_action(st, a))
    for u in st["users"].values():
        if "technical_review" in u["caps"] and u["id"] != user["id"]:
            notify(st, u["id"], "review_requested", f"Review requested: {a['title']}", action_route(a))
    bump_work(st, a.get("work_id"))
    return {}


@op("review_decision")
def review_decision(st, user, body):
    require(body, "action_id", "decision", "comment")
    need(user, "technical_review")
    a = get(st, "actions", body["action_id"], "Action")
    if a["status"] != "awaiting_review":
        raise ApiError(409, "This action is not awaiting review.", "validation")
    if a["review"]["submitted_by"] == user["id"]:
        raise ApiError(403, "You submitted this action; a different reviewer must decide.", "forbidden")
    if body["decision"] == "approve":
        # approval completes the action only if the underlying workflow permits
        rid = a.get("sample_round_id")
        if rid and st["sample_rounds"][rid]["internal"]["state"] != "passed":
            raise ApiError(409, "The linked sample review has not been passed in Sampling. Complete that review first; approval here cannot bypass it.", "gate")
        rc = a.get("requires_recheck_of")
        if rc and not any(i["result"] == "pass" and i.get("recheck_of") == rc for i in st["inspections"].values()):
            raise ApiError(409, "The re-inspection of the failed lot has not been recorded as a pass in Production. Record it there first; approval here cannot release the lot.", "gate")
        _complete(st, user, a, f"Approved by reviewer: {body['comment'].strip()}", None)
    elif body["decision"] == "changes":
        a["status"] = "open"
        a["review"]["changes_requested"] = {"by": user["id"], "at": now(), "comment": body["comment"].strip()}
        touch(a)
        add_event(st, user["id"], "changes_requested", f"Changes requested: {a['title']}", body["comment"].strip(), scope_for_action(st, a))
        notify(st, a["assignee_id"], "changes_requested", f"Changes requested on: {a['title']}", action_route(a), exclude=user["id"])
        bump_work(st, a.get("work_id"))
    else:
        raise ApiError(422, "Decision must be approve or changes.", "validation")
    return {}


@op("block_action")
def block_action(st, user, body):
    require(body, "action_id", "needs", "from_whom")
    a = get(st, "actions", body["action_id"], "Action")
    _guard_actor(user, a)
    a["status"] = "blocked"
    a["blocked"] = {"needs": body["needs"].strip(), "from": body["from_whom"].strip(), "at": now(), "by": user["id"]}
    touch(a)
    add_event(st, user["id"], "blocked", f"Marked blocked: {a['title']}", f"Needs {body['needs'].strip()} from {body['from_whom'].strip()}.", scope_for_action(st, a))
    bump_work(st, a.get("work_id"))
    return {}


@op("unblock_action")
def unblock_action(st, user, body):
    require(body, "action_id", "confirmation")
    a = get(st, "actions", body["action_id"], "Action")
    _guard_actor(user, a)
    if a["status"] != "blocked":
        raise ApiError(409, "This action is not blocked.", "validation")
    a["status"] = "open"
    a["unblocked"] = {"by": user["id"], "at": now(), "confirmation": body["confirmation"].strip()}
    a["blocked"] = None
    touch(a)
    add_event(st, user["id"], "unblocked", f"Unblocked: {a['title']}", f"Confirmed: {body['confirmation'].strip()}", scope_for_action(st, a))
    bump_work(st, a.get("work_id"))
    return {}


@op("reopen_action")
def reopen_action(st, user, body):
    require(body, "action_id", "reason")
    need(user, "reopen")
    a = get(st, "actions", body["action_id"], "Action")
    if a["status"] != "completed":
        raise ApiError(409, "Only completed actions can be reopened.", "validation")
    a.setdefault("completion_history", []).append({**a["completion"], "reopened_by": user["id"], "reopened_at": now(), "reason": body["reason"].strip()})
    a["completion"] = None
    a["status"] = "open"
    touch(a)
    add_event(st, user["id"], "action_reopened", f"Action reopened: {a['title']}", body["reason"].strip(), scope_for_action(st, a))
    notify(st, a["assignee_id"], "reopened", f"Action reopened: {a['title']}", action_route(a), exclude=user["id"])
    bump_work(st, a.get("work_id"))
    return {}


@op("add_comment")
def add_comment(st, user, body):
    require(body, "action_id", "text")
    a = get(st, "actions", body["action_id"], "Action")
    cid = nid(st, "cm")
    st["comments"][cid] = {"id": cid, "action_id": a["id"], "author_id": user["id"], "ts": now(), "text": body["text"].strip()}
    return {"comment_id": cid}


# ---------- issues ----------
@op("resolve_issue")
def resolve_issue(st, user, body):
    require(body, "issue_id", "note")
    if "edit" not in user["caps"] and "assign" not in user["caps"]:
        need(user, "edit")
    i = get(st, "issues", body["issue_id"], "Issue")
    check_rev(i, body)
    if i["state"] != "open":
        raise ApiError(409, "This issue is already resolved.", "validation")
    i["state"] = "resolved"
    i["resolution"] = {"note": body["note"].strip(), "ref": (body.get("ref") or "").strip() or None, "by": user["id"], "at": now()}
    touch(i)
    w = st["works"][i["work_id"]]
    add_event(st, user["id"], "issue_resolved", f"Issue resolved: {i['title']}", body["note"].strip(),
              {"brand_id": w["brand_id"], "work_id": w["id"], "issue_id": i["id"]})
    bump_work(st, w["id"])
    pending = [r for r in st["requests"].values() if r["state"] == "awaiting" and st["actions"][r["action_id"]].get("issue_id") == i["id"]]
    return {"open_requests_remaining": len(pending)}


@op("reopen_issue")
def reopen_issue(st, user, body):
    require(body, "issue_id", "reason")
    need(user, "reopen")
    i = get(st, "issues", body["issue_id"], "Issue")
    if i["state"] != "resolved":
        raise ApiError(409, "Only a resolved issue can be reopened.", "validation")
    i.setdefault("resolution_history", []).append({**i["resolution"], "reopened_by": user["id"], "reopened_at": now(), "reason": body["reason"].strip()})
    i["state"] = "open"
    i["resolution"] = None
    touch(i)
    w = st["works"][i["work_id"]]
    add_event(st, user["id"], "issue_reopened", f"Issue reopened: {i['title']}", body["reason"].strip(),
              {"brand_id": w["brand_id"], "work_id": w["id"], "issue_id": i["id"]})
    bump_work(st, w["id"])
    return {}


# ---------- commitments ----------
@op("propose_commitment")
def propose_commitment(st, user, body):
    require(body, "commitment_id", "date", "reason")
    c = get(st, "commitments", body["commitment_id"], "Commitment")
    c["proposed"] = body["date"]
    c["reason"] = body["reason"].strip()
    c["proposer"] = body.get("proposer") or person(st, user["id"])
    c["state"] = "proposed"
    touch(c)
    w = st["works"][c["work_id"]]
    add_event(st, user["id"], "commitment_proposed", f"Revised date proposed (not agreed): {c['title']} → {body['date']}", body["reason"].strip(),
              {"brand_id": w["brand_id"], "work_id": w["id"], "style_id": c.get("style_id")})
    bump_work(st, w["id"])
    return {}


@op("decide_commitment")
def decide_commitment(st, user, body):
    require(body, "commitment_id", "decision")
    need(user, "assign")
    c = get(st, "commitments", body["commitment_id"], "Commitment")
    check_rev(c, body)
    if not c["proposed"]:
        raise ApiError(409, "There is no pending proposal on this commitment.", "validation")
    w = st["works"][c["work_id"]]
    sc = {"brand_id": w["brand_id"], "work_id": w["id"], "style_id": c.get("style_id")}
    if body["decision"] == "accept":
        require(body, "evidence")
        c.setdefault("revisions", []).append({"was_agreed": c["agreed"], "now_agreed": c["proposed"], "by": user["id"], "at": now(), "evidence": body["evidence"].strip(), "reason": c["reason"]})
        c["agreed"] = c["proposed"]
        c["agreed_evidence"] = body["evidence"].strip()
        c["proposed"] = None
        c["state"] = "agreed"
        add_event(st, user["id"], "commitment_agreed", f"Revised date agreed: {c['title']} → {c['agreed']}", f"Evidence: {body['evidence'].strip()}", sc)
    elif body["decision"] == "reject":
        require(body, "reason")
        c.setdefault("rejected", []).append({"date": c["proposed"], "by": user["id"], "at": now(), "reason": body["reason"].strip()})
        add_event(st, user["id"], "commitment_rejected", f"Revised date not accepted: {c['title']}", body["reason"].strip(), sc)
        c["proposed"] = None
        c["state"] = "agreed" if c["agreed"] else "planned"
    else:
        raise ApiError(422, "Decision must be accept or reject.", "validation")
    touch(c)
    bump_work(st, w["id"])
    return {}


# ---------- notes ----------
def _link_scope(links):
    return {k: v for k, v in links.items() if v}


@op("save_note")
def save_note(st, user, body):
    """Save privately. A private note is a valid personal record; linking does not change visibility."""
    if not (body.get("body") or "").strip() and not body.get("title"):
        raise ApiError(422, "Write something first.", "validation")
    nidv = body.get("note_id")
    if nidv:
        n = get(st, "notes", nidv, "Note")
        if n["author_id"] != user["id"]:
            raise ApiError(403, "Only the author can edit this note.", "forbidden")
        if n["visibility"] == "posted":
            raise ApiError(409, "A posted note is shared content and cannot be edited as a private note. Add a correction or comment instead.", "posted")
        n.update({"title": body.get("title", n["title"]), "body": body.get("body", n["body"]), "links": body.get("links", n["links"]),
                  "event_date": body.get("event_date") or n["event_date"]})
        return {"note_id": nidv}
    nidv = nid(st, "n")
    st["notes"][nidv] = {"id": nidv, "author_id": user["id"], "title": (body.get("title") or "").strip(), "body": (body.get("body") or "").strip(),
                         "visibility": "private", "links": body.get("links") or {}, "event_date": body.get("event_date") or TODAY, "created_at": now(),
                         "posted_at": None, "posted_to": []}
    return {"note_id": nidv}


@op("post_note")
def post_note(st, user, body):
    """Explicit publication to selected records. One note, one event, many links."""
    require(body, "targets")
    t = body["targets"] or {}
    if not any(t.get(k) for k in ("work_ids", "vendor_ids", "style_ids", "brand_ids")):
        raise ApiError(422, "Choose where this update will appear before posting.", "validation", field="targets")
    if body.get("note_id"):
        n = get(st, "notes", body["note_id"], "Note")
        if n["author_id"] != user["id"]:
            raise ApiError(403, "Only the author can post this note.", "forbidden")
        if n["visibility"] == "posted":
            raise ApiError(409, "This note is already posted.", "posted")
    else:
        if not (body.get("body") or "").strip():
            raise ApiError(422, "Write something first.", "validation")
        n = st["notes"][save_note(st, user, body)["note_id"]]
    works = [get(st, "works", w, "Work") for w in t.get("work_ids", [])]
    brand_ids = set(t.get("brand_ids", [])) | {w["brand_id"] for w in works}
    scope = {"note_id": n["id"], "brand_id": sorted(brand_ids)[0] if brand_ids else None,
             "work_id": works[0]["id"] if works else None, "vendor_id": (t.get("vendor_ids") or [None])[0], "style_id": (t.get("style_ids") or [None])[0],
             "also": {"work_ids": t.get("work_ids", []), "vendor_ids": t.get("vendor_ids", []), "style_ids": t.get("style_ids", []), "brand_ids": sorted(brand_ids)}}
    n["visibility"] = "posted"
    n["posted_at"] = now()
    n["posted_to"] = {"work_ids": t.get("work_ids", []), "vendor_ids": t.get("vendor_ids", []), "style_ids": t.get("style_ids", []), "brand_ids": sorted(brand_ids)}
    n["links"] = {**n["links"], **{k: v[0] for k, v in (("work_id", t.get("work_ids")), ("vendor_id", t.get("vendor_ids")), ("style_id", t.get("style_ids"))) if v}}
    add_event(st, user["id"], "note_posted", f"Update posted: {n['title'] or n['body'][:60]}",
              n["body"] + " (A posted note records a statement; it does not change dates, approve samples or assign work.)", scope)
    for w in works:
        notify(st, w["owner_id"], "note_posted", f"Update posted on {w['title']}", f"/brands/{w['brand_id']}/activity", exclude=user["id"])
        bump_work(st, w["id"])
    return {"note_id": n["id"]}


# ---------- notifications ----------
@op("read_notification")
def read_notification(st, user, body):
    n = get(st, "notifications", body["notification_id"], "Notification")
    if n["recipient_id"] != user["id"]:
        raise ApiError(403, "Not your notification.", "forbidden")
    n["read_at"] = n["read_at"] or now()
    return {}


@op("read_all_notifications")
def read_all_notifications(st, user, body):
    for n in st["notifications"].values():
        if n["recipient_id"] == user["id"] and not n["read_at"]:
            n["read_at"] = now()
    return {}


# ---------- brand linking ----------
@op("link_source")
def link_source(st, user, body):
    require(body, "source_id", "work_id")
    need(user, "edit")
    s = get(st, "sources", body["source_id"], "Source")
    w = get(st, "works", body["work_id"], "Work")
    if w["brand_id"] not in s["brand_ids"]:
        raise ApiError(409, "This conversation belongs to a different brand.", "validation")
    if w["id"] in s["work_ids"]:
        return {}
    s["work_ids"].append(w["id"])
    s["unlinked"] = False
    for e in st["events"].values():
        if e.get("source_id") == s["id"] and not e["scope"].get("work_id") and e["scope"].get("brand_id") == w["brand_id"]:
            e["scope"]["work_id"] = w["id"]      # same event, now linked: no duplicate entry
    add_event(st, user["id"], "source_linked", f"Conversation linked to {w['title']}", "Existing thread linked; no copy created.",
              {"brand_id": w["brand_id"], "work_id": w["id"]})
    bump_work(st, w["id"])
    return {}
