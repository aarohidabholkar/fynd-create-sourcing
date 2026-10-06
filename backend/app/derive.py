"""Derived state. Everything the UI shows as a count, badge, readiness or summary is computed
here from the shared records, so no view keeps its own copy."""
from datetime import datetime

from .clock import TODAY

OPEN = ("open", "blocked", "awaiting_review")


def _days(ds):
    return datetime.strptime(ds[:10], "%Y-%m-%d").toordinal()


def eff_date(c):
    return c.get("agreed") or c.get("planned") or c.get("original")


def is_overdue(a):
    return a["status"] in OPEN and bool(a.get("due")) and a["due"] < TODAY


def line_total(line):
    return sum(line["qty"].values())


def order_total(o):
    return sum(line_total(l) for l in o["lines"])


def active_requests_for_style(st, sid):
    out = []
    for r in st["quote_requests"].values():
        if r["style_id"] == sid and r["state"] in ("draft", "issued"):
            out.append({"id": r["id"], "kind": "Costing request"})
    for r in st["sample_requests"].values():
        if r["style_id"] == sid and r["state"] == "active":
            out.append({"id": r["id"], "kind": f"{r['type']} sample request"})
    return out


def style_readiness(st, sid):
    s = st["styles"][sid]
    bom_ok = len(s["bom"]["items"]) > 0
    pom_ok = len(s["pom"]) > 0
    released = any(v["state"] == "released" for v in s["spec_versions"])
    approved_quote = any(q["state"] == "approved" for q in st["quotes"].values() if q["style_id"] == sid)
    approved_sample = any(
        r["external"]["state"] in ("approved", "approved_with_comments") and r["internal"]["state"] == "passed"
        for r in st["sample_rounds"].values() if st["sample_requests"][r["request_id"]]["style_id"] == sid)
    has_vendor = any(q["style_id"] == sid for q in st["quotes"].values()) or any(
        r["style_id"] == sid for r in st["sample_requests"].values())
    miss_bom = {"label": "Add BOM", "target": "bom"}
    miss_pom = {"label": "Add measurements (POM)", "target": "pom"}
    miss_rel = {"label": "Release a tech pack version", "target": "techpack"}

    def chk(*items):
        m = [x for ok, x in items if not ok]
        return {"ready": not m, "missing": m}

    return {
        "sourcing_ready": chk((bom_ok, miss_bom)),
        "costing_ready": chk((bom_ok, miss_bom), (released, miss_rel)),
        "sampling_ready": chk((bom_ok, miss_bom), (pom_ok, miss_pom), (released, miss_rel)),
        "vendor_ready": chk((bom_ok, miss_bom), (has_vendor, {"label": "Request a quote or sample from a vendor", "target": "costing"})),
        "order_ready": chk((approved_quote, {"label": "Approved costing needed", "target": "costing"}),
                           (approved_sample, {"label": "Internally passed and externally approved sample needed", "target": "sampling"})),
    }


def clearance_for(st, al):
    """The 15 final-QA records. Existing linked records are reused rather than re-uploaded."""
    m = al["clearance_manual"]
    rounds = [r for r in st["sample_rounds"].values() if st["sample_requests"][r["request_id"]].get("allocation_id") == al["id"]]
    pp_ok = any(
        r["internal"]["state"] == "passed" and r["external"]["state"] in ("approved", "approved_with_comments")
        and not any(c["state"] != "verified" for c in r["comments"]) for r in rounds)
    pp_conditional = any(r["external"]["state"] == "approved_with_comments" for r in rounds)
    mtg = "satisfied" if (al["pp_meeting"] and al["gate3"]["state"] == "signed") else "pending"
    insp = [i for i in st["inspections"].values() if i["allocation_id"] == al["id"]]
    final = [i for i in insp if i["type"] == "Final"]
    final_state = "missing"
    if final:
        passed = []
        for l in al["lots"]:
            lab = l["label"].split(" (")[0]
            res = sorted([i for i in final if i["lot"] == lab], key=lambda i: i["date"])
            passed.append(bool(res) and res[-1]["result"] == "pass")
        if all(passed):
            final_state = "satisfied"
        elif any(passed):
            final_state = "partial"
        else:
            final_state = "failed"
    alloc_total = sum(sum(l["qty"].values()) for l in al["lines"])
    lot_total = sum(l["qty"] for l in al["lots"])
    recon = "satisfied" if alloc_total == lot_total else "failed"
    tests = [t for t in st["tests"].values() if t["allocation_id"] == al["id"]]
    lab_state = m["lab_reports"]
    if tests:
        superseded = {t["retest_of"] for t in tests if t["retest_of"]}
        eff = [t for t in tests if t["id"] not in superseded]
        if any(t["result"] == "fail" for t in eff):
            lab_state = "failed"
        elif any(t["result"] == "pending" for t in eff):
            lab_state = "pending"
        else:
            lab_state = "satisfied"
    pp_label = "PP approval with required comments closed" + (" (approved with comments)" if pp_conditional and pp_ok else "")
    items = [
        ("tech_pack", "Frozen/released production tech pack version", m["tech_pack"]),
        ("graded_spec", "Locked graded specification for relevant sizes", m["graded_spec"]),
        ("lab_reports", "Required fabric and trim lab reports", lab_state),
        ("bulk_fabric_test", "Bulk fabric test result", lab_state if tests else m["bulk_fabric_test"]),
        ("shade_band", "Approved shade band", m["shade_band"]),
        ("lab_dip", "Lab dip / desk loom / strike-off approval", m["lab_dip"]),
        ("trim_card", "Approved trim card", m["trim_card"]),
        ("pp_approval", pp_label, "satisfied" if pp_ok else "pending"),
        ("pp_meeting", "PP meeting record and required sign-off", mtg),
        ("top", "TOP approval", m["top"]),
        ("inline", "Inline reports and applicable defect limits", m["inline"]),
        ("midline", "Required mid-line result", m["midline"]),
        ("packing", "Packing list / carton details and quantity tolerance checks", m["packing"]),
        ("po_recon", "PO quantity and size-ratio reconciliation", recon),
        ("final", "Final inspection result under the applicable sampling plan", final_state),
    ]
    return [{"key": k, "label": l, "state": s_} for k, l, s_ in items]


def progress_totals(al):
    """Latest cumulative total per type; incremental entries add to the running total."""
    out = {}
    for p in sorted(al["progress"], key=lambda p: p["ts"]):
        if p["basis"] == "cumulative":
            out[p["type"]] = p["qty"]
        else:
            out[p["type"]] = out.get(p["type"], 0) + p["qty"]
    return out


def allocation_summary(st, al):
    clr = clearance_for(st, al)
    totals = progress_totals(al)
    qty = sum(sum(l["qty"].values()) for l in al["lines"])
    ms = [m for m in st["milestones"].values() if m["allocation_id"] == al["id"]]
    ins = [i for i in st["inspections"].values() if i["allocation_id"] == al["id"]]
    cleared = sum(i.get("cleared_qty", 0) for i in ins if i["result"] == "pass" and i["type"] == "Final")
    shipped = sum(l["qty"] for sh in st["shipments"].values() for l in sh["lines"] if l["allocation_id"] == al["id"])
    open_fail = [i for i in ins if i["result"] == "fail" and i["type"] == "Final"
                 and not any(r["recheck_of"] == i["id"] and r["result"] == "pass" for r in ins)]
    if al["gate3"]["state"] != "signed":
        pos = "awaiting PP approval / Gate 3"
        if al.get("unauthorised_start"):
            pos += " (unauthorised cutting start flagged)"
    elif open_fail:
        pos = "in production, final inspection failed (re-inspection pending)"
    else:
        pos = "in production"
    return {"clearance": clr, "totals": totals, "qty": qty, "cleared_qty": cleared, "shipped_qty": shipped, "position": pos,
            "late_milestones": [m["id"] for m in ms if m["state"] in ("late", "blocked")],
            "pending_proposals": [m["id"] for m in ms if m["proposed"]],
            "open_failed_inspections": [i["id"] for i in open_fail]}


def work_counts(st, wid):
    w = st["works"][wid]
    sids = w["style_ids"]
    srs = [r for r in st["sample_requests"].values() if r["style_id"] in sids]
    ids = {x["id"] for x in srs}
    rounds = [r for r in st["sample_rounds"].values() if r["request_id"] in ids]
    confirmed = [o for o in st["orders"].values() if o["state"] == "confirmed" and o["work_id"] == wid]
    ordered = {l["style_id"] for o in confirmed for l in o["lines"]}
    return {"styles": len(sids),
            "styles_selected": sum(1 for s in sids if st["styles"][s]["selection"] and st["styles"][s]["selection"]["state"] == "selected"),
            "styles_ordered": len(ordered), "sample_requests": len(srs), "sample_rounds": len(rounds),
            "samples_made": sum(r["made"] for r in rounds), "samples_dispatched": sum(r["dispatched"] for r in rounds),
            "samples_received": sum(r["received"] for r in rounds), "ordered_pieces": sum(order_total(o) for o in confirmed)}


def attention_items(st):
    """Needs attention: open issues needing intervention, plus overdue unanswered requests."""
    items = []
    for i in st["issues"].values():
        if i["state"] != "open":
            continue
        acts = [st["actions"][a] for a in i["action_ids"] if a in st["actions"]]
        overdue = [a for a in acts if is_overdue(a)]
        if not (i["blocking"] or i["escalated"] or overdue):
            continue
        items.append({"kind": "issue", "issue_id": i["id"], "work_id": i["work_id"], "escalated": i["escalated"], "blocking": i["blocking"],
                      "age_days": _days(TODAY) - _days(i["opened_at"]), "overdue_actions": [a["id"] for a in overdue]})
    for r in st["requests"].values():
        if r["state"] == "awaiting" and r["response_due"] and r["response_due"] < TODAY:
            a = st["actions"][r["action_id"]]
            items.append({"kind": "request", "request_id": r["id"], "work_id": a["work_id"], "action_id": a["id"], "escalated": False,
                          "blocking": False, "age_days": _days(TODAY) - _days(r["response_due"]), "overdue_actions": []})
    items.sort(key=lambda x: (not x["escalated"], not x["blocking"], -x["age_days"]))
    return items


def work_flags(st):
    att = attention_items(st)
    out = {}
    for wid in st["works"]:
        pend = [r["id"] for r in st["requests"].values() if r["state"] == "awaiting" and st["actions"][r["action_id"]]["work_id"] == wid]
        out[wid] = {"attention_count": sum(1 for a in att if a["work_id"] == wid), "pending_requests": pend, "counts": work_counts(st, wid)}
    return out, att


def style_position(st, sid):
    s = st["styles"][sid]
    allocs = [a for a in st["allocations"].values() if a["style_id"] == sid]
    if allocs:
        parts = []
        for al in allocs:
            parts.append(f"{al['label'].split(' · ')[0]}: {allocation_summary(st, al)['position']}")
        return " · ".join(parts)
    rounds = [r for r in st["sample_rounds"].values() if st["sample_requests"][r["request_id"]]["style_id"] == sid]
    if rounds:
        r = sorted(rounds, key=lambda r: (r["request_id"], r["round"]))[-1]
        sr = st["sample_requests"][r["request_id"]]
        v = st["vendors"][sr["vendor_id"]]["name"]
        movement = "received" if r["received"] else ("dispatched, not yet received" if r["dispatched"] else "requested")
        return f"{sr['type']} sample round {r['round']} ({v}): {movement}"
    if s["lifecycle"] == "draft":
        return "Draft: missing required inputs"
    return "No sample or order yet"


def vendor_work(st, vid):
    rows = {}

    def row(sid):
        return rows.setdefault(sid, {"style_id": sid, "roles": set(), "order_id": None, "allocation_id": None, "stage": "", "next_action": None})

    for q in st["quote_requests"].values():
        if q["vendor_id"] == vid:
            r = row(q["style_id"]); r["roles"].add("Quote vendor"); r["stage"] = f"Quote request ({q['state']})"
    for sr in st["sample_requests"].values():
        if sr["vendor_id"] == vid:
            r = row(sr["style_id"])
            r["roles"].add("Sampling candidate" if sr["type"] in ("Proto", "Counter sample") else "Sampling vendor")
            r["stage"] = f"{sr['type']} sample ({sr['state']})"
    for al in st["allocations"].values():
        if al["vendor_id"] == vid:
            r = row(al["style_id"]); r["roles"].add("Production allocation (confirmed order)")
            r["order_id"] = al["order_id"]; r["allocation_id"] = al["id"]; r["stage"] = allocation_summary(st, al)["position"]
    for a in st["actions"].values():
        if a["vendor_id"] == vid and a["style_id"] in rows and a["status"] in OPEN:
            rows[a["style_id"]]["next_action"] = {"id": a["id"], "title": a["title"], "due": a["due"], "assignee_id": a["assignee_id"]}
    out = []
    for r in rows.values():
        r["roles"] = sorted(r["roles"]); out.append(r)
    return out


def vendor_summary(st, vid):
    visits = sorted([x for x in st["visits"].values() if x["vendor_id"] == vid and x["state"] == "published"], key=lambda x: x["date"], reverse=True)
    audits = sorted([a for a in st["audits"].values() if a["vendor_id"] == vid], key=lambda a: a["date"], reverse=True)
    latest_by_factory = {}
    for a in audits:
        latest_by_factory.setdefault(a["factory_id"], a)
    outcomes = {fid: (a["outcome"] or "Pending review") for fid, a in latest_by_factory.items()}
    mixed = len(latest_by_factory) > 1 and len(set(outcomes.values())) > 1
    open_f = [f for f in st["findings"].values() if f["vendor_id"] == vid and f["state"] in ("open", "awaiting_verification", "reopened")]
    label = None
    if audits:
        label = "Mixed / unit-specific assessments" if mixed else (audits[0]["outcome"] or "Pending review")
    return {"latest_visit_id": visits[0]["id"] if visits else None, "latest_audit_id": audits[0]["id"] if audits else None,
            "mixed_assessments": mixed, "assessment_label": label, "open_findings": len(open_f),
            "draft_visits": sum(1 for x in st["visits"].values() if x["vendor_id"] == vid and x["state"] == "draft"),
            "work": vendor_work(st, vid)}


def build(st, user_id):
    wf, att = work_flags(st)
    order_sum = {}
    for oid, o in st["orders"].items():
        tot = order_total(o)
        al = [a for a in st["allocations"].values() if a["order_id"] == oid]
        allocated = sum(sum(l["qty"].values()) for a in al for l in a["lines"])
        order_sum[oid] = {"total": tot, "allocated": allocated, "unallocated": tot - allocated, "confirmed": o["state"] == "confirmed"}
    return {
        "works": wf, "attention": att,
        "styles": {sid: {"readiness": style_readiness(st, sid), "locks": active_requests_for_style(st, sid), "position": style_position(st, sid),
                         "current_spec": next((v["v"] for v in st["styles"][sid]["spec_versions"] if v["state"] == "released"), None)}
                   for sid in st["styles"]},
        "allocations": {aid: allocation_summary(st, a) for aid, a in st["allocations"].items()},
        "orders": order_sum, "vendors": {vid: vendor_summary(st, vid) for vid in st["vendors"]},
        "overdue_actions": [a["id"] for a in st["actions"].values() if is_overdue(a)],
        "viewer": st["viewer"].get(user_id, {"work_views": {}, "response_reads": {}}),
    }
