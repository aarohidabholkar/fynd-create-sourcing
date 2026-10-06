"""Vendors: directory, visits (drafts, history), profile review, audits, findings and closure verification."""
import re

from .clock import TODAY, now
from .common import ApiError, add_event, check_rev, get, need, nid, notify, op, person, require, touch


def _norm(n):
    return re.sub(r"[^a-z0-9 ]", "", n.lower()).replace("garments", "").replace("apparels", "").replace("pvt ltd", "").strip()


@op("create_vendor")
def create_vendor(st, user, body):
    need(user, "edit")
    require(body, "name")
    loc_unknown = bool(body.get("location_unknown"))
    if not loc_unknown and not (body.get("location") or "").strip():
        raise ApiError(422, "Enter a location, or tick 'location unknown'.", "validation", field="location")
    n = _norm(body["name"])
    similar = [v for v in st["vendors"].values() if _norm(v["name"]) == n or (n and (n in _norm(v["name"]) or _norm(v["name"]) in n))]
    if similar and not body.get("confirm_distinct"):
        raise ApiError(409, "A similar vendor may already exist. Open the existing record, or confirm this is a different vendor. Similar names are not proof of duplication.",
                       "possible_duplicate", similar=[{"id": v["id"], "name": v["name"], "location": v["location"]} for v in similar])
    vid = nid(st, "v")
    st["vendors"][vid] = {"id": vid, "name": body["name"].strip(), "location": None if loc_unknown else body["location"].strip(), "category": body.get("category") or [],
                          "owner_id": body.get("owner_id"), "suitability": "Not recorded", "limitations": [], "capabilities": [], "moq": None,
                          "capacity": {"text": "Not recorded", "observed_on": None}, "indicative_pricing": {"text": "Not recorded", "currency": None, "basis": None, "date": None},
                          "payment_terms": "Not recorded", "certifications": [], "contacts": [], "factories": [], "created_at": now(), "profile_history": [], "rev": 1}
    add_event(st, user["id"], "vendor_created", f"Vendor added: {body['name'].strip()}", "Profile is incomplete; no audit or visit is required to create a vendor.", {"vendor_id": vid})
    return {"vendor_id": vid}


@op("edit_profile")
def edit_profile(st, user, body):
    need(user, "edit")
    v = get(st, "vendors", body["vendor_id"], "Vendor")
    check_rev(v, body)
    changes = []
    for field, label in (("suitability", "Suitability"), ("payment_terms", "Payment terms"), ("owner_id", "Relationship owner")):
        if field in body.get("fields", {}) and body["fields"][field] != v.get(field):
            changes.append({"field": label, "old": v.get(field), "new": body["fields"][field]})
            v[field] = body["fields"][field]
    if "moq" in body.get("fields", {}):
        new = body["fields"]["moq"]
        if new != v.get("moq"):
            changes.append({"field": "MOQ", "old": v.get("moq"), "new": new})
            v["moq"] = new
    if not changes:
        return {}
    v["profile_history"].append({"id": nid(st, "ph"), "at": now(), "by": user["id"], "changes": changes, "source": "Direct edit"})
    touch(v)
    add_event(st, user["id"], "profile_edit", f"Profile edited: {v['name']}", ", ".join(c["field"] for c in changes), {"vendor_id": v["id"]})
    return {}


# ---------- visits ----------
def _validate_publish(st, vis):
    problems = []
    if not vis.get("date"):
        problems.append("visit date")
    if vis["date"] and vis["date"] > TODAY:
        problems.append("visit date cannot be in the future")
    if not vis.get("factory_id") and not vis.get("unit_unconfirmed"):
        problems.append("factory/unit (or mark 'Unit not confirmed')")
    if not vis.get("attendees") and not vis.get("attendees_not_recorded"):
        problems.append("who visited (or mark 'not recorded')")
    if not (vis.get("observations") or "").strip() and not vis.get("attachments"):
        problems.append("an observation or at least one attachment")
    if problems:
        raise ApiError(422, "To publish, add: " + "; ".join(problems) + ". You can save a draft instead.", "validation", problems=problems)


@op("save_visit")
def save_visit(st, user, body):
    need(user, "edit")
    require(body, "vendor_id")
    v = get(st, "vendors", body["vendor_id"], "Vendor")
    if body.get("factory_id") and st["factories"].get(body["factory_id"], {}).get("vendor_id") != v["id"]:
        raise ApiError(422, "That unit does not belong to this vendor.", "validation")
    atts = []
    for a in body.get("attachments", []):
        if not (a.get("name") or "").strip():
            continue
        atts.append({"id": nid(st, "at"), "kind": a.get("kind", "photo"), "name": a["name"].strip(), "caption": (a.get("caption") or "").strip(), "uploaded_at": now(),
                     "uploaded_by": user["id"], "demo_placeholder": True, "size_note": "Simulated upload; no file is stored in this prototype"})
    if body.get("visit_id"):
        vis = get(st, "visits", body["visit_id"], "Visit")
        if vis["state"] != "draft":
            raise ApiError(409, "This visit is already published. Use Edit to correct it; edits keep a history.", "published")
        if vis["author_id"] != user["id"]:
            raise ApiError(403, "A draft is visible only to its author until published.", "forbidden")
    else:
        vis = {"id": nid(st, "vis"), "vendor_id": v["id"], "followups": [], "audit_id": None, "history": [], "created_at": now(), "author_id": user["id"], "attachments": []}
        st["visits"][vis["id"]] = vis
    vis.update({"factory_id": body.get("factory_id"), "unit_unconfirmed": bool(body.get("unit_unconfirmed")), "date": body.get("date"), "attendees": body.get("attendees") or [],
                "attendees_not_recorded": bool(body.get("attendees_not_recorded")), "observations": (body.get("observations") or "").strip(), "state": "draft",
                "audit_id": body.get("audit_id") or vis.get("audit_id")})
    vis["attachments"] = vis["attachments"] + atts if body.get("visit_id") else atts
    if not body.get("publish"):
        return {"visit_id": vis["id"], "published": False}
    _validate_publish(st, vis)
    vis["state"] = "published"
    vis["published_at"] = now()
    unit = st["factories"][vis["factory_id"]]["name"] if vis.get("factory_id") else "Unit not confirmed"
    for fu in body.get("followups", []):
        if not (fu.get("title") or "").strip():
            continue
        from .ops_core import add_action
        res = add_action(st, user, {"title": fu["title"], "assignee_id": fu.get("assignee_id") or user["id"], "due": fu.get("due"), "vendor_id": v["id"]})
        vis["followups"].append({"id": nid(st, "vf"), "action_id": res["action_id"]})
    add_event(st, user["id"], "visit_published", f"Visit recorded: {v['name']} · {unit}", f"{vis['date']} · {len(vis['attachments'])} attachment(s). Profile unchanged until changes are reviewed.",
              {"vendor_id": v["id"], "visit_id": vis["id"]})
    proposals = [p for p in st["profile_proposals"].values() if p["visit_id"] == vis["id"] and p["state"] == "pending"]
    return {"visit_id": vis["id"], "published": True, "proposals": len(proposals)}


@op("edit_visit")
def edit_visit(st, user, body):
    need(user, "edit")
    vis = get(st, "visits", body["visit_id"], "Visit")
    if vis["state"] != "published":
        raise ApiError(409, "Edit drafts through Continue draft.", "validation")
    check_rev(vis, body)
    require(body, "reason")
    changes = []
    f = body.get("fields", {})
    if "observations" in f and f["observations"].strip() != vis["observations"]:
        changes.append({"field": "Observations", "old": vis["observations"], "new": f["observations"].strip()})
        vis["observations"] = f["observations"].strip()
    if "date" in f and f["date"] != vis["date"]:
        if f["date"] > TODAY:
            raise ApiError(422, "Visit date cannot be in the future.", "validation")
        changes.append({"field": "Visit date", "old": vis["date"], "new": f["date"]})
        vis["date"] = f["date"]
    if "factory_id" in f and f["factory_id"] != vis.get("factory_id"):
        changes.append({"field": "Factory/unit", "old": vis.get("factory_id") or "Unit not confirmed", "new": f["factory_id"] or "Unit not confirmed"})
        vis["factory_id"] = f["factory_id"]
    for cap in f.get("captions", []):
        att = next((a for a in vis["attachments"] if a["id"] == cap["id"]), None)
        if att and (cap.get("caption") or "") != att["caption"]:
            changes.append({"field": f"Caption: {att['name']}", "old": att["caption"] or "(none)", "new": cap["caption"]})
            att["caption"] = cap["caption"]
    added = []
    for a in body.get("add_attachments", []):
        if (a.get("name") or "").strip():
            at = {"id": nid(st, "at"), "kind": a.get("kind", "photo"), "name": a["name"].strip(), "caption": (a.get("caption") or "").strip(), "uploaded_at": now(),
                  "uploaded_by": user["id"], "demo_placeholder": True, "size_note": "Simulated upload; no file is stored in this prototype"}
            vis["attachments"].append(at)
            added.append(at["name"])
    if added:
        changes.append({"field": "Attachments", "old": f"{len(vis['attachments']) - len(added)} file(s)", "new": f"added {', '.join(added)}"})
    if not changes:
        raise ApiError(422, "Nothing was changed.", "validation")
    vis["history"].append({"id": nid(st, "vh"), "ts": now(), "editor_id": user["id"], "changes": changes, "reason": body["reason"].strip()})
    touch(vis)
    add_event(st, user["id"], "visit_edited", f"Visit corrected (same record): {st['vendors'][vis['vendor_id']]['name']} · {vis['date']}", body["reason"].strip(),
              {"vendor_id": vis["vendor_id"], "visit_id": vis["id"]})
    return {}


@op("discard_draft")
def discard_draft(st, user, body):
    vis = get(st, "visits", body["visit_id"], "Visit")
    if vis["state"] != "draft" or vis["author_id"] != user["id"]:
        raise ApiError(403, "Only the author can discard their own draft.", "forbidden")
    del st["visits"][vis["id"]]
    return {}


@op("decide_profile_change")
def decide_profile_change(st, user, body):
    need(user, "edit")
    p = get(st, "profile_proposals", body["proposal_id"], "Proposal")
    if p["state"] != "pending":
        raise ApiError(409, "Already decided.", "validation")
    v = st["vendors"][p["vendor_id"]]
    if body["decision"] == "skip":
        p["state"] = "skipped"
        return {}
    cap = next((c for c in v["capabilities"] if c["id"] == p.get("capability_id")), None)
    if cap and body.get("if_current") is not None and body["if_current"] != cap["state"]:
        raise ApiError(409, "This capability changed since the proposal was made. Review the current value.", "conflict")
    old = cap["state"] if cap else None
    if cap:
        cap["state"] = "planned"
        cap["basis"] = "planned"
    p["state"] = "applied"
    v["profile_history"].append({"id": nid(st, "ph"), "at": now(), "by": user["id"], "source": f"Visit {p['visit_id']}", "changes": [{"field": p["field"], "old": old, "new": p["proposed"]}]})
    touch(v)
    add_event(st, user["id"], "profile_change", f"Profile updated: {p['field']}", f"From visit {p['visit_id']}. Marked planned, not available.", {"vendor_id": v["id"], "visit_id": p["visit_id"]})
    return {}


# ---------- audits & findings ----------
@op("record_audit")
def record_audit(st, user, body):
    need(user, "edit")
    require(body, "vendor_id", "date", "auditor", "scope")
    v = get(st, "vendors", body["vendor_id"], "Vendor")
    fid = body.get("factory_id")
    if not fid and not body.get("unit_unconfirmed"):
        raise ApiError(422, "Choose the assessed unit, or mark it 'Unit not confirmed'.", "validation", field="factory_id")
    state = "recorded" if (body.get("outcome") or "").strip() else ("pending_review" if body.get("outcome_state") == "pending_review" else "not_recorded")
    aid = nid(st, "au")
    st["audits"][aid] = {"id": aid, "vendor_id": v["id"], "factory_id": fid, "date": body["date"], "report_date": body.get("report_date"), "uploaded_at": now(), "auditor": body["auditor"],
                         "type": body.get("type", "Technical systems assessment"), "scope": body["scope"].strip(), "outcome": (body.get("outcome") or "").strip() or None, "outcome_state": state,
                         "report": body.get("report"), "reported_totals": body.get("reported_totals"), "capture_complete": False, "requires_reaudit": bool(body.get("requires_reaudit")),
                         "visit_id": body.get("visit_id"), "not_assessed": body.get("not_assessed", []), "reassessment_of": body.get("reassessment_of")}
    if body.get("visit_id") and body["visit_id"] in st["visits"]:
        st["visits"][body["visit_id"]]["audit_id"] = aid
    add_event(st, user["id"], "audit_recorded", f"Audit recorded: {v['name']}" + (" (reassessment; original report unchanged)" if body.get("reassessment_of") else ""),
              f"Outcome as written: {st['audits'][aid]['outcome'] or 'Outcome not recorded'}. Findings capture incomplete until reviewed.", {"vendor_id": v["id"], "audit_id": aid})
    return {"audit_id": aid}


@op("add_finding")
def add_finding(st, user, body):
    need(user, "edit")
    require(body, "audit_id", "section", "description", "severity", "corrective_action")
    a = get(st, "audits", body["audit_id"], "Audit")
    fid = nid(st, "f")
    st["findings"][fid] = {"id": fid, "audit_id": a["id"], "vendor_id": a["vendor_id"], "factory_id": a["factory_id"], "section": body["section"], "checkpoint": body.get("checkpoint", ""),
                           "description": body["description"].strip(), "severity": body["severity"], "evidence": body.get("evidence", []), "corrective_action": body["corrective_action"].strip(),
                           "vendor_responsible": body.get("vendor_responsible", "Not recorded"), "internal_owner_id": body.get("internal_owner_id"), "target": body.get("target", "Not recorded"),
                           "target_date": body.get("target_date"), "state": "open", "action_id": None, "submissions": [], "history": [], "requires_reaudit": bool(body.get("requires_reaudit"))}
    if body.get("create_action") and body.get("internal_owner_id"):
        from .ops_core import add_action
        res = add_action(st, user, {"title": f"Close audit finding: {body['description'][:60]}", "assignee_id": body["internal_owner_id"], "due": body.get("target_date"),
                                    "vendor_id": a["vendor_id"], "finding_id": fid})
        st["findings"][fid]["action_id"] = res["action_id"]
    return {"finding_id": fid}


@op("mark_capture_complete")
def mark_capture_complete(st, user, body):
    need(user, "edit")
    a = get(st, "audits", body["audit_id"], "Audit")
    a["capture_complete"] = True
    add_event(st, user["id"], "capture_complete", "Findings capture marked complete after review", "", {"vendor_id": a["vendor_id"], "audit_id": a["id"]})
    return {}


@op("submit_closure")
def submit_closure(st, user, body):
    require(body, "finding_id", "note")
    f = get(st, "findings", body["finding_id"], "Finding")
    if f["state"] not in ("open", "reopened"):
        raise ApiError(409, "This finding is not open for a new closure submission.", "validation")
    atts = [a for a in body.get("attachments", []) if (a.get("name") or "").strip()]
    if not atts and not body.get("existing_evidence"):
        raise ApiError(422, "Closure needs a supporting attachment or a reference to existing evidence.", "validation", field="attachments")
    f["submissions"].append({"id": nid(st, "sub"), "ts": now(), "by": user["id"], "note": body["note"].strip(),
                             "attachments": [{"name": a["name"].strip(), "demo_placeholder": True} for a in atts], "existing_evidence": body.get("existing_evidence"), "response": None})
    f["state"] = "awaiting_verification"
    a = st["audits"][f["audit_id"]]
    add_event(st, user["id"], "closure_submitted", f"Closure evidence submitted: {f['section']} ({f['id']})", body["note"].strip() + " Submission is not verification.",
              {"vendor_id": f["vendor_id"], "audit_id": a["id"], "finding_id": f["id"]})
    for u in st["users"].values():
        if "verify_closure" in u["caps"]:
            notify(st, u["id"], "review_requested", f"Closure evidence to review: {f['section']}", f"/vendors/{f['vendor_id']}/audits?finding={f['id']}", exclude=user["id"])
    return {}


@op("verify_closure")
def verify_closure(st, user, body):
    need(user, "verify_closure")
    require(body, "finding_id", "decision", "note")
    f = get(st, "findings", body["finding_id"], "Finding")
    if f["state"] != "awaiting_verification":
        raise ApiError(409, "There is no closure submission awaiting verification.", "validation")
    sub = f["submissions"][-1]
    a = st["audits"][f["audit_id"]]
    sc = {"vendor_id": f["vendor_id"], "audit_id": a["id"], "finding_id": f["id"]}
    if body["decision"] == "verify":
        if f["requires_reaudit"] and not any(x.get("reassessment_of") == a["id"] for x in st["audits"].values()):
            raise ApiError(409, "This finding requires a re-audit. Uploading evidence cannot bypass it: record a linked reassessment first.", "reaudit_required")
        f["state"] = "verified_closed"
        sub["response"] = {"by": user["id"], "at": now(), "decision": "verified", "note": body["note"].strip()}
        f["verified"] = {"by": user["id"], "at": now(), "note": body["note"].strip()}
        add_event(st, user["id"], "closure_verified", f"Finding closure verified: {f['section']}", body["note"].strip() + f" The audit's recorded outcome ('{a['outcome']}') is unchanged.", sc)
    elif body["decision"] == "more_evidence":
        f["state"] = "open"
        sub["response"] = {"by": user["id"], "at": now(), "decision": "more_evidence", "note": body["note"].strip()}
        add_event(st, user["id"], "more_evidence", f"More evidence requested: {f['section']}", body["note"].strip(), sc)
        fo = f.get("internal_owner_id")
        notify(st, fo, "more_evidence", f"More evidence requested on finding {f['section']}", f"/vendors/{f['vendor_id']}/audits?finding={f['id']}", exclude=user["id"])
    else:
        raise ApiError(422, "Decision must be verify or more_evidence.", "validation")
    return {}


@op("reopen_finding")
def reopen_finding(st, user, body):
    need(user, "reopen")
    require(body, "finding_id", "reason")
    f = get(st, "findings", body["finding_id"], "Finding")
    if f["state"] != "verified_closed":
        raise ApiError(409, "Only a verified-closed finding can be reopened.", "validation")
    f["history"].append({"verified": f.get("verified"), "reopened_by": user["id"], "reopened_at": now(), "reason": body["reason"].strip()})
    f["state"] = "reopened"
    f["verified"] = None
    add_event(st, user["id"], "finding_reopened", f"Finding reopened (same ID): {f['section']}", body["reason"].strip(),
              {"vendor_id": f["vendor_id"], "audit_id": f["audit_id"], "finding_id": f["id"]})
    return {}
