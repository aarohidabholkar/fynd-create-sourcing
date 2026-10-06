"""Cross-product rules from the PRDs: one action identity, separated states, privacy, permissions."""


def test_state_has_derived_and_demo_notice(api):
    s = api.get()
    assert s["meta"]["demo"] and "illustrative" in s["meta"]["notice"]
    assert s["derived"]["works"]["w_jaal"]["counts"]["styles"] == 22
    assert all(u["name"] == "John Doe" for u in s["users"].values())


def test_followup_attaches_to_same_action_and_blocks_duplicates(api):
    before = len(api.get()["actions"])
    r = api.op("request_update", {"action_id": "a_resubmit", "question": "Any news on the courier?", "response_due": "2026-10-08"})
    s = r["state"]
    assert len(s["actions"]) == before                       # no new task
    req = s["requests"][r["result"]["request_id"]]
    assert req["action_id"] == "a_resubmit" and req["recipient_id"] == "u_merch1"
    assert s["actions"]["a_resubmit"]["due"] == "2026-10-03"  # delivery deadline untouched by response deadline
    dup = api.op("request_update", {"action_id": "a_resubmit", "question": "Again?"}, expect=409)
    assert dup["code"] == "duplicate_request" and dup["request_id"] == req["id"]


def test_empty_question_rejected(api):
    api.op("request_update", {"action_id": "a_resubmit", "question": "   "}, expect=422)


def test_response_does_not_complete_or_resolve_and_read_is_explicit(api):
    r = api.op("request_update", {"action_id": "a_resubmit", "question": "Status?"})
    rid = r["result"]["request_id"]
    api.op("respond_request", {"request_id": rid, "text": "Still blocked on fabric lot."}, user="u_merch1")
    s = api.get()
    assert s["requests"][rid]["state"] == "responded"
    assert s["actions"]["a_resubmit"]["status"] == "blocked"      # not completed
    assert s["issues"]["i_sleeve"]["state"] == "open"              # not resolved
    assert s["requests"][rid]["requester_read_at"] is None         # opening a page doesn't mark read
    api.op("view_work", {"work_id": "w_orbit"})
    assert api.get()["requests"][rid]["requester_read_at"] is None
    api.op("read_response", {"request_id": rid})
    assert api.get()["requests"][rid]["requester_read_at"] is not None


def test_only_recipient_can_respond(api):
    r = api.op("request_update", {"action_id": "a_resubmit", "question": "Status?"})
    api.op("respond_request", {"request_id": r["result"]["request_id"], "text": "x"}, user="u_qa", expect=403)


def test_reassign_moves_pending_request_and_keeps_history(api):
    s = api.op("reassign_action", {"action_id": "a_tech_review", "assignee_id": "u_qa"})["state"]
    req = s["requests"]["r_sleeve"]
    assert req["recipient_id"] == "u_qa" and req["recipient_history"][0]["recipient_id"] == "u_tech"
    assert s["works"]["w_orbit"]["owner_id"] == "u_head"           # overall owner unchanged
    api.op("reassign_action", {"action_id": "a_tech_review", "assignee_id": "u_tech"}, user="u_tech", expect=403)


def test_concurrent_edit_conflict(api):
    api.op("reassign_action", {"action_id": "a_tech_review", "assignee_id": "u_qa"})
    r = api.op("reassign_action", {"action_id": "a_tech_review", "assignee_id": "u_prod", "if_rev": 1}, expect=409)
    assert r["code"] == "conflict"


def test_resolve_one_issue_keeps_track_active_and_requests(api):
    before = api.get()
    assert before["derived"]["works"]["w_meadow"]["attention_count"] == 1   # i_collar qualifies, i_packing doesn't
    api.op("resolve_issue", {"issue_id": "i_packing", "note": "Packing list corrected"})
    mid = api.get()
    assert mid["works"]["w_meadow"]["lifecycle"] == "active"
    assert mid["derived"]["works"]["w_meadow"]["attention_count"] == 1
    r = api.op("resolve_issue", {"issue_id": "i_collar", "note": "Re-inspection passed"})
    s = r["state"]
    assert s["derived"]["works"]["w_meadow"]["attention_count"] == 0
    assert s["requests"]["r_defect"]["state"] == "responded"               # not silently cancelled
    # reopen restores the SAME id and keeps the earlier resolution
    s = api.op("reopen_issue", {"issue_id": "i_collar", "reason": "Defects found again"})["state"]
    assert s["issues"]["i_collar"]["state"] == "open"
    assert s["issues"]["i_collar"]["resolution_history"][0]["note"] == "Re-inspection passed"
    assert len([i for i in s["issues"].values() if i["title"].startswith("Vendor B Lot 1")]) == 1


def test_resolve_requires_note_and_permission(api):
    api.op("resolve_issue", {"issue_id": "i_collar", "note": " "}, expect=422)
    api.op("reopen_issue", {"issue_id": "i_trim", "reason": "x"}, user="u_tech", expect=403)


def test_completion_rules_and_review_gate(api):
    api.op("complete_action", {"action_id": "a_reinspect", "outcome": "done"}, user="u_qa", expect=409)   # requires review
    api.op("submit_review", {"action_id": "a_reinspect", "note": "Re-inspection report attached"}, user="u_qa")
    api.op("review_decision", {"action_id": "a_reinspect", "decision": "approve", "comment": "ok"}, user="u_qa", expect=403)   # not own work
    r = api.op("complete_action", {"action_id": "a_fabric_options", "outcome": "Deck shared"}, user="u_merch1")
    s = r["state"]
    assert s["actions"]["a_fabric_options"]["status"] == "completed"
    assert s["issues"]["i_collar"]["state"] == "open"
    s = api.op("reopen_action", {"action_id": "a_fabric_options", "reason": "Brand asked for more"})["state"]
    assert s["actions"]["a_fabric_options"]["status"] == "open"
    assert s["actions"]["a_fabric_options"]["completion_history"][0]["outcome"] == "Deck shared"


def test_sample_review_approval_cannot_bypass_gate(api):
    s = api.op("add_action", {"title": "Approve sleeve", "assignee_id": "u_tech", "work_id": "w_orbit", "requires_review": True})["state"]
    aid = [k for k, a in s["actions"].items() if a["title"] == "Approve sleeve"][0]
    api.op("submit_review", {"action_id": aid, "note": "x"}, user="u_tech")
    api.op("review_decision", {"action_id": aid, "decision": "changes", "comment": "needs work"}, user="u_qa")
    assert api.get()["actions"][aid]["status"] == "open"


def test_private_notes_never_leak(api):
    s = api.get("u_head")
    assert "n_private1" in s["notes"]
    other = api.get("u_qa")
    assert "n_private1" not in other["notes"] and "n_private2" not in other["notes"]
    # linking to a brand does not publish
    r = api.op("save_note", {"title": "Secret", "body": "private thought", "links": {"brand_id": "b_argo"}}, user="u_qa")
    nid = r["result"]["note_id"]
    assert nid not in api.get("u_head")["notes"]
    assert not any("private thought" in str(e) for e in api.get("u_head")["events"].values())
    api.op("post_note", {"note_id": nid, "targets": {}}, user="u_qa", expect=422)       # needs explicit destination


def test_post_note_is_one_record_many_links_and_changes_nothing_else(api):
    before = api.get()["commitments"]["c_orbit_sample"]
    r = api.op("post_note", {"title": "Vendor says tomorrow", "body": "Vendor says tomorrow.", "targets": {"work_ids": ["w_orbit"], "vendor_ids": ["v_kaveri"], "style_ids": ["s_orbit"]}})
    s = r["state"]
    ev = [e for e in s["events"].values() if e["scope"].get("note_id") == r["result"]["note_id"]]
    assert len(ev) == 1                                           # one shared record
    assert s["commitments"]["c_orbit_sample"]["agreed"] == before["agreed"]    # no date change
    assert s["commitments"]["c_orbit_sample"]["proposed"] == before["proposed"]
    api.op("save_note", {"note_id": r["result"]["note_id"], "body": "edit"}, expect=409)   # posted notes can't go back to private/edited


def test_proposed_date_never_replaces_agreed(api):
    s = api.get()["commitments"]["c_orbit_sample"]
    assert s["agreed"] and s["proposed"]
    r = api.op("decide_commitment", {"commitment_id": "c_orbit_sample", "decision": "accept"}, expect=422)    # evidence required
    r = api.op("decide_commitment", {"commitment_id": "c_orbit_sample", "decision": "accept", "evidence": "Call with vendor"})
    c = r["state"]["commitments"]["c_orbit_sample"]
    assert c["agreed"] == "2026-10-09" and c["original"] == "2026-10-05" and c["proposed"] is None
    assert c["revisions"][0]["was_agreed"] == "2026-10-05"


def test_idempotency_prevents_double_submission(api):
    n = len(api.get()["actions"])
    api.op("add_action", {"title": "Once only", "assignee_id": "u_qa", "work_id": "w_orbit"}, key="abc")
    r = api.op("add_action", {"title": "Once only", "assignee_id": "u_qa", "work_id": "w_orbit"}, key="abc")
    assert r["duplicate"] and len(api.get()["actions"]) == n + 1


def test_simulated_failure_changes_nothing(api):
    rev = api.get()["meta"]["rev"]
    api.op("add_action", {"title": "x", "assignee_id": "u_qa"}, fail=True, expect=503)
    assert api.get()["meta"]["rev"] == rev


def test_view_is_personal_and_does_not_change_shared_updated_at(api):
    before = api.get()["works"]["w_orbit"]["updated_at"]
    r = api.op("view_work", {"work_id": "w_orbit"}, user="u_qa")
    assert r["result"]["previous"] is not None
    s = api.get()
    assert s["works"]["w_orbit"]["updated_at"] == before
    assert api.get("u_head")["viewer"]["work_views"]["w_orbit"]["last_viewed"].startswith("2026-10-05")


def test_link_unlinked_conversation_does_not_duplicate(api):
    n = len([e for e in api.get()["events"].values() if e.get("source_id") == "src_argo_enquiry"])
    s = api.op("link_source", {"source_id": "src_argo_enquiry", "work_id": "w_orbit"})["state"]
    assert len([e for e in s["events"].values() if e.get("source_id") == "src_argo_enquiry"]) == n
    assert s["sources"]["src_argo_enquiry"]["work_ids"] == ["w_orbit"]


def test_commercial_fields_hidden_without_capability(api):
    s = api.get("u_tech")
    assert all(q["total"] is None and q["restricted"] for q in s["quotes"].values())
    assert api.get("u_head")["quotes"]["q_a2"]["total"] == 612


def test_follow_up_external_is_logged_as_simulated(api):
    r = api.op("follow_up", {"action_id": "a_resubmit", "message": "Chasing", "channel": "email"})
    ev = [e for e in r["state"]["events"].values() if e["kind"] == "followup_logged"]
    assert "simulated" in ev[0]["title"].lower()
    assert not any(x["action_id"] == "a_resubmit" and x["question"] == "Chasing" for x in r["state"]["requests"].values())
