"""Styles: specs, costing, sampling, orders, production, inspections, shipments; plus brand-level selection."""
from .clock import TODAY, now
from .common import ApiError, add_event, bump_work, get, is_int, need, nid, notify, op, person, require, touch
from .derive import active_requests_for_style, allocation_summary, clearance_for, order_total, style_readiness

SIZES = ["S", "M", "L", "XL"]


def _style_scope(st, s, **extra):
    sc = {"brand_id": s["brand_id"], "work_id": s["work_id"], "style_id": s["id"]}
    sc.update(extra)
    return sc


# ---------- style creation / drafts / specification ----------
@op("create_style")
def create_style(st, user, body):
    need(user, "edit")
    require(body, "brand_id", "name", "category")
    get(st, "brands", body["brand_id"], "Brand")
    dup = [s for s in st["styles"].values() if s["brand_id"] == body["brand_id"] and s["name"].strip().lower() == body["name"].strip().lower()]
    if dup and not body.get("confirm_not_duplicate"):
        raise ApiError(409, f"A style named '{dup[0]['name']}' already exists for this brand ({dup[0]['id']}). Open it, or confirm this is a different style.",
                       "possible_duplicate", style_id=dup[0]["id"])
    sid = nid(st, "s")
    st["styles"][sid] = {"id": sid, "brand_id": body["brand_id"], "work_id": body.get("work_id"), "name": body["name"].strip(), "category": body["category"].strip(),
                         "season": body.get("season", ""), "owner_id": user["id"], "lifecycle": "draft", "created_at": now(), "description": body.get("description", ""),
                         "image": None, "spec_versions": [], "bom": {"version": 1, "items": []}, "pom": [], "files": [], "selection": None, "owner_history": []}
    if body.get("work_id"):
        w = get(st, "works", body["work_id"], "Work")
        w["style_ids"].append(sid)
    add_event(st, user["id"], "style_created", f"Style created (draft): {body['name'].strip()}", "Draft until required inputs are added.", _style_scope(st, st["styles"][sid]))
    return {"style_id": sid}


@op("import_styles")
def import_styles(st, user, body):
    """Bulk import: valid rows become drafts, errors surface per row, nothing valid is lost."""
    need(user, "edit")
    require(body, "brand_id")
    created, errors = [], []
    for idx, row in enumerate(body.get("rows", []), start=1):
        name, cat = (row.get("name") or "").strip(), (row.get("category") or "").strip()
        problems = []
        if not name:
            problems.append("name is missing")
        if not cat:
            problems.append("category is missing")
        if name and any(s["brand_id"] == body["brand_id"] and s["name"].lower() == name.lower() for s in st["styles"].values()):
            problems.append("possible duplicate of an existing style")
        if problems:
            errors.append({"row": idx, "name": name, "problems": problems})
            continue
        r = create_style(st, user, {"brand_id": body["brand_id"], "name": name, "category": cat, "work_id": body.get("work_id"), "season": row.get("season", "")})
        created.append(r["style_id"])
    return {"created": created, "errors": errors}


def _locks(st, sid):
    return active_requests_for_style(st, sid)


@op("set_bom")
def set_bom(st, user, body):
    need(user, "edit")
    require(body, "style_id")
    s = get(st, "styles", body["style_id"], "Style")
    locks = _locks(st, s["id"])
    if locks and s["bom"]["items"]:
        raise ApiError(409, "The BOM is locked while these requests are active: " + ", ".join(f"{l['id']} ({l['kind']})" for l in locks) +
                       ". Operational updates, comments and evidence remain possible.", "locked", locks=locks)
    items = []
    for it in body.get("items", []):
        if not (it.get("name") or "").strip():
            raise ApiError(422, "Every BOM row needs a name.", "validation")
        c = it.get("consumption")
        if c in (None, "") or float(c) < 0:
            raise ApiError(422, f"Consumption is required for '{it['name']}' (unknown is not zero).", "validation")
        items.append({"id": nid(st, "m"), "kind": it.get("kind", "Material"), "name": it["name"].strip(), "consumption": float(c), "unit": it.get("unit", "")})
    if not items:
        raise ApiError(422, "Add at least one BOM item.", "validation")
    s["bom"] = {"version": s["bom"]["version"] + 1, "items": items}
    add_event(st, user["id"], "bom_updated", f"BOM updated to version {s['bom']['version']} on {s['name']}", f"{len(items)} items.", _style_scope(st, s))
    return {}


@op("set_pom")
def set_pom(st, user, body):
    need(user, "edit")
    s = get(st, "styles", body["style_id"], "Style")
    if _locks(st, s["id"]) and s["pom"]:
        raise ApiError(409, "Measurements are locked while requests are active.", "locked", locks=_locks(st, s["id"]))
    rows = []
    for r in body.get("rows", []):
        try:
            tgt, tol = float(r["target"]), float(r["tol"])
        except (KeyError, TypeError, ValueError):
            raise ApiError(422, f"Target and tolerance are required numbers for '{r.get('name', '?')}'.", "validation")
        rows.append({"id": nid(st, "p"), "name": r["name"].strip(), "unit": r.get("unit", "cm"), "target": tgt, "tol": tol, "base_size": r.get("base_size", "M")})
    if not rows:
        raise ApiError(422, "Add at least one measurement point.", "validation")
    s["pom"] = rows
    add_event(st, user["id"], "pom_updated", f"Measurements updated on {s['name']}", f"{len(rows)} points.", _style_scope(st, s))
    return {}


@op("release_spec")
def release_spec(st, user, body):
    need(user, "edit")
    s = get(st, "styles", body["style_id"], "Style")
    require(body, "reason")
    rd = style_readiness(st, s["id"])
    if not rd["sourcing_ready"]["ready"]:
        raise ApiError(409, "A BOM is mandatory before releasing a specification.", "not_ready", missing=rd["sourcing_ready"]["missing"])
    locks = _locks(st, s["id"])
    if locks and s["spec_versions"]:
        raise ApiError(409, "Specification is locked while requests are active.", "locked", locks=locks)
    for v in s["spec_versions"]:
        if v["state"] == "released":
            v["state"] = "superseded"
            v["frozen"] = False
    ver = (max([v["v"] for v in s["spec_versions"]], default=0)) + 1
    s["spec_versions"].append({"v": ver, "state": "released", "date": TODAY, "author_id": user["id"], "reason": body["reason"].strip(), "changed": body.get("changed", []), "frozen": True})
    if s["lifecycle"] == "draft":
        s["lifecycle"] = "active"
    affected = [f"Quote {q['id']} (on spec v{q['spec_version']})" for q in st["quotes"].values() if q["style_id"] == s["id"] and q["spec_version"] < ver and q["state"] in ("approved", "received")]
    affected += [f"Allocation {a['id']}" for a in st["allocations"].values() if a["style_id"] == s["id"]]
    add_event(st, user["id"], "spec_released", f"Specification v{ver} released on {s['name']}", body["reason"].strip() + (" Flagged for review: " + "; ".join(affected) if affected else ""),
              _style_scope(st, s))
    return {"version": ver, "affected": affected}


@op("set_style_owner")
def set_style_owner(st, user, body):
    need(user, "assign")
    require(body, "style_id", "owner_id", "reason")
    s = get(st, "styles", body["style_id"], "Style")
    s["owner_history"].append({"from": s["owner_id"], "to": body["owner_id"], "by": user["id"], "at": now(), "reason": body["reason"].strip()})
    s["owner_id"] = body["owner_id"]
    add_event(st, user["id"], "style_owner_changed", f"Style owner changed on {s['name']}", "Linked tasks are not reassigned automatically.", _style_scope(st, s))
    return {}


@op("select_style")
def select_style(st, user, body):
    need(user, "record_decision")
    require(body, "style_id", "state", "why")
    if body["state"] not in ("selected", "rejected", "held", "dropped"):
        raise ApiError(422, "Invalid selection state.", "validation")
    s = get(st, "styles", body["style_id"], "Style")
    s["selection"] = {"state": body["state"], "by": user["id"], "at": now(), "why": body["why"].strip(), "source": body.get("source") or "Recorded in prototype"}
    if body["state"] == "dropped":
        s["lifecycle"] = "dropped"
    add_event(st, user["id"], "selection", f"{s['name']} marked {body['state']}", body["why"].strip() + " (Selection is not a confirmed order.)", _style_scope(st, s))
    bump_work(st, s["work_id"])
    return {}


# ---------- costing ----------
@op("create_quote_request")
def create_quote_request(st, user, body):
    need(user, "edit")
    require(body, "style_id", "vendor_id", "qty_basis")
    s = get(st, "styles", body["style_id"], "Style")
    rd = style_readiness(st, s["id"])
    if not rd["costing_ready"]["ready"]:
        raise ApiError(409, "This style is not costing-ready.", "not_ready", missing=rd["costing_ready"]["missing"])
    get(st, "vendors", body["vendor_id"], "Vendor")
    rid = nid(st, "qr")
    cur = next((v["v"] for v in s["spec_versions"] if v["state"] == "released"), None)
    st["quote_requests"][rid] = {"id": rid, "style_id": s["id"], "vendor_id": body["vendor_id"], "spec_version": cur, "bom_version": s["bom"]["version"],
                                 "qty_basis": body["qty_basis"], "target_price": body.get("target_price"), "due": body.get("due"), "issued_at": None, "state": "draft",
                                 "owner_id": user["id"], "recipient": None, "simulated_send": False}
    add_event(st, user["id"], "quote_request_draft", f"Costing request drafted for {s['name']}", "Saved as draft; nothing has been sent.", _style_scope(st, s, vendor_id=body["vendor_id"]))
    return {"request_id": rid}


@op("issue_quote_request")
def issue_quote_request(st, user, body):
    need(user, "edit")
    r = get(st, "quote_requests", body["request_id"], "Costing request")
    if r["state"] != "draft":
        raise ApiError(409, "This request has already been issued.", "validation")
    v = st["vendors"][r["vendor_id"]]
    r["issued_at"] = now()
    r["state"] = "issued"
    r["recipient"] = (v["contacts"][0]["name"] if v["contacts"] else "Vendor contact (not recorded)")
    r["simulated_send"] = True
    s = st["styles"][r["style_id"]]
    add_event(st, user["id"], "quote_request_issued", f"Costing request issued to {v['name']} (SIMULATED: nothing was actually sent)",
              f"Snapshot: spec v{r['spec_version']}, BOM v{r['bom_version']}, basis {r['qty_basis']}.", _style_scope(st, s, vendor_id=v["id"]))
    return {}


@op("record_quote")
def record_quote(st, user, body):
    """Record a quote (offline or received). Always a new version; never overwrites an approved quote."""
    need(user, "commercial", "Recording commercial quote details needs commercial visibility (demo permission).")
    require(body, "request_id", "currency", "qty")
    r = get(st, "quote_requests", body["request_id"], "Costing request")
    if r["state"] == "draft":
        raise ApiError(409, "Issue the request first, or record it as received offline by issuing it.", "validation")
    comps = []
    for c in body.get("components", []):
        v = c.get("value")
        comps.append({"label": c["label"], "value": (None if v in (None, "") else float(v)), "unit": c.get("unit", "INR/pc")})
    if not comps:
        raise ApiError(422, "Add at least one cost component.", "validation")
    total = body.get("total")
    if total in (None, ""):
        known = [c["value"] for c in comps if c["value"] is not None]
        if len(known) != len(comps):
            raise ApiError(422, "Some components are unknown; enter the vendor's stated total explicitly. Unknown values are not treated as zero.", "validation", field="total")
        total = sum(known)
    ver = max([q["version"] for q in st["quotes"].values() if q["request_id"] == r["id"]], default=0) + 1
    qid = nid(st, "q")
    st["quotes"][qid] = {"id": qid, "request_id": r["id"], "style_id": r["style_id"], "vendor_id": r["vendor_id"], "version": ver, "spec_version": r["spec_version"],
                         "state": "received", "currency": body["currency"], "qty": int(body["qty"]), "moq": body.get("moq"), "lead_days": body.get("lead_days"),
                         "terms": body.get("terms", ""), "total": float(total), "components": comps, "reason": body.get("reason") or "Quote recorded",
                         "created_at": now(), "author_id": user["id"], "source": body.get("source") or "Recorded manually", "decisions": []}
    r["state"] = "received"
    s = st["styles"][r["style_id"]]
    add_event(st, user["id"], "quote_recorded", f"Quote v{ver} recorded from {st['vendors'][r['vendor_id']]['name']}", body.get("reason") or "",
              _style_scope(st, s, vendor_id=r["vendor_id"], quote_id=qid))
    return {"quote_id": qid}


@op("decide_quote")
def decide_quote(st, user, body):
    require(body, "quote_id", "decision", "kind", "scope", "evidence")
    q = get(st, "quotes", body["quote_id"], "Quote")
    kind = body["kind"]
    if kind == "internal_commercial":
        need(user, "commercial")
    else:
        need(user, "record_decision")
    labels = {"internal_commercial": "Internal commercial approval", "vendor_acceptance": "Vendor quote acceptance", "brand_price": "Brand price acceptance"}
    if kind not in labels:
        raise ApiError(422, "Unknown decision kind.", "validation")
    if body["decision"] not in ("approve", "reject"):
        raise ApiError(422, "Decision must be approve or reject.", "validation")
    q["decisions"].append({"kind": kind, "label": labels[kind] if body["decision"] == "approve" else labels[kind].replace("approval", "rejection").replace("acceptance", "rejection"),
                           "by": user["id"], "at": now(), "scope": body["scope"].strip(), "evidence": body["evidence"].strip(), "outcome": body["decision"]})
    s = st["styles"][q["style_id"]]
    if kind == "internal_commercial":
        if body["decision"] == "approve":
            for other in st["quotes"].values():
                if other["style_id"] == q["style_id"] and other["vendor_id"] == q["vendor_id"] and other["id"] != q["id"] and other["state"] == "approved":
                    other["state"] = "superseded"
            q["state"] = "approved"
        else:
            q["state"] = "rejected"
    add_event(st, user["id"], "quote_decision", f"{labels[kind]}: {body['decision']} · quote v{q['version']} ({st['vendors'][q['vendor_id']]['name']})",
              f"Scope: {body['scope'].strip()}. Evidence: {body['evidence'].strip()}. Other decision types are not implied.", _style_scope(st, s, vendor_id=q["vendor_id"], quote_id=q["id"]))
    return {}


# ---------- sampling ----------
@op("create_sample_request")
def create_sample_request(st, user, body):
    need(user, "edit")
    require(body, "style_id", "vendor_id", "type")
    s = get(st, "styles", body["style_id"], "Style")
    rd = style_readiness(st, s["id"])
    if not rd["sampling_ready"]["ready"]:
        raise ApiError(409, "This style is not sampling-ready.", "not_ready", missing=rd["sampling_ready"]["missing"])
    rid = nid(st, "sq")
    cur = next((v["v"] for v in s["spec_versions"] if v["state"] == "released"), None)
    st["sample_requests"][rid] = {"id": rid, "style_id": s["id"], "vendor_id": body["vendor_id"], "type": body["type"], "spec_version": cur, "owner_id": user["id"],
                                  "due": body.get("due"), "prereq": body.get("prereq"), "state": "active", "colourways": body.get("colourways", []), "sizes": body.get("sizes", [])}
    r1 = nid(st, "sr")
    qty = int(body.get("qty", 1))
    st["sample_rounds"][r1] = _new_round(r1, rid, 1, None, qty)
    add_event(st, user["id"], "sample_requested", f"{body['type']} sample requested from {st['vendors'][body['vendor_id']]['name']}", f"Round 1 · {qty} pcs · spec v{cur}",
              _style_scope(st, s, vendor_id=body["vendor_id"], sample_round_id=r1))
    return {"request_id": rid, "round_id": r1}


def _new_round(rid, req_id, n, prev, qty):
    return {"id": rid, "request_id": req_id, "round": n, "previous_round_id": prev, "requested": qty, "made": 0, "dispatched": 0, "received": 0,
            "dates": {"made": None, "dispatched": None, "received": None}, "tracking": "", "receipts": [], "measurements": [], "comments": [],
            "internal": {"state": "not_started", "draft": False, "by": None, "at": None, "note": ""},
            "external": {"state": "pending", "person_role": None, "recorded_by": None, "date": None, "ref": None, "version": None, "scope": None, "conditions": ""}}


@op("start_next_round")
def start_next_round(st, user, body):
    need(user, "edit")
    prev = get(st, "sample_rounds", body["round_id"], "Sample round")
    req = st["sample_requests"][prev["request_id"]]
    if any(r["previous_round_id"] == prev["id"] for r in st["sample_rounds"].values()):
        raise ApiError(409, "The next round already exists.", "validation")
    n = prev["round"] + 1
    rid = nid(st, "sr")
    new = _new_round(rid, req["id"], n, prev["id"], int(body.get("qty", prev["requested"])))
    # carry unresolved corrections forward with traceable links; the earlier round and its result stay untouched
    for c in prev["comments"]:
        if c["state"] != "verified":
            new["comments"].append({**c, "id": nid(st, "cmt"), "carried_from": c["id"], "state": "open", "verified_by": None, "verified_at": None, "evidence": None})
    st["sample_rounds"][rid] = new
    s = st["styles"][req["style_id"]]
    add_event(st, user["id"], "round_started", f"{req['type']} sample round {n} started ({st['vendors'][req['vendor_id']]['name']})",
              f"Round {prev['round']} result is retained. {len(new['comments'])} open correction(s) carried forward.", _style_scope(st, s, vendor_id=req["vendor_id"], sample_round_id=rid))
    return {"round_id": rid}


@op("record_sample_movement")
def record_sample_movement(st, user, body):
    """made → dispatched → received are separate facts with their own dates and evidence."""
    need(user, "edit")
    require(body, "round_id", "kind", "qty", "date")
    r = get(st, "sample_rounds", body["round_id"], "Sample round")
    req = st["sample_requests"][r["request_id"]]
    s = st["styles"][req["style_id"]]
    q = body["qty"]
    if not is_int(q) or q <= 0:
        raise ApiError(422, "Quantity must be a whole number greater than zero.", "validation", field="qty")
    kind = body["kind"]
    if body["date"] > TODAY:
        raise ApiError(422, "A recorded movement cannot be dated in the future.", "validation", field="date")
    notes = ""
    if kind == "made":
        if r["made"] + q > r["requested"] + 5:
            raise ApiError(422, "That is more than the requested quantity. Check the number.", "validation", field="qty")
        r["made"] += q
        r["dates"]["made"] = body["date"]
    elif kind == "dispatched":
        if r["dispatched"] + q > max(r["made"], r["requested"]):
            raise ApiError(422, "You cannot dispatch more pieces than were made or requested.", "validation", field="qty")
        r["dispatched"] += q
        r["made"] = max(r["made"], r["dispatched"])
        r["dates"]["dispatched"] = body["date"]
        if body.get("tracking"):
            r["tracking"] = body["tracking"]
    elif kind == "received":
        if r["dispatched"] == 0:
            raise ApiError(409, "Nothing has been dispatched on this round yet. A vendor saying a sample is ready is not dispatch; record dispatch first.", "sequence")
        if r["received"] + q > r["dispatched"]:
            raise ApiError(422, f"Only {r['dispatched'] - r['received']} piece(s) are in transit; you cannot receive more.", "validation", field="qty")
        colour, size = body.get("colour"), body.get("size")
        if not colour or not size:
            raise ApiError(422, "Say which colour and size were received (receipt of one piece is not receipt of the whole set).", "validation")
        r["received"] += q
        r["dates"]["received"] = body["date"]
        r["receipts"].append({"colour": colour, "size": size, "qty": q, "date": body["date"], "by": user["id"], "ref": body.get("ref")})
        notes = _after_receipt(st, user, r, req, s, body)
    else:
        raise ApiError(422, "Unknown movement type.", "validation")
    add_event(st, user["id"], f"sample_{kind}", f"{req['type']} sample round {r['round']}: {q} pc(s) {kind} ({st['vendors'][req['vendor_id']]['name']})",
              (body.get("ref") or body.get("tracking") or "") + (" " + notes if notes else "") + " Receipt is not QC or approval.",
              _style_scope(st, s, vendor_id=req["vendor_id"], sample_round_id=r["id"]))
    bump_work(st, s["work_id"])
    return {"message": notes}


def _after_receipt(st, user, r, req, s, body):
    """Connected consequences of a receipt. Review and approval stay separate steps."""
    msgs = []
    full = r["received"] >= r["dispatched"] and r["received"] > 0
    for w in st["waiting"].values():
        a = st["actions"].get(w["action_id"])
        if a and a.get("sample_round_id") == r["id"] and w["state"] == "open":
            w["state"] = "closed"
            w["latest"] = f"Sample received on {body['date']}."
            msgs.append("Waiting item closed.")
    for a in list(st["actions"].values()):
        if a.get("sample_round_id") == r["id"] and a.get("completes_on_receipt") and a["status"] in ("open", "blocked") and full:
            from .ops_core import _complete
            _complete(st, user, a, f"Sample received on {body['date']}; receipt recorded.", None)
            msgs.append(f"Action '{a['title']}' completed (it existed to track this receipt).")
    for c in st["commitments"].values():
        if c.get("sample_round_id") == r["id"] and not c["actual"] and full:
            c["actual"] = body["date"]
            c["state"] = "done"
            c["proposed"] = None
            touch(c)
            msgs.append("Arrival commitment marked actual.")
    return " ".join(msgs)


def _tol_breach(pom, m):
    if m.get("actual") in (None, ""):
        return None
    return abs(float(m["actual"]) - pom["target"]) > pom["tol"] + 1e-9


@op("save_measurements")
def save_measurements(st, user, body):
    need(user, "technical_review")
    r = get(st, "sample_rounds", body["round_id"], "Sample round")
    req = st["sample_requests"][r["request_id"]]
    s = st["styles"][req["style_id"]]
    poms = {p["id"]: p for p in s["pom"]}
    if r["received"] == 0:
        raise ApiError(409, "No pieces have been received on this round, so there is nothing to measure.", "sequence")
    out = []
    for m in body.get("rows", []):
        if m["pom_id"] not in poms:
            raise ApiError(422, "Unknown measurement point.", "validation")
        a = m.get("actual")
        if a in (None, ""):
            a = None
        else:
            try:
                a = float(a)
            except ValueError:
                raise ApiError(422, "Actual values must be numbers; leave blank if not measured (blank is not zero).", "validation")
        out.append({"pom_id": m["pom_id"], "size": m["size"], "colour": m["colour"], "actual": a})
    r["measurements"] = out
    r["internal"]["draft"] = True
    if r["internal"]["state"] == "not_started":
        r["internal"]["state"] = "in_progress"
    return {}


@op("add_correction")
def add_correction(st, user, body):
    need(user, "technical_review")
    require(body, "round_id", "text", "scope")
    r = get(st, "sample_rounds", body["round_id"], "Sample round")
    cid = nid(st, "cmt")
    r["comments"].append({"id": cid, "text": body["text"].strip(), "scope": body["scope"].strip(), "state": "open", "verified_by": None, "verified_at": None, "evidence": None})
    return {"comment_id": cid}


@op("internal_review")
def internal_review(st, user, body):
    need(user, "technical_review")
    require(body, "round_id", "result")
    r = get(st, "sample_rounds", body["round_id"], "Sample round")
    req = st["sample_requests"][r["request_id"]]
    s = st["styles"][req["style_id"]]
    poms = {p["id"]: p for p in s["pom"]}
    res = body["result"]
    if res == "draft":
        r["internal"].update({"state": "in_progress", "draft": True, "note": body.get("note", "")})
        return {}
    if r["received"] == 0:
        raise ApiError(409, "No pieces received on this round; review cannot be completed.", "sequence")
    blanks = [m for m in r["measurements"] if m["actual"] is None]
    breaches = [m for m in r["measurements"] if poms.get(m["pom_id"]) and _tol_breach(poms[m["pom_id"]], m)]
    open_c = [c for c in r["comments"] if c["state"] != "verified"]
    if res == "pass":
        problems = []
        if not r["measurements"]:
            problems.append("No measurements have been recorded.")
        if blanks:
            problems.append(f"{len(blanks)} measurement(s) are blank (blank is not zero).")
        if breaches:
            problems.append(f"{len(breaches)} measurement(s) are out of tolerance.")
        if open_c:
            problems.append(f"{len(open_c)} correction(s) are not verified.")
        if problems:
            raise ApiError(409, "An internal pass needs all applicable checks complete. " + " ".join(problems) + " An exception needs explicit authority and evidence; none is configured in this demo.", "cannot_pass", problems=problems)
        r["internal"] = {"state": "passed", "draft": False, "by": user["id"], "at": now(), "note": body.get("note", "")}
        title = "Internal QC passed"
    elif res == "changes":
        if not [c for c in r["comments"] if c["state"] == "open"] and not breaches:
            raise ApiError(422, "Request corrections needs at least one actionable comment (or an out-of-tolerance measurement).", "validation")
        r["internal"] = {"state": "changes_requested", "draft": False, "by": user["id"], "at": now(), "note": body.get("note", "")}
        title = "Corrections requested"
    else:
        raise ApiError(422, "Unknown result.", "validation")
    add_event(st, user["id"], "internal_review", f"{title}: {req['type']} sample round {r['round']} ({st['vendors'][req['vendor_id']]['name']})",
              (body.get("note") or "") + " Internal QC is not brand approval or release.", _style_scope(st, s, vendor_id=req["vendor_id"], sample_round_id=r["id"]))
    bump_work(st, s["work_id"])
    return {}


@op("verify_correction")
def verify_correction(st, user, body):
    need(user, "technical_review")
    require(body, "round_id", "comment_id", "evidence")
    r = get(st, "sample_rounds", body["round_id"], "Sample round")
    c = next((c for c in r["comments"] if c["id"] == body["comment_id"]), None)
    if not c:
        raise ApiError(404, "Correction not found.", "not_found")
    c.update({"state": "verified", "verified_by": user["id"], "verified_at": now(), "evidence": body["evidence"].strip()})
    req = st["sample_requests"][r["request_id"]]
    add_event(st, user["id"], "correction_verified", f"Correction verified on round {r['round']}", f"{c['text']} Evidence: {c['evidence']}",
              _style_scope(st, st["styles"][req["style_id"]], vendor_id=req["vendor_id"], sample_round_id=r["id"]))
    return {}


@op("record_external_decision")
def record_external_decision(st, user, body):
    need(user, "record_decision")
    require(body, "round_id", "decision", "person_role", "date", "ref", "scope")
    if body["decision"] not in ("approved", "rejected", "approved_with_comments"):
        raise ApiError(422, "Invalid decision.", "validation")
    if body["decision"] == "approved_with_comments":
        require(body, "conditions")
    r = get(st, "sample_rounds", body["round_id"], "Sample round")
    if r["received"] == 0:
        raise ApiError(409, "No pieces have been received on this round, so there is nothing to approve.", "sequence")
    req = st["sample_requests"][r["request_id"]]
    s = st["styles"][req["style_id"]]
    r["external"] = {"state": body["decision"], "person_role": f"{body['person_role'].strip()} (recorded by {person(st, user['id'])})", "recorded_by": user["id"],
                     "date": body["date"], "ref": body["ref"].strip(), "version": req["spec_version"], "scope": body["scope"].strip(), "conditions": (body.get("conditions") or "").strip()}
    concerns = ""
    if r["internal"]["state"] != "passed":
        concerns = " Internal QC has not passed on this round; the external decision does not erase internal concerns."
    add_event(st, user["id"], "external_decision", f"Brand decision recorded: {body['decision'].replace('_', ' ')} · {req['type']} round {r['round']}",
              f"Scope: {body['scope'].strip()}. Ref: {body['ref'].strip()}. Recording this decision sent no message.{concerns}",
              _style_scope(st, s, vendor_id=req["vendor_id"], sample_round_id=r["id"]))
    bump_work(st, s["work_id"])
    return {"warning": concerns.strip() or None}


# ---------- orders & allocation ----------
@op("confirm_order")
def confirm_order(st, user, body):
    need(user, "commercial", "Confirming an order needs commercial authority (demo permission).")
    o = get(st, "orders", body["order_id"], "Order")
    if o["state"] == "confirmed":
        raise ApiError(409, "This order is already confirmed.", "validation")
    missing = []
    if not (body.get("po_evidence") or o.get("po_evidence")):
        missing.append("PO / acceptance evidence")
    if not (body.get("destination") or o.get("destination")):
        missing.append("Delivery destination")
    if not (body.get("required_in_dc") or o["dates"]["required_in_dc"]["agreed"]):
        missing.append("Agreed required in-DC date")
    for l in o["lines"]:
        if not (body.get("prices", {}).get(l["id"]) or l.get("price")):
            missing.append(f"Price for {l['colour']} line")
        if not (body.get("eans", {}).get(l["id"]) or l.get("ean")):
            missing.append(f"EAN for {l['colour']} line")
        if not l.get("quote_id") and not body.get("quotes", {}).get(l["id"]):
            missing.append(f"Approved costing link for {l['colour']} line")
    if missing:
        raise ApiError(409, "Order cannot be confirmed yet.", "incomplete", missing=missing)
    o["po_evidence"] = body.get("po_evidence") or o["po_evidence"]
    o["destination"] = body.get("destination") or o["destination"]
    if body.get("required_in_dc"):
        o["dates"]["required_in_dc"]["agreed"] = body["required_in_dc"]
    for l in o["lines"]:
        l["price"] = body.get("prices", {}).get(l["id"]) or l["price"]
        l["ean"] = body.get("eans", {}).get(l["id"]) or l["ean"]
        l["quote_id"] = body.get("quotes", {}).get(l["id"]) or l["quote_id"]
    o["state"] = "confirmed"
    o["ref"] = body.get("ref") or o["ref"]
    o.pop("verbal_note", None)
    w = st["works"].get(o["work_id"])
    add_event(st, user["id"], "order_confirmed", f"Order confirmed: {o['ref']}", f"{order_total(o)} pcs with PO evidence recorded.",
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"]})
    bump_work(st, o["work_id"])
    return {}


@op("allocate")
def allocate(st, user, body):
    need(user, "edit")
    require(body, "order_id", "line_id", "vendor_id", "qty")
    o = get(st, "orders", body["order_id"], "Order")
    if o["state"] != "confirmed":
        raise ApiError(409, "Only a confirmed order can be allocated. A draft or verbal order is not confirmed demand.", "not_confirmed")
    line = next((l for l in o["lines"] if l["id"] == body["line_id"]), None)
    if not line:
        raise ApiError(404, "Order line not found.", "not_found")
    qty = body["qty"]
    if any(not is_int(v) or v < 0 for v in qty.values()) or sum(qty.values()) == 0:
        raise ApiError(422, "Allocate whole, non-negative quantities.", "validation")
    over = []
    for size, n in qty.items():
        already = sum(l2["qty"].get(size, 0) for a in st["allocations"].values() if a["order_id"] == o["id"] for l2 in a["lines"] if l2["line_id"] == line["id"])
        if already + n > line["qty"].get(size, 0):
            over.append(f"{size}: {line['qty'].get(size, 0) - already} remaining, tried {n}")
    if over:
        raise ApiError(409, "Over-allocation blocked (an authorised order amendment is required to exceed the confirmed quantity): " + "; ".join(over), "over_allocation")
    aid = nid(st, "al")
    v = get(st, "vendors", body["vendor_id"], "Vendor")
    st["allocations"][aid] = {"id": aid, "order_id": o["id"], "style_id": line["style_id"], "vendor_id": v["id"], "factory_id": body.get("factory_id") or (v["factories"][0] if v["factories"] else None),
                              "label": f"{v['name']} · {line['colour']}", "lines": [{"line_id": line["id"], "qty": {k: n for k, n in qty.items() if n}}],
                              "lots": [{"id": nid(st, "lot"), "label": f"Lot 1 ({line['colour']})", "qty": sum(qty.values())}],
                              "gate3": {"state": "pending", "by": None, "at": None, "scope": None, "evidence": None}, "pp_meeting": None,
                              "clearance_manual": {k: "missing" for k in ("tech_pack", "graded_spec", "lab_reports", "bulk_fabric_test", "shade_band", "lab_dip", "trim_card", "top", "inline", "midline", "packing")},
                              "progress": [], "unauthorised_start": False}
    st["allocations"][aid]["clearance_manual"]["tech_pack"] = "satisfied"
    add_event(st, user["id"], "allocated", f"Allocated {sum(qty.values())} pcs ({line['colour']}) to {v['name']}", "Sampling or quote vendors are not automatically production vendors.",
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"], "allocation_id": aid, "style_id": line["style_id"], "vendor_id": v["id"]})
    bump_work(st, o["work_id"])
    return {"allocation_id": aid}


@op("propose_amendment")
def propose_amendment(st, user, body):
    need(user, "edit")
    require(body, "order_id", "line_id", "size", "new_qty", "reason")
    o = get(st, "orders", body["order_id"], "Order")
    if o["state"] != "confirmed":
        raise ApiError(409, "Amendments apply to confirmed orders.", "validation")
    line = next((l for l in o["lines"] if l["id"] == body["line_id"]), None)
    if not line or not is_int(body["new_qty"]) or body["new_qty"] < 0:
        raise ApiError(422, "Invalid amendment.", "validation")
    impacted = [a["label"] for a in st["allocations"].values() if a["order_id"] == o["id"] and any(l["line_id"] == line["id"] for l in a["lines"])]
    amid = nid(st, "am")
    o["amendments"].append({"id": amid, "ts": now(), "actor_id": user["id"], "type": "Quantity", "line_id": line["id"], "size": body["size"], "from": line["qty"].get(body["size"], 0),
                            "to": body["new_qty"], "proposal": f"{line['colour']} {body['size']}: {line['qty'].get(body['size'], 0)} → {body['new_qty']}", "reason": body["reason"].strip(),
                            "state": "proposed", "impact": impacted})
    add_event(st, user["id"], "amendment_proposed", f"Order amendment proposed on {o['ref']} (not applied)", f"{o['amendments'][-1]['proposal']}. Impact to review: {', '.join(impacted) or 'none'}",
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"]})
    return {"amendment_id": amid}


@op("decide_amendment")
def decide_amendment(st, user, body):
    need(user, "commercial")
    require(body, "order_id", "amendment_id", "decision", "reason")
    o = get(st, "orders", body["order_id"], "Order")
    am = next((a for a in o["amendments"] if a["id"] == body["amendment_id"]), None)
    if not am or am["state"] != "proposed":
        raise ApiError(409, "No pending amendment.", "validation")
    am["decided_by"], am["decided_at"], am["decision_reason"] = user["id"], now(), body["reason"].strip()
    if body["decision"] == "accept":
        line = next(l for l in o["lines"] if l["id"] == am["line_id"])
        alloc = sum(l2["qty"].get(am["size"], 0) for a in st["allocations"].values() if a["order_id"] == o["id"] for l2 in a["lines"] if l2["line_id"] == line["id"])
        if am["to"] < alloc:
            raise ApiError(409, f"{alloc} pcs of {am['size']} are already allocated; reduce the allocation first.", "over_allocation")
        am["state"] = "accepted"
        line["qty"][am["size"]] = am["to"]
    else:
        am["state"] = "rejected"
    add_event(st, user["id"], "amendment_decided", f"Order amendment {am['state']}: {am['proposal']}", body["reason"].strip(),
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"]})
    bump_work(st, o["work_id"])
    return {}


# ---------- production ----------
@op("update_progress")
def update_progress(st, user, body):
    need(user, "edit")
    require(body, "allocation_id", "type", "basis", "qty", "source")
    al = get(st, "allocations", body["allocation_id"], "Allocation")
    if body["type"] not in ("cut", "sewn", "washed", "packed", "dispatched"):
        raise ApiError(422, "Unknown progress type.", "validation")
    if body["basis"] not in ("cumulative", "incremental"):
        raise ApiError(422, "Say whether this is a cumulative total or an incremental quantity.", "validation", field="basis")
    q = body["qty"]
    if not is_int(q) or q < 0:
        raise ApiError(422, "Quantities are whole units and cannot be negative.", "validation", field="qty")
    from .derive import progress_totals
    totals = progress_totals(al)
    cap = sum(sum(l["qty"].values()) for l in al["lines"])
    new_total = q if body["basis"] == "cumulative" else totals.get(body["type"], 0) + q
    exc = (body.get("exception_reason") or "").strip()
    if new_total > cap and not exc:
        raise ApiError(409, f"{new_total} exceeds the authorised {cap} pcs for this allocation. If this is overage, rework or a subcontracted process, give an exception reason.", "reconcile", needs_reason=True)
    if body["type"] == "packed" and new_total > totals.get("sewn", 0) and not exc:
        raise ApiError(409, f"Packed ({new_total}) exceeds sewn ({totals.get('sewn', 0)}). Give a reason if this is correct (for example rework or a subcontracted process).", "reconcile", needs_reason=True)
    if body["basis"] == "cumulative" and new_total < totals.get(body["type"], 0) and not exc:
        raise ApiError(409, f"This lowers the {body['type']} total from {totals.get(body['type'], 0)}. A correction needs a reason; the previous value is retained.", "reconcile", needs_reason=True)
    flag = None
    if al["gate3"]["state"] != "signed" and body["type"] in ("cut", "sewn", "washed", "packed"):
        flag = "Unauthorised start: reported before Gate 3 sign-off. Recorded as actual; release remains blocked."
        al["unauthorised_start"] = True
    pid = nid(st, "pg")
    al["progress"].append({"id": pid, "ts": now(), "type": body["type"], "basis": body["basis"], "qty": q, "source": body["source"].strip(), "actor_id": user["id"], "flag": flag,
                           "previous_total": totals.get(body["type"], 0), "reason": exc or None})
    o = st["orders"][al["order_id"]]
    add_event(st, user["id"], "progress", f"{al['label'].split(' · ')[0]}: {body['type']} {body['basis']} {q}" + (" (FLAGGED)" if flag else ""),
              (flag or "") + f" New {body['type']} total: {new_total}. Other quantities unchanged.",
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"], "allocation_id": al["id"], "style_id": al["style_id"], "vendor_id": al["vendor_id"]})
    bump_work(st, o["work_id"])
    return {"flag": flag, "new_total": new_total}


@op("propose_milestone")
def propose_milestone(st, user, body):
    need(user, "edit")
    require(body, "milestone_id", "date", "reason")
    m = get(st, "milestones", body["milestone_id"], "Milestone")
    m["proposed"] = body["date"]
    m["reason"] = body["reason"].strip()
    al = st["allocations"][m["allocation_id"]]
    o = st["orders"][al["order_id"]]
    deps = [x["name"] for x in st["milestones"].values() if m["id"] in x["deps"]]
    add_event(st, user["id"], "milestone_proposed", f"Revised date proposed (not agreed): {m['name']} → {body['date']}", body["reason"].strip() + (f" Would affect: {', '.join(deps)}." if deps else ""),
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"], "allocation_id": al["id"]})
    return {"affected": deps}


@op("decide_milestone")
def decide_milestone(st, user, body):
    need(user, "gate_signoff")
    require(body, "milestone_id", "decision")
    m = get(st, "milestones", body["milestone_id"], "Milestone")
    if not m["proposed"]:
        raise ApiError(409, "No pending proposal.", "validation")
    al = st["allocations"][m["allocation_id"]]
    o = st["orders"][al["order_id"]]
    sc = {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"], "allocation_id": al["id"]}
    if body["decision"] == "accept":
        require(body, "evidence")
        m.setdefault("history", []).append({"agreed": m["agreed"], "now": m["proposed"], "by": user["id"], "at": now(), "evidence": body["evidence"]})
        m["agreed"] = m["proposed"]
        m["proposed"] = None
        add_event(st, user["id"], "milestone_agreed", f"Revised date agreed: {m['name']} → {m['agreed']}", f"Baseline {m['baseline']} retained. Evidence: {body['evidence']}", sc)
    else:
        require(body, "reason")
        add_event(st, user["id"], "milestone_rejected", f"Revised date not accepted: {m['name']}", body["reason"], sc)
        m["proposed"] = None
    return {}


@op("record_test")
def record_test(st, user, body):
    need(user, "technical_review")
    require(body, "allocation_id", "type", "material", "lot", "result", "date")
    if body["result"] not in ("pass", "fail", "pending"):
        raise ApiError(422, "Invalid result.", "validation")
    if body["result"] != "pending" and not (body.get("evidence") or "").strip():
        raise ApiError(422, "A test result needs its report or evidence reference. An uploaded report is not inherently a pass.", "validation", field="evidence")
    al = get(st, "allocations", body["allocation_id"], "Allocation")
    tid = nid(st, "t")
    st["tests"][tid] = {"id": tid, "allocation_id": al["id"], "type": body["type"], "material": body["material"], "lot": body["lot"], "issuer": body.get("issuer", ""), "date": body["date"],
                        "result": body["result"], "retest_of": body.get("retest_of"), "evidence": body.get("evidence"), "spec_ref": body.get("spec_ref", "")}
    o = st["orders"][al["order_id"]]
    add_event(st, user["id"], "test", f"{body['type']} {body['result']} · {body['lot']}" + (" (retest; earlier failure retained)" if body.get("retest_of") else ""), body.get("evidence") or "",
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"], "allocation_id": al["id"]})
    return {"test_id": tid}


@op("record_inspection")
def record_inspection(st, user, body):
    need(user, "technical_review")
    require(body, "allocation_id", "type", "lot", "result", "qty_inspected", "plan_ref", "date")
    al = get(st, "allocations", body["allocation_id"], "Allocation")
    if body["result"] not in ("pass", "fail"):
        raise ApiError(422, "Result must be pass or fail.", "validation")
    defects = [{"cat": d["cat"], "name": d["name"], "count": int(d["count"])} for d in body.get("defects", [])]
    limits = body.get("limits")
    if body["result"] == "pass" and limits:
        major = sum(d["count"] for d in defects if d["cat"] == "Major" or d["cat"] == "Critical")
        minor = sum(d["count"] for d in defects if d["cat"] == "Minor")
        if major > limits.get("major_accept", 10 ** 9) or minor > limits.get("minor_accept", 10 ** 9):
            raise ApiError(409, f"The recorded defects ({major} major, {minor} minor) exceed the stated acceptance limits for this plan, so this cannot be recorded as a pass without a documented exception.", "limit_exceeded")
    recheck_of = body.get("recheck_of")
    if recheck_of:
        prev = get(st, "inspections", recheck_of, "Inspection")
        if prev["result"] != "fail":
            raise ApiError(409, "Only a failed inspection can be re-checked.", "validation")
        require(body, "rechecked")
    iid = nid(st, "ins")
    rec = {"id": iid, "allocation_id": al["id"], "type": body["type"], "lot": body["lot"], "qty_inspected": int(body["qty_inspected"]), "sample_size": body.get("sample_size"),
           "plan_ref": body["plan_ref"], "limits": limits, "inspector": user["id"], "date": body["date"], "result": body["result"], "defects": defects, "photos": int(body.get("photos", 0)),
           "disposition": body.get("disposition") or ("Held" if body["result"] == "fail" else "Accepted"), "recheck_of": recheck_of, "rechecked": body.get("rechecked"), "follow_up": None}
    if body["result"] == "pass" and body["type"] == "Final":
        lot = next((l for l in al["lots"] if l["label"].startswith(body["lot"])), None)
        rec["cleared_qty"] = int(body.get("cleared_qty") or (lot["qty"] if lot else 0))
        if recheck_of:
            rec["cleared_qty"] = int(body.get("cleared_qty") or 0)
            if rec["cleared_qty"] <= 0:
                raise ApiError(422, "State the exact quantity cleared by this re-inspection (the reworked quantity only).", "validation", field="cleared_qty")
    st["inspections"][iid] = rec
    o = st["orders"][al["order_id"]]
    sc = {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"], "allocation_id": al["id"], "style_id": al["style_id"], "vendor_id": al["vendor_id"]}
    if body["result"] == "fail" and body.get("follow_up_title"):
        from .ops_core import add_action
        w = o["work_id"]
        res = add_action(st, user, {"title": body["follow_up_title"], "assignee_id": body.get("follow_up_assignee") or user["id"], "work_id": w, "style_id": al["style_id"],
                                    "vendor_id": al["vendor_id"], "due": body.get("follow_up_due")})
        rec["follow_up"] = res["action_id"]
        st["actions"][res["action_id"]]["inspection_gate"] = al["id"]
    add_event(st, user["id"], "inspection", f"{body['type']} inspection {body['result']}: {body['lot']} ({st['vendors'][al['vendor_id']]['name']})",
              f"Plan: {body['plan_ref']}. " + ("Re-inspection covered: " + body["rechecked"] + ". " if recheck_of else "") +
              ("Only this scope is cleared; other lots are unaffected." if body["result"] == "pass" else "Release blocked for this scope."), sc)
    bump_work(st, o["work_id"])
    return {"inspection_id": iid}


@op("sign_gate3")
def sign_gate3(st, user, body):
    need(user, "gate_signoff")
    require(body, "allocation_id", "date", "attendees", "minutes", "decision", "scope")
    al = get(st, "allocations", body["allocation_id"], "Allocation")
    clr = {c["key"]: c["state"] for c in clearance_for(st, al)}
    blockers = [k for k in ("pp_approval", "tech_pack") if clr.get(k) != "satisfied"]
    if blockers:
        labels = {c["key"]: c["label"] for c in clearance_for(st, al)}
        raise ApiError(409, "Gate 3 cannot be signed yet: " + "; ".join(labels[b] for b in blockers) + ". Each missing requirement opens its record.", "gate_blocked", blockers=blockers)
    al["pp_meeting"] = {"date": body["date"], "attendees": body["attendees"], "minutes": body["minutes"].strip(), "critical_points": body.get("critical_points", ""),
                        "decision": body["decision"].strip(), "signoff_by": user["id"], "signoff_at": now()}
    al["gate3"] = {"state": "signed", "by": user["id"], "at": now(), "scope": body["scope"].strip(), "evidence": "PP meeting minutes recorded"}
    o = st["orders"][al["order_id"]]
    add_event(st, user["id"], "gate3", f"Gate 3 signed: {al['label']}", f"Scope: {body['scope'].strip()}. Applies to this allocation only; other vendors are not released.",
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"], "allocation_id": al["id"], "style_id": al["style_id"], "vendor_id": al["vendor_id"]})
    bump_work(st, o["work_id"])
    return {}


@op("release_shipment")
def release_shipment(st, user, body):
    need(user, "gate_signoff")
    require(body, "order_id", "lines", "destination", "carrier")
    o = get(st, "orders", body["order_id"], "Order")
    for ln in body["lines"]:
        al = get(st, "allocations", ln["allocation_id"], "Allocation")
        if al["gate3"]["state"] != "signed":
            raise ApiError(409, f"{al['label']} has no Gate 3 release.", "gate_blocked")
        cleared = sum(i.get("cleared_qty", 0) for i in st["inspections"].values() if i["allocation_id"] == al["id"] and i["type"] == "Final" and i["result"] == "pass" and i["lot"] == ln["lot"])
        shipped = sum(l["qty"] for sh in st["shipments"].values() for l in sh["lines"] if l["allocation_id"] == al["id"] and l["lot"] == ln["lot"])
        if not is_int(ln["qty"]) or ln["qty"] <= 0 or ln["qty"] > cleared - shipped:
            raise ApiError(409, f"Only {max(cleared - shipped, 0)} pcs of {ln['lot']} ({al['label']}) are cleared by final inspection and not yet shipped.", "not_cleared")
    sid = nid(st, "sh")
    n = len([s for s in st["shipments"].values() if s["order_id"] == o["id"]]) + 1
    st["shipments"][sid] = {"id": sid, "order_id": o["id"], "label": f"Shipment {n} (partial)", "state": "released", "lines": body["lines"], "released_by": user["id"],
                            "release_basis": "Cleared by final inspection (scope per line)", "dates": {"released": now()[:10], "dispatched": None, "delivered": None, "grn": None},
                            "carrier": body["carrier"], "lr_ref": body.get("lr_ref"), "destination": body["destination"], "documents": body.get("documents", []), "received_qty": None, "variance": None}
    add_event(st, user["id"], "shipment_released", f"Shipment {n} released", f"{sum(l['qty'] for l in body['lines'])} pcs. Release is not dispatch, delivery or receipt.",
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"]})
    bump_work(st, o["work_id"])
    return {"shipment_id": sid}


@op("update_shipment")
def update_shipment(st, user, body):
    need(user, "edit")
    require(body, "shipment_id", "state", "date")
    sh = get(st, "shipments", body["shipment_id"], "Shipment")
    order = ["released", "dispatched", "in_transit", "delivered", "grn"]
    if body["state"] not in order or order.index(body["state"]) <= order.index(sh["state"]):
        raise ApiError(409, "Shipments move forward one recorded step at a time.", "sequence")
    if body["state"] == "grn":
        if not is_int(body.get("received_qty")):
            raise ApiError(422, "Enter the received quantity from the GRN.", "validation", field="received_qty")
        shipped = sum(l["qty"] for l in sh["lines"])
        sh["received_qty"] = body["received_qty"]
        sh["variance"] = body["received_qty"] - shipped
    sh["state"] = body["state"]
    key = {"dispatched": "dispatched", "in_transit": "dispatched", "delivered": "delivered", "grn": "grn"}.get(body["state"], "released")
    sh["dates"][key] = sh["dates"].get(key) or body["date"]
    o = st["orders"][sh["order_id"]]
    add_event(st, user["id"], "shipment_" + body["state"], f"{sh['label']}: {body['state'].replace('_', ' ')}", (f"Variance {sh['variance']} pcs." if body["state"] == "grn" else "Delivery is not payment; the order stays open for remaining demand."),
              {"brand_id": o["brand_id"], "work_id": o["work_id"], "order_id": o["id"]})
    bump_work(st, o["work_id"])
    return {}


@op("receive_brand_confirmation")
def receive_brand_confirmation(st, user, body):
    """Brand confirms it received a counter-sample (recorded by an internal user; nothing is sent)."""
    need(user, "edit")
    require(body, "round_id", "ref")
    r = get(st, "sample_rounds", body["round_id"], "Sample round")
    r["brand_receipt_confirmed"] = True
    req = st["sample_requests"][r["request_id"]]
    s = st["styles"][req["style_id"]]
    msgs = []
    for a in st["actions"].values():
        if a.get("sample_round_id") == r["id"] and a.get("completes_on_receipt") and a["status"] in ("open", "blocked"):
            from .ops_core import _complete
            _complete(st, user, a, f"Brand confirmed receipt (ref: {body['ref'].strip()}).", None)
            msgs.append("Receipt action completed.")
    for w in st["waiting"].values():
        a = st["actions"].get(w["action_id"])
        if a and a.get("sample_round_id") == r["id"]:
            w["latest"] = "Brand confirmed receipt; colour approval still pending."
    add_event(st, user["id"], "brand_receipt", f"Brand confirmed receipt of counter-sample ({req['type']})", f"Ref: {body['ref'].strip()}. Brand approval is still a separate decision.",
              _style_scope(st, s, sample_round_id=r["id"]))
    bump_work(st, s["work_id"])
    return {"message": " ".join(msgs)}
