"""Styles, production and vendor rules."""


def test_receipt_requires_dispatch_and_updates_connected_state(api):
    # vendor saying "ready" is not dispatch
    r = api.op("record_sample_movement", {"round_id": "sr_orbit_3", "kind": "received", "qty": 1, "date": "2026-10-06", "colour": "Khaki", "size": "M"}, expect=409)
    assert r["code"] == "sequence"
    api.op("record_sample_movement", {"round_id": "sr_orbit_3", "kind": "dispatched", "qty": 2, "date": "2026-10-05", "tracking": "DEMO-9"})
    before = api.get()["derived"]["works"]["w_orbit"]["counts"]["samples_received"]
    api.op("record_sample_movement", {"round_id": "sr_orbit_3", "kind": "received", "qty": 1, "date": "2026-10-06", "colour": "Khaki", "size": "M"})
    mid = api.get()
    assert mid["actions"]["a_resubmit"]["status"] == "blocked"       # partial receipt: not complete
    s = api.op("record_sample_movement", {"round_id": "sr_orbit_3", "kind": "received", "qty": 1, "date": "2026-10-06", "colour": "Slate", "size": "M"})["state"]
    assert s["derived"]["works"]["w_orbit"]["counts"]["samples_received"] == before + 2
    assert s["actions"]["a_resubmit"]["status"] == "completed"
    assert s["waiting"]["wt_kaveri"]["state"] == "closed"
    assert s["commitments"]["c_orbit_sample"]["actual"] == "2026-10-06"
    # receipt is not QC, approval or issue resolution
    assert s["sample_rounds"]["sr_orbit_3"]["internal"]["state"] == "not_started"
    assert s["issues"]["i_sleeve"]["state"] == "open"
    assert s["actions"]["a_tech_review"]["status"] == "open"


def test_over_receipt_blocked(api):
    api.op("record_sample_movement", {"round_id": "sr_orbit_3", "kind": "dispatched", "qty": 1, "date": "2026-10-05"})
    api.op("record_sample_movement", {"round_id": "sr_orbit_3", "kind": "received", "qty": 2, "date": "2026-10-06", "colour": "Khaki", "size": "M"}, expect=422)


def test_internal_pass_blocked_by_out_of_tolerance_or_open_comments(api):
    r = api.op("internal_review", {"round_id": "sr_orbit_2", "result": "pass"}, user="u_tech", expect=409)
    assert r["code"] == "cannot_pass" and any("out of tolerance" in p for p in r["problems"])
    api.op("internal_review", {"round_id": "sr_a_fit2", "result": "pass"}, user="u_tech")           # already passable
    api.op("internal_review", {"round_id": "sr_orbit_2", "result": "pass"}, user="u_head", expect=403)


def test_qc_pass_is_not_brand_approval_and_decision_needs_fields(api):
    api.op("record_external_decision", {"round_id": "sr_a_pp1", "decision": "approved_with_comments", "person_role": "Buyer", "date": "2026-10-06", "ref": "email", "scope": "Navy"}, expect=422)
    r = api.op("record_external_decision", {"round_id": "sr_a_pp1", "decision": "approved", "person_role": "Buying manager", "date": "2026-10-06", "ref": "Brand email", "scope": "Navy M"})
    assert r["result"]["warning"]                                   # internal QC not passed: surfaced, not erased
    s = r["state"]
    assert s["sample_rounds"]["sr_a_pp1"]["internal"]["state"] == "changes_requested"
    assert "recorded by" in s["sample_rounds"]["sr_a_pp1"]["external"]["person_role"]


def test_start_next_round_keeps_previous_and_carries_corrections(api):
    api.op("add_correction", {"round_id": "sr_trail_1", "text": "Vest hem uneven", "scope": "Olive M"}, user="u_tech")
    r = api.op("start_next_round", {"round_id": "sr_trail_1", "qty": 1})
    s = r["state"]
    new = s["sample_rounds"][r["result"]["round_id"]]
    assert new["previous_round_id"] == "sr_trail_1" and new["comments"][0]["carried_from"]
    assert s["sample_rounds"]["sr_trail_1"]["internal"]["state"] == "passed"       # earlier result retained
    api.op("start_next_round", {"round_id": "sr_a_pp1"}, expect=409)               # next round already exists


def test_style_lock_blocks_bom_edit_but_draft_can_add_bom(api):
    r = api.op("set_bom", {"style_id": "s_meadow", "items": [{"name": "Thread", "consumption": 1, "unit": "m"}]}, expect=409)
    assert r["code"] == "locked" and r["locks"]
    s = api.get()
    assert not s["derived"]["styles"]["s_vs3"]["readiness"]["sourcing_ready"]["ready"]
    api.op("set_bom", {"style_id": "s_vs3", "items": [{"name": "Linen", "consumption": 1.6, "unit": "m/pc"}]})
    s = api.get()
    assert s["derived"]["styles"]["s_vs3"]["readiness"]["sourcing_ready"]["ready"]
    api.op("set_bom", {"style_id": "s_vs3", "items": [{"name": "X", "consumption": ""}]}, expect=422)    # unknown != zero


def test_create_style_duplicate_check_and_bulk_import(api):
    api.op("create_style", {"brand_id": "b_argo", "name": "Meadow shirt", "category": "Shirts"}, expect=409)
    r = api.op("import_styles", {"brand_id": "b_argo", "rows": [{"name": "Imp A", "category": "Tees"}, {"name": "", "category": "x"}, {"name": "Meadow shirt", "category": "y"}]})
    assert len(r["result"]["created"]) == 1 and len(r["result"]["errors"]) == 2
    s = r["state"]
    assert s["styles"][r["result"]["created"][0]]["lifecycle"] == "draft"


def test_quote_revision_does_not_overwrite_approved_and_unknown_not_zero(api):
    s = api.get()
    assert s["derived"]["quote_comparison"]["s_meadow"]["comparable"] is False        # different logistics terms / unstated components
    r = api.op("record_quote", {"request_id": "qr_meadow_a", "currency": "INR", "qty": 700, "components": [{"label": "Fabric", "value": 280}, {"label": "Wastage", "value": ""}]}, expect=422)
    r = api.op("record_quote", {"request_id": "qr_meadow_a", "currency": "INR", "qty": 700, "total": 620, "components": [{"label": "Fabric", "value": 280}, {"label": "Wastage", "value": ""}], "reason": "Fabric price up"})
    s = r["state"]
    assert s["quotes"]["q_a2"]["state"] == "approved"                  # last approved untouched
    new = s["quotes"][r["result"]["quote_id"]]
    assert new["state"] == "received" and new["version"] == 3 and new["components"][1]["value"] is None
    api.op("record_quote", {"request_id": "qr_meadow_a", "currency": "INR", "qty": 700, "total": 1, "components": [{"label": "x", "value": 1}]}, user="u_tech", expect=403)


def test_quote_decisions_are_distinct(api):
    r = api.op("decide_quote", {"quote_id": "q_o1", "decision": "approve", "kind": "vendor_acceptance", "scope": "400 pcs", "evidence": "Vendor email"})
    q = r["state"]["quotes"]["q_o1"]
    assert q["state"] == "received"                                    # vendor acceptance does not imply internal approval
    q = api.op("decide_quote", {"quote_id": "q_o1", "decision": "approve", "kind": "internal_commercial", "scope": "400 pcs", "evidence": "Neg note"})["state"]["quotes"]["q_o1"]
    assert q["state"] == "approved"


def test_costing_request_draft_vs_issue_and_readiness(api):
    api.op("create_quote_request", {"style_id": "s_vs3", "vendor_id": "v_sunrise", "qty_basis": "300"}, expect=409)       # no BOM
    r = api.op("issue_quote_request", {"request_id": "qr_orbit_s"})
    assert r["state"]["quote_requests"]["qr_orbit_s"]["simulated_send"] is True
    assert any("SIMULATED" in e["title"] for e in r["state"]["events"].values())


def test_allocation_cannot_exceed_confirmed_and_draft_not_allocatable(api):
    api.op("allocate", {"order_id": "o_meadow_repeat", "line_id": "ol_rep1", "vendor_id": "v_lotus", "qty": {"M": 10}}, expect=409)
    r = api.op("allocate", {"order_id": "o_meadow", "line_id": "ol_navy", "vendor_id": "v_lotus", "qty": {"M": 1}}, expect=409)
    assert "Over-allocation" in r["detail"]
    s = api.get()
    assert s["derived"]["orders"]["o_meadow"]["unallocated"] == 0
    assert s["derived"]["orders"]["o_meadow_repeat"]["confirmed"] is False


def test_order_confirmation_requires_evidence(api):
    r = api.op("confirm_order", {"order_id": "o_meadow_repeat"}, expect=409)
    assert "PO / acceptance evidence" in r["missing"]
    api.op("confirm_order", {"order_id": "o_meadow_repeat"}, user="u_tech", expect=403)


def test_progress_rules_unauthorised_start_flagged_and_other_totals_kept(api):
    s = api.get()
    assert s["allocations"]["al_a"]["unauthorised_start"] is True
    totals_before = s["derived"]["allocations"]["al_b"]["totals"]
    r = api.op("update_progress", {"allocation_id": "al_b", "type": "cut", "basis": "cumulative", "qty": 700, "source": "daily report"})
    assert r["state"]["derived"]["allocations"]["al_b"]["totals"] == totals_before
    api.op("update_progress", {"allocation_id": "al_b", "type": "packed", "basis": "cumulative", "qty": 700, "source": "x"}, expect=409)       # > sewn needs reason
    api.op("update_progress", {"allocation_id": "al_b", "type": "sewn", "basis": "cumulative", "qty": 10, "source": "x"}, expect=409)        # lowering needs reason
    api.op("update_progress", {"allocation_id": "al_b", "type": "sewn", "basis": "cumulative", "qty": -3, "source": "x"}, expect=422)
    api.op("update_progress", {"allocation_id": "al_b", "type": "sewn", "source": "x", "qty": 5}, expect=422)    # basis must be explicit
    r = api.op("update_progress", {"allocation_id": "al_a", "type": "sewn", "basis": "incremental", "qty": 50, "source": "call"})
    assert r["result"]["flag"]                                       # truthful recording, flagged
    assert r["state"]["allocations"]["al_a"]["gate3"]["state"] == "pending"                         # but release not granted


def test_gate3_blocked_until_pp_approval_and_scoped_to_allocation(api):
    r = api.op("sign_gate3", {"allocation_id": "al_a", "date": "2026-10-06", "attendees": ["x"], "minutes": "m", "decision": "release", "scope": "Vendor A"}, expect=409)
    assert r["code"] == "gate_blocked"
    s = api.get()
    assert s["allocations"]["al_b"]["gate3"]["state"] == "signed"     # B's release independent of A


def test_inspection_failure_recheck_and_partial_release(api):
    s = api.get()
    clr = {c["key"]: c["state"] for c in s["derived"]["allocations"]["al_b"]["clearance"]}
    assert clr["final"] == "partial"                                  # lot 2 passed, lot 1 failed: style not cleared
    # cannot pass above limits
    r = api.op("record_inspection", {"allocation_id": "al_b", "type": "Final", "lot": "Lot 1", "result": "pass", "qty_inspected": 600, "plan_ref": "p", "date": "2026-10-06",
                                     "limits": {"major_accept": 5, "minor_accept": 7}, "defects": [{"cat": "Major", "name": "x", "count": 9}], "recheck_of": "ins_b_final1", "rechecked": "x", "cleared_qty": 10},
               user="u_qa", expect=409)
    assert r["code"] == "limit_exceeded"
    api.op("record_inspection", {"allocation_id": "al_b", "type": "Final", "lot": "Lot 1", "result": "pass", "qty_inspected": 410, "plan_ref": "p", "date": "2026-10-06", "defects": [],
                                 "recheck_of": "ins_b_final1"}, user="u_qa", expect=422)       # must say what was rechecked
    s = api.op("record_inspection", {"allocation_id": "al_b", "type": "Final", "lot": "Lot 1", "result": "pass", "qty_inspected": 410, "plan_ref": "p", "date": "2026-10-06",
                                     "defects": [], "recheck_of": "ins_b_final1", "rechecked": "Reworked 410 collars only", "cleared_qty": 410}, user="u_qa")["state"]
    assert s["inspections"]["ins_b_final1"]["result"] == "fail"       # failure retained
    assert s["derived"]["allocations"]["al_b"]["cleared_qty"] == 100 + 410


def test_shipment_only_cleared_quantity_and_grn_variance(api):
    api.op("release_shipment", {"order_id": "o_meadow", "lines": [{"allocation_id": "al_b", "lot": "Lot 1", "colour": "Olive", "qty": 50}], "destination": "DC", "carrier": "C"}, user="u_qa", expect=409)
    api.op("release_shipment", {"order_id": "o_meadow", "lines": [{"allocation_id": "al_b", "lot": "Lot 2", "colour": "Olive", "qty": 1}], "destination": "DC", "carrier": "C"}, user="u_qa", expect=409)   # already shipped
    s = api.op("update_shipment", {"shipment_id": "sh_1", "state": "delivered", "date": "2026-10-06"})["state"]
    assert s["shipments"]["sh_1"]["state"] == "delivered" and s["orders"]["o_meadow"]["state"] == "confirmed"
    s = api.op("update_shipment", {"shipment_id": "sh_1", "state": "grn", "date": "2026-10-06", "received_qty": 96})["state"]
    assert s["shipments"]["sh_1"]["variance"] == -4
    api.op("update_shipment", {"shipment_id": "sh_1", "state": "dispatched", "date": "2026-10-06"}, expect=409)


def test_milestone_proposal_never_replaces_agreed(api):
    r = api.op("propose_milestone", {"milestone_id": "ms_a7", "date": "2026-10-20", "reason": "Another round"})
    m = r["state"]["milestones"]["ms_a7"]
    assert m["agreed"] == "2026-10-18" and m["proposed"] == "2026-10-20" and m["baseline"] == "2026-10-18"
    api.op("decide_milestone", {"milestone_id": "ms_a7", "decision": "accept"}, user="u_head", expect=422)
    m = api.op("decide_milestone", {"milestone_id": "ms_a7", "decision": "accept", "evidence": "Vendor call"}, user="u_head")["state"]["milestones"]["ms_a7"]
    assert m["agreed"] == "2026-10-20" and m["baseline"] == "2026-10-18"


# ---------------- vendors ----------------
def test_duplicate_vendor_warning_but_allowed(api):
    r = api.op("create_vendor", {"name": "Sunrise Garments Pvt Ltd", "location": "Bengaluru"}, expect=409)
    assert r["similar"][0]["id"] == "v_sunrise"
    api.op("create_vendor", {"name": "Sunrise Garments Pvt Ltd", "location": "Bengaluru", "confirm_distinct": True})
    api.op("create_vendor", {"name": "Brand New Mills"}, expect=422)           # location or explicit unknown
    api.op("create_vendor", {"name": "Brand New Mills", "location_unknown": True})


def test_draft_vs_published_visit_and_privacy_of_drafts(api):
    s = api.get("u_merch1")
    assert s["derived"]["vendors"]["v_kaveri"]["latest_visit_id"] == "vis_kav_2"      # draft doesn't count
    assert "vis_kav_draft" not in api.get("u_head")["visits"]
    r = api.op("save_visit", {"vendor_id": "v_kaveri", "factory_id": "f_kav1", "date": "2026-10-06", "attendees": ["u_merch1"], "observations": "", "publish": True}, user="u_merch1", expect=422)
    r = api.op("save_visit", {"vendor_id": "v_kaveri", "factory_id": "f_kav1", "date": "2026-10-06", "attendees": ["u_merch1"], "observations": "",
                              "attachments": [{"name": "a.jpg", "kind": "photo", "caption": "Line 1"}], "publish": True,
                              "followups": [{"title": "Share price list", "assignee_id": "u_merch1", "due": "2026-10-10"}]}, user="u_merch1")
    s = r["state"]
    assert s["derived"]["vendors"]["v_kaveri"]["latest_visit_id"] == r["result"]["visit_id"]
    assert any(a["title"] == "Share price list" and a["vendor_id"] == "v_kaveri" for a in s["actions"].values())
    # profile not changed by saving a visit
    assert s["vendors"]["v_kaveri"]["profile_history"] == []


def test_visit_correction_keeps_id_and_history(api):
    r = api.op("edit_visit", {"visit_id": "vis_kav_1", "reason": "Fix date", "fields": {"date": "2026-08-01"}})
    s = r["state"]
    assert s["visits"]["vis_kav_1"]["date"] == "2026-08-01"
    assert s["visits"]["vis_kav_1"]["history"][-1]["changes"][0]["old"] == "2026-08-07"
    assert len([v for v in s["visits"].values() if v["vendor_id"] == "v_kaveri" and v["state"] == "published"]) == 2
    api.op("edit_visit", {"visit_id": "vis_kav_1", "reason": "x", "fields": {}}, expect=422)


def test_profile_changes_are_explicit(api):
    s = api.get()
    assert [c for c in s["vendors"]["v_kaveri"]["capabilities"] if c["id"] == "cp2"][0]["state"] == "planned"
    s = api.op("decide_profile_change", {"proposal_id": "pp1", "decision": "skip"})["state"]
    assert s["profile_proposals"]["pp1"]["state"] == "skipped" and s["vendors"]["v_kaveri"]["profile_history"] == []


def test_assessment_never_defaults_to_approved_and_mixed_label(api):
    d = api.get()["derived"]["vendors"]
    assert d["v_sunrise"]["mixed_assessments"] and d["v_sunrise"]["assessment_label"] == "Mixed / unit-specific assessments"
    assert d["v_kaveri"]["assessment_label"] is None                    # no assessment on file
    assert d["v_lotus"]["assessment_label"] == "Pending review"


def test_finding_closure_flow_separates_task_evidence_verification(api):
    api.op("submit_closure", {"finding_id": "f_sunrise_2", "note": "Hem check added"}, expect=422)   # needs evidence
    s = api.op("submit_closure", {"finding_id": "f_sunrise_2", "note": "Hem check added", "attachments": [{"name": "hem-check.pdf"}]}, user="u_merch1")["state"]
    assert s["findings"]["f_sunrise_2"]["state"] == "awaiting_verification"
    assert s["actions"]["a_vendor_review"]["status"] == "open"          # evidence submitted != task complete
    api.op("verify_closure", {"finding_id": "f_sunrise_2", "decision": "verify", "note": "ok"}, user="u_merch1", expect=403)
    r = api.op("verify_closure", {"finding_id": "f_sunrise_2", "decision": "more_evidence", "note": "Need 2 weeks of data"}, user="u_qa")
    assert r["state"]["findings"]["f_sunrise_2"]["state"] == "open" and len(r["state"]["findings"]["f_sunrise_2"]["submissions"]) == 1


def test_reaudit_required_blocks_verification_and_closing_does_not_change_outcome(api):
    # f_sunrise_3 awaits verification but audit au_sun2 requires re-audit only for f_sunrise_1; flip it to test the rule
    api.op("submit_closure", {"finding_id": "f_sunrise_1", "note": "Needle log started", "attachments": [{"name": "log.jpg"}]}, user="u_merch1")
    r = api.op("verify_closure", {"finding_id": "f_sunrise_1", "decision": "verify", "note": "Looks right"}, user="u_qa", expect=409)
    assert r["code"] == "reaudit_required"
    api.op("record_audit", {"vendor_id": "v_sunrise", "factory_id": "f_sun2", "date": "2026-10-06", "auditor": "John Doe (QA lead)", "scope": "Needle control re-audit", "reassessment_of": "au_sun2"})
    s = api.op("verify_closure", {"finding_id": "f_sunrise_1", "decision": "verify", "note": "Re-audit confirms"}, user="u_qa")["state"]
    assert s["findings"]["f_sunrise_1"]["state"] == "verified_closed"
    assert s["audits"]["au_sun2"]["outcome"].startswith("Grade C")        # historical outcome untouched
    s = api.op("reopen_finding", {"finding_id": "f_sunrise_1", "reason": "Log lapsed"})["state"]
    assert s["findings"]["f_sunrise_1"]["state"] == "reopened" and s["findings"]["f_sunrise_1"]["history"]


def test_partial_capture_is_visible(api):
    s = api.get()
    a = s["audits"]["au_sun2"]
    captured = len([f for f in s["findings"].values() if f["audit_id"] == "au_sun2"])
    assert a["reported_totals"]["critical"] == 4 and captured == 3 and not a["capture_complete"]


# ---------------- tech pack review & sample review tasks ----------------
CHECK_OK = [{"key": k, "state": "ok"} for k in ("complete", "prior", "feasible", "queries", "attachments")]
SECTIONS = {k: f"{k} text" for k in ("construction", "stitching", "artwork", "labels", "care", "packing")}


def test_techpack_review_needs_content_checklist_and_is_not_sample_approval(api):
    assert api.get("u_tech")["actions"]["a_tp_vs1"]["status"] == "open"
    r = api.op("review_techpack", {"style_id": "s_vs1", "result": "approve", "checklist": CHECK_OK}, user="u_tech", expect=409)
    assert any("sections still empty" in p for p in r["problems"])
    api.op("review_techpack", {"style_id": "s_vs1", "result": "approve", "checklist": CHECK_OK}, user="u_head", expect=403)   # not a technical reviewer
    api.op("save_techpack_content", {"style_id": "s_vs1", "sections": SECTIONS}, user="u_tech")
    r = api.op("review_techpack", {"style_id": "s_vs1", "result": "approve", "checklist": CHECK_OK[:4]}, user="u_tech", expect=409)
    assert any("Checklist item" in p for p in r["problems"])
    s = api.op("review_techpack", {"style_id": "s_vs1", "result": "approve", "checklist": CHECK_OK}, user="u_tech")["state"]
    assert s["styles"]["s_vs1"]["techpack_review"]["state"] == "approved"
    assert s["actions"]["a_tp_vs1"]["status"] == "completed"
    assert s["sample_requests"] and not any(r["external"]["state"] == "approved" for r in s["sample_rounds"].values() if s["sample_requests"][r["request_id"]]["style_id"] == "s_vs1")


def test_techpack_changes_requested_creates_followup_and_completes_review_task(api):
    s = api.op("review_techpack", {"style_id": "s_vs2", "result": "changes", "note": "Collar stand detail missing", "checklist": [{"key": "complete", "state": "issue", "note": "Collar stand"}]}, user="u_tech")["state"]
    assert s["actions"]["a_tp_vs2"]["status"] == "completed"
    assert s["styles"]["s_vs2"]["techpack_review"]["state"] == "changes_requested"
    assert any(a["title"].startswith("Address tech pack review comments") and a["assignee_id"] == "u_merch2" for a in s["actions"].values())


def test_editing_content_after_approval_makes_review_stale_and_lock_is_respected(api):
    r = api.op("save_techpack_content", {"style_id": "s_meadow", "sections": SECTIONS}, user="u_tech", expect=409)       # active PP request locks it
    assert r["code"] == "locked"
    api.op("save_techpack_content", {"style_id": "s_vs1", "sections": SECTIONS}, user="u_tech")
    api.op("review_techpack", {"style_id": "s_vs1", "result": "approve", "checklist": CHECK_OK}, user="u_tech")
    r = api.op("save_techpack_content", {"style_id": "s_vs1", "sections": {**SECTIONS, "care": "changed"}}, user="u_tech")
    assert r["result"]["stale"] and r["state"]["derived"]["styles"]["s_vs1"]["techpack"]["review_state"] == "stale"


def test_receipt_creates_review_task_once_and_internal_review_completes_it(api):
    api.op("record_sample_movement", {"round_id": "sr_a_pp2", "kind": "received", "qty": 3, "date": "2026-10-06", "colour": "Navy", "size": "M"}, expect=422)   # only 2 dispatched
    r = api.op("record_sample_movement", {"round_id": "sr_a_pp2", "kind": "received", "qty": 2, "date": "2026-10-06", "colour": "Navy", "size": "M"})
    tasks = [a for a in r["state"]["actions"].values() if a.get("sample_round_id") == "sr_a_pp2" and a.get("sample_review")]
    assert len(tasks) == 1 and tasks[0]["assignee_id"] == "u_tech" and tasks[0]["status"] == "open"
    api.op("add_correction", {"round_id": "sr_a_pp2", "text": "Collar roll", "scope": "Navy M"}, user="u_tech")
    s = api.op("internal_review", {"round_id": "sr_a_pp2", "result": "changes", "note": "Collar roll"}, user="u_tech")["state"]
    assert s["actions"][tasks[0]["id"]]["status"] == "completed"
