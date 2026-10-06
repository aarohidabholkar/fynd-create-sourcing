"""Styles, costing, sampling, orders, production. ALL ILLUSTRATIVE DEMO DATA."""
from .clock import d, dt

SIZES = ["S", "M", "L", "XL"]


def _pom(base="M"):
    return [
        {"id": "p_chest", "name": "Chest (1 cm below armhole)", "unit": "cm", "target": 58.0, "tol": 1.0, "base_size": base},
        {"id": "p_len", "name": "Body length (HPS)", "unit": "cm", "target": 76.0, "tol": 1.0, "base_size": base},
        {"id": "p_sh", "name": "Shoulder width", "unit": "cm", "target": 46.0, "tol": 0.5, "base_size": base},
        {"id": "p_sleeve", "name": "Sleeve length", "unit": "cm", "target": 62.0, "tol": 0.7, "base_size": base},
        {"id": "p_collar", "name": "Collar spread", "unit": "cm", "target": 8.5, "tol": 0.3, "base_size": base},
    ]


def _bom(version=1, with_items=True):
    if not with_items:
        return {"version": version, "items": []}
    return {"version": version, "items": [
        {"id": "m1", "kind": "Fabric", "name": "Cotton poplin 120 gsm", "consumption": 1.65, "unit": "m/pc"},
        {"id": "m2", "kind": "Trim", "name": "Corozo buttons 18L", "consumption": 8, "unit": "pcs/pc"},
        {"id": "m3", "kind": "Trim", "name": "Main label + care label", "consumption": 2, "unit": "pcs/pc"},
        {"id": "m4", "kind": "Packing", "name": "Polybag + carton share", "consumption": 1, "unit": "set/pc"},
    ]}


def _spec(v, state, day, author, reason, changed=None):
    return {"v": v, "state": state, "date": d(day), "author_id": author, "reason": reason, "changed": changed or [], "frozen": state == "released"}


def _style(sid, brand, work, name, cat, owner, lifecycle="active", bom=True, specs=None, pom=True, selection=None, season="AW27", files=None, created=-40, desc=""):
    return {"id": sid, "brand_id": brand, "work_id": work, "name": name, "category": cat, "season": season, "owner_id": owner,
            "lifecycle": lifecycle, "created_at": dt(created), "description": desc, "image": None,
            "spec_versions": specs if specs is not None else [_spec(1, "released", created + 3, owner, "Initial release")],
            "bom": _bom(1, bom), "pom": _pom() if pom else [], "files": files or [{"name": "Tech pack.pdf", "kind": "Tech pack", "demo": True}],
            "selection": selection, "owner_history": []}


STYLES = {
    "s_meadow": _style("s_meadow", "b_argo", "w_meadow", "Meadow shirt", "Menswear / Shirts / Casual", "u_merch1",
        specs=[_spec(1, "superseded", -70, "u_merch1", "Initial release"),
               _spec(2, "released", -40, "u_tech", "Body length revised +2 cm after fit round 1", ["Body length +2 cm", "Fabric consumption 1.60 → 1.65 m/pc"])],
        selection={"state": "selected", "by": "u_head", "at": dt(-50), "why": "Brand selected after fit round 2 approval.", "source": "Brand email (summary supplied)"},
        files=[{"name": "Tech pack v2.pdf", "kind": "Tech pack", "demo": True}, {"name": "Artwork - collar label.ai", "kind": "Artwork", "demo": True},
               {"name": "Pattern block M.dxf", "kind": "Pattern", "demo": True}], created=-70,
        desc="Casual cotton poplin shirt, two colourways (Navy, Olive)."),
    "s_orbit": _style("s_orbit", "b_argo", "w_orbit", "Orbit overshirt", "Menswear / Outerwear / Overshirt", "u_merch1",
        specs=[_spec(1, "released", -30, "u_tech", "Initial release")], created=-32,
        files=[{"name": "Tech pack v1.pdf", "kind": "Tech pack", "demo": True}], desc="Workwear overshirt with chest patch pockets."),
    "s_trail": _style("s_trail", "b_argo", "w_orbit", "Trail vest", "Menswear / Outerwear / Vest", "u_merch1",
        selection={"state": "held", "by": "u_head", "at": dt(-6), "why": "Brand holding until Orbit fit is settled.", "source": "Weekly sync"}, created=-25),
    "s_gr1": _style("s_gr1", "b_vmart", "w_green", "Green co-ord set 1", "Womenswear / Ethnic / Co-ord", "u_merch2", season="Festive",
        selection={"state": "selected", "by": "u_merch2", "at": dt(-14), "why": "Brand shortlisted.", "source": "Brand message (summary supplied)"}, created=-30),
    "s_gr2": _style("s_gr2", "b_vmart", "w_green", "Green co-ord set 2", "Womenswear / Ethnic / Co-ord", "u_merch2", season="Festive",
        selection={"state": "selected", "by": "u_merch2", "at": dt(-14), "why": "Brand shortlisted.", "source": "Brand message (summary supplied)"}, created=-30),
    "s_gr3": _style("s_gr3", "b_vmart", "w_green", "Green co-ord set 3", "Womenswear / Ethnic / Co-ord", "u_merch2", season="Festive", lifecycle="dropped",
        selection={"state": "dropped", "by": "u_merch2", "at": dt(-12), "why": "Brand dropped due to print complexity.", "source": "Brand message (summary supplied)"}, created=-30),
    "s_vs1": _style("s_vs1", "b_vmart", "w_shirt", "Formal shirt - white", "Menswear / Shirts / Formal", "u_merch2", season="SS27", created=-20),
    "s_vs2": _style("s_vs2", "b_vmart", "w_shirt", "Casual shirt - checks", "Menswear / Shirts / Casual", "u_merch2", season="SS27", created=-20),
    "s_vs3": _style("s_vs3", "b_vmart", "w_shirt", "Linen shirt - draft", "Menswear / Shirts / Linen", "u_merch2", season="SS27", lifecycle="draft",
        bom=False, specs=[], pom=False, created=-6, files=[]),
}
for n in range(1, 23):
    sid = f"s_jl{n:02d}"
    STYLES[sid] = _style(sid, "b_jaal", "w_jaal", f"Jaal core style {n:02d}", "Womenswear / Kurtas" if n % 2 else "Menswear / Tees", "u_merch2",
                         season="SS27", created=-30)
    STYLES[sid]["demo_generated"] = True

# ---- Costing --------------------------------------------------------------
def _comp(label, val, unit="INR/pc"):
    return {"label": label, "value": val, "unit": unit}


QUOTE_REQUESTS = {
    "qr_meadow_a": {"id": "qr_meadow_a", "style_id": "s_meadow", "vendor_id": "v_sunrise", "spec_version": 2, "bom_version": 1, "qty_basis": "700 pcs", "target_price": 640,
                    "due": d(-45), "issued_at": dt(-46), "state": "received", "owner_id": "u_merch1", "recipient": "John Doe (vendor contact, Sunrise Garments)", "simulated_send": True},
    "qr_meadow_b": {"id": "qr_meadow_b", "style_id": "s_meadow", "vendor_id": "v_lotus", "spec_version": 2, "bom_version": 1, "qty_basis": "700 pcs", "target_price": 640,
                    "due": d(-44), "issued_at": dt(-46), "state": "received", "owner_id": "u_merch1", "recipient": "John Doe (vendor contact, Lotus Knit Works)", "simulated_send": True},
    "qr_orbit_k": {"id": "qr_orbit_k", "style_id": "s_orbit", "vendor_id": "v_kaveri", "spec_version": 1, "bom_version": 1, "qty_basis": "400 pcs", "target_price": 1450,
                   "due": d(-10), "issued_at": dt(-20), "state": "received", "owner_id": "u_merch1", "recipient": "John Doe (vendor contact, Kaveri Apparels)", "simulated_send": True},
    "qr_orbit_s": {"id": "qr_orbit_s", "style_id": "s_orbit", "vendor_id": "v_sunrise", "spec_version": 1, "bom_version": 1, "qty_basis": "400 pcs", "target_price": 1450,
                   "due": d(4), "issued_at": None, "state": "draft", "owner_id": "u_merch1", "recipient": None, "simulated_send": False},
}

QUOTES = {
    "q_a1": {"id": "q_a1", "request_id": "qr_meadow_a", "style_id": "s_meadow", "vendor_id": "v_sunrise", "version": 1, "spec_version": 1, "state": "superseded",
             "currency": "INR", "qty": 700, "moq": 300, "lead_days": 55, "terms": "FOB Chennai; 30% advance", "total": 598,
             "components": [_comp("Fabric", 262), _comp("Trims", 58), _comp("Conversion (CMT)", 175), _comp("Wastage", 18), _comp("Packing", 22), _comp("Logistics to port", 63)],
             "reason": "Initial quote on spec v1", "created_at": dt(-45), "author_id": "u_merch1", "source": "Email attachment (offline quote)", "decisions": []},
    "q_a2": {"id": "q_a2", "request_id": "qr_meadow_a", "style_id": "s_meadow", "vendor_id": "v_sunrise", "version": 2, "spec_version": 2, "state": "approved",
             "currency": "INR", "qty": 700, "moq": 300, "lead_days": 55, "terms": "FOB Chennai; 30% advance", "total": 612,
             "components": [_comp("Fabric", 276), _comp("Trims", 58), _comp("Conversion (CMT)", 175), _comp("Wastage", 18), _comp("Packing", 22), _comp("Logistics to port", 63)],
             "reason": "Revised for body length +2 cm (spec v2): consumption 1.60 → 1.65 m/pc.", "created_at": dt(-38), "author_id": "u_merch1", "source": "Email attachment (offline quote)",
             "decisions": [{"kind": "internal_commercial", "label": "Internal commercial approval", "by": "u_head", "at": dt(-35), "scope": "700 pcs · spec v2", "evidence": "Negotiation note (demo)"},
                           {"kind": "brand_price", "label": "Brand price acceptance", "by": "John Doe (brand contact, recorded by u_head)", "at": dt(-34), "scope": "Meadow · both colourways", "evidence": "Brand email (summary supplied)"}]},
    "q_b1": {"id": "q_b1", "request_id": "qr_meadow_b", "style_id": "s_meadow", "vendor_id": "v_lotus", "version": 1, "spec_version": 1, "state": "superseded",
             "currency": "INR", "qty": 700, "moq": None, "lead_days": 48, "terms": "Ex-factory; 40% advance", "total": 586,
             "components": [_comp("Fabric", 255), _comp("Trims", 55), _comp("Conversion (CMT)", 170), _comp("Wastage", None), _comp("Packing", 20), _comp("Logistics", None)],
             "reason": "Initial quote on spec v1; wastage and logistics not stated.", "created_at": dt(-44), "author_id": "u_merch1", "source": "Email attachment (offline quote)", "decisions": []},
    "q_b2": {"id": "q_b2", "request_id": "qr_meadow_b", "style_id": "s_meadow", "vendor_id": "v_lotus", "version": 2, "spec_version": 2, "state": "approved",
             "currency": "INR", "qty": 700, "moq": None, "lead_days": 48, "terms": "Ex-factory; 40% advance", "total": 604,
             "components": [_comp("Fabric", 268), _comp("Trims", 55), _comp("Conversion (CMT)", 170), _comp("Wastage", None), _comp("Packing", 20), _comp("Logistics", None)],
             "reason": "Revised for spec v2 consumption.", "created_at": dt(-37), "author_id": "u_merch1", "source": "Email attachment (offline quote)",
             "decisions": [{"kind": "internal_commercial", "label": "Internal commercial approval", "by": "u_head", "at": dt(-35), "scope": "700 pcs · spec v2", "evidence": "Negotiation note (demo)"}]},
    "q_o1": {"id": "q_o1", "request_id": "qr_orbit_k", "style_id": "s_orbit", "vendor_id": "v_kaveri", "version": 1, "spec_version": 1, "state": "received",
             "currency": "INR", "qty": 400, "moq": 200, "lead_days": 60, "terms": "FOB; 30% advance", "total": 1520,
             "components": [_comp("Fabric", 640), _comp("Trims", 150), _comp("Conversion (CMT)", 520), _comp("Wastage", 60), _comp("Packing", 40), _comp("Logistics", 110)],
             "reason": "Initial quote", "created_at": dt(-12), "author_id": "u_merch1", "source": "Email attachment (offline quote)", "decisions": []},
}

# ---- Sampling -------------------------------------------------------------
SAMPLE_REQUESTS = {
    "sq_meadow_fit_a": {"id": "sq_meadow_fit_a", "style_id": "s_meadow", "vendor_id": "v_sunrise", "type": "Fit", "spec_version": 1, "owner_id": "u_merch1",
        "due": d(-60), "prereq": None, "state": "closed", "colourways": ["Navy"], "sizes": ["M"]},
    "sq_meadow_pp_a": {"id": "sq_meadow_pp_a", "style_id": "s_meadow", "vendor_id": "v_sunrise", "type": "PP", "spec_version": 2, "owner_id": "u_merch1",
        "due": d(-4), "prereq": "Approved costing and released specification v2", "state": "active", "colourways": ["Navy"], "sizes": ["S", "M", "L", "XL"], "allocation_id": "al_a"},
    "sq_meadow_pp_b": {"id": "sq_meadow_pp_b", "style_id": "s_meadow", "vendor_id": "v_lotus", "type": "PP", "spec_version": 2, "owner_id": "u_merch1",
        "due": d(-20), "prereq": "Approved costing and released specification v2", "state": "closed", "colourways": ["Olive"], "sizes": ["S", "M", "L", "XL"], "allocation_id": "al_b"},
    "sq_orbit_fit_k": {"id": "sq_orbit_fit_k", "style_id": "s_orbit", "vendor_id": "v_kaveri", "type": "Fit", "spec_version": 1, "owner_id": "u_merch1",
        "due": d(-1), "prereq": None, "state": "active", "colourways": ["Khaki", "Slate"], "sizes": ["M"]},
    "sq_trail_proto_s": {"id": "sq_trail_proto_s", "style_id": "s_trail", "vendor_id": "v_sunrise", "type": "Proto", "spec_version": 1, "owner_id": "u_merch1",
        "due": d(-3), "prereq": "Costing request issued", "state": "active", "colourways": ["Olive"], "sizes": ["M"]},
    "sq_green1": {"id": "sq_green1", "style_id": "s_gr1", "vendor_id": "v_sunrise", "type": "Counter sample", "spec_version": 1, "owner_id": "u_merch2",
        "due": d(-7), "prereq": None, "state": "active", "colourways": ["Emerald", "Sage"], "sizes": ["M"]},
}


def _meas(sizes_vals, round_note=None):
    out = []
    for pom_id, size, colour, actual in sizes_vals:
        out.append({"pom_id": pom_id, "size": size, "colour": colour, "actual": actual})
    return out


SAMPLE_ROUNDS = {
    "sr_a_fit1": {"id": "sr_a_fit1", "request_id": "sq_meadow_fit_a", "round": 1, "previous_round_id": None,
        "requested": 2, "made": 2, "dispatched": 2, "received": 2, "dates": {"made": d(-72), "dispatched": d(-70), "received": d(-66)}, "tracking": "Courier ref DEMO-1182",
        "receipts": [{"colour": "Navy", "size": "M", "qty": 2, "date": d(-66), "by": "u_merch1"}],
        "measurements": _meas([("p_chest", "M", "Navy", 58.4), ("p_len", "M", "Navy", 74.0), ("p_sh", "M", "Navy", 46.2), ("p_sleeve", "M", "Navy", 62.3), ("p_collar", "M", "Navy", 8.6)]),
        "comments": [{"id": "cmt_a1", "text": "Body length short vs spec: increase by 2 cm.", "scope": "Navy · M", "state": "verified", "verified_by": "u_tech", "verified_at": dt(-50), "evidence": "Round 2 measurement"}],
        "internal": {"state": "changes_requested", "draft": False, "by": "u_tech", "at": dt(-64), "note": "Body length out of tolerance."},
        "external": {"state": "rejected", "person_role": "Head of design, Argo Navis (recorded by John Doe, Merchandiser)", "recorded_by": "u_merch1", "date": d(-62), "ref": "Brand email (summary supplied)", "version": 1, "scope": "Navy · M", "conditions": ""}},
    "sr_a_fit2": {"id": "sr_a_fit2", "request_id": "sq_meadow_fit_a", "round": 2, "previous_round_id": "sr_a_fit1",
        "requested": 2, "made": 2, "dispatched": 2, "received": 2, "dates": {"made": d(-56), "dispatched": d(-54), "received": d(-50)}, "tracking": "Courier ref DEMO-1345",
        "receipts": [{"colour": "Navy", "size": "M", "qty": 2, "date": d(-50), "by": "u_merch1"}],
        "measurements": _meas([("p_chest", "M", "Navy", 58.2), ("p_len", "M", "Navy", 76.3), ("p_sh", "M", "Navy", 46.1), ("p_sleeve", "M", "Navy", 62.1), ("p_collar", "M", "Navy", 8.5)]),
        "comments": [],
        "internal": {"state": "passed", "draft": False, "by": "u_tech", "at": dt(-49), "note": "All applicable measurements in tolerance."},
        "external": {"state": "approved", "person_role": "Head of design, Argo Navis (recorded by John Doe, Merchandiser)", "recorded_by": "u_merch1", "date": d(-48), "ref": "Brand email (summary supplied)", "version": 2, "scope": "Navy · M · fit specification v2", "conditions": ""}},
    "sr_a_pp1": {"id": "sr_a_pp1", "request_id": "sq_meadow_pp_a", "round": 1, "previous_round_id": None,
        "requested": 5, "made": 5, "dispatched": 5, "received": 3, "dates": {"made": d(-12), "dispatched": d(-9), "received": d(-5)}, "tracking": "Courier ref DEMO-2201 (3 of 5 pcs arrived; 2 pcs still in transit)",
        "receipts": [{"colour": "Navy", "size": "S", "qty": 1, "date": d(-5), "by": "u_prod"}, {"colour": "Navy", "size": "M", "qty": 1, "date": d(-5), "by": "u_prod"}, {"colour": "Navy", "size": "L", "qty": 1, "date": d(-5), "by": "u_prod"}],
        "measurements": _meas([("p_chest", "M", "Navy", 58.3), ("p_len", "M", "Navy", 77.4), ("p_sh", "M", "Navy", 46.1), ("p_sleeve", "M", "Navy", 62.2), ("p_collar", "M", "Navy", 8.9),
                               ("p_chest", "L", "Navy", 61.0), ("p_len", "L", "Navy", 78.2)]),
        "comments": [{"id": "cmt_pp1", "text": "Collar band stitching skips on 2 pieces; correct and resubmit.", "scope": "Navy · M, L", "state": "open", "verified_by": None, "verified_at": None, "evidence": None},
                     {"id": "cmt_pp2", "text": "Collar spread slightly wide on M (see measurement).", "scope": "Navy · M", "state": "open", "verified_by": None, "verified_at": None, "evidence": None}],
        "internal": {"state": "changes_requested", "draft": False, "by": "u_tech", "at": dt(-4), "note": "Collar stitching and collar spread to be corrected."},
        "external": {"state": "pending", "person_role": None, "recorded_by": None, "date": None, "ref": None, "version": None, "scope": None, "conditions": ""}},
    "sr_a_pp2": {"id": "sr_a_pp2", "request_id": "sq_meadow_pp_a", "round": 2, "previous_round_id": "sr_a_pp1",
        "requested": 3, "made": 3, "dispatched": 2, "received": 0, "dates": {"made": d(-1), "dispatched": d(0), "received": None}, "tracking": "Courier ref DEMO-2310 (2 of 3 pcs dispatched)",
        "receipts": [], "measurements": [], "comments": [],
        "internal": {"state": "not_started", "draft": False, "by": None, "at": None, "note": ""},
        "external": {"state": "pending", "person_role": None, "recorded_by": None, "date": None, "ref": None, "version": None, "scope": None, "conditions": ""}},
    "sr_b_pp1": {"id": "sr_b_pp1", "request_id": "sq_meadow_pp_b", "round": 1, "previous_round_id": None,
        "requested": 3, "made": 3, "dispatched": 3, "received": 3, "dates": {"made": d(-30), "dispatched": d(-27), "received": d(-23)}, "tracking": "Courier ref DEMO-1920",
        "receipts": [{"colour": "Olive", "size": "S", "qty": 1, "date": d(-23), "by": "u_prod"}, {"colour": "Olive", "size": "M", "qty": 1, "date": d(-23), "by": "u_prod"}, {"colour": "Olive", "size": "L", "qty": 1, "date": d(-23), "by": "u_prod"}],
        "measurements": _meas([("p_chest", "M", "Olive", 58.1), ("p_len", "M", "Olive", 76.2), ("p_sh", "M", "Olive", 46.0), ("p_sleeve", "M", "Olive", 62.4), ("p_collar", "M", "Olive", 8.5)]),
        "comments": [{"id": "cmt_b1", "text": "Label placement 0.5 cm low; correct in bulk.", "scope": "Olive · all", "state": "verified", "verified_by": "u_tech", "verified_at": dt(-20), "evidence": "PP meeting minutes"}],
        "internal": {"state": "passed", "draft": False, "by": "u_tech", "at": dt(-22), "note": "Measurements in tolerance; label comment closed."},
        "external": {"state": "approved_with_comments", "person_role": "Buying manager, Argo Navis (recorded by John Doe, Merchandiser)", "recorded_by": "u_merch1", "date": d(-21), "ref": "Brand email (summary supplied)", "version": 2, "scope": "Olive · allocation Vendor B", "conditions": "Label placement to be corrected in bulk (condition verified on sign-off)."}},
    "sr_orbit_1": {"id": "sr_orbit_1", "request_id": "sq_orbit_fit_k", "round": 1, "previous_round_id": None,
        "requested": 2, "made": 2, "dispatched": 2, "received": 2, "dates": {"made": d(-28), "dispatched": d(-24), "received": d(-20)}, "tracking": "Courier ref DEMO-0911",
        "receipts": [{"colour": "Khaki", "size": "M", "qty": 1, "date": d(-20), "by": "u_merch1"}, {"colour": "Slate", "size": "M", "qty": 1, "date": d(-20), "by": "u_merch1"}],
        "measurements": _meas([("p_chest", "M", "Khaki", 58.9), ("p_len", "M", "Khaki", 76.4), ("p_sh", "M", "Khaki", 46.2), ("p_sleeve", "M", "Khaki", 62.3), ("p_collar", "M", "Khaki", 8.6)]),
        "comments": [{"id": "cmt_o1", "text": "Pocket placement 1 cm high.", "scope": "Khaki · M", "state": "verified", "verified_by": "u_tech", "verified_at": dt(-12), "evidence": "Round 2 photos"}],
        "internal": {"state": "changes_requested", "draft": False, "by": "u_tech", "at": dt(-19), "note": "Pocket placement to be corrected."},
        "external": {"state": "pending", "person_role": None, "recorded_by": None, "date": None, "ref": None, "version": None, "scope": None, "conditions": ""}},
    "sr_orbit_2": {"id": "sr_orbit_2", "request_id": "sq_orbit_fit_k", "round": 2, "previous_round_id": "sr_orbit_1",
        "requested": 2, "made": 2, "dispatched": 2, "received": 2, "dates": {"made": d(-14), "dispatched": d(-12), "received": d(-10)}, "tracking": "Courier ref DEMO-1033",
        "receipts": [{"colour": "Khaki", "size": "M", "qty": 1, "date": d(-10), "by": "u_merch1"}, {"colour": "Slate", "size": "M", "qty": 1, "date": d(-10), "by": "u_merch1"}],
        "measurements": _meas([("p_chest", "M", "Khaki", 58.2), ("p_len", "M", "Khaki", 76.1), ("p_sh", "M", "Khaki", 46.1), ("p_sleeve", "M", "Khaki", 63.8), ("p_collar", "M", "Khaki", 8.5)]),
        "comments": [{"id": "cmt_o2", "text": "Left sleeve pitch about 1.5 cm too forward; correct pattern and resubmit.", "scope": "Khaki · M", "state": "open", "verified_by": None, "verified_at": None, "evidence": None}],
        "internal": {"state": "changes_requested", "draft": False, "by": "u_tech", "at": dt(-10), "note": "Sleeve length/pitch out of tolerance."},
        "external": {"state": "pending", "person_role": None, "recorded_by": None, "date": None, "ref": None, "version": None, "scope": None, "conditions": ""}},
    "sr_orbit_3": {"id": "sr_orbit_3", "request_id": "sq_orbit_fit_k", "round": 3, "previous_round_id": "sr_orbit_2",
        "requested": 2, "made": 0, "dispatched": 0, "received": 0, "dates": {"made": None, "dispatched": None, "received": None}, "tracking": "Not dispatched. Vendor proposes arrival 9 Oct (not agreed).",
        "receipts": [], "measurements": [], "comments": [],
        "internal": {"state": "not_started", "draft": False, "by": None, "at": None, "note": ""},
        "external": {"state": "pending", "person_role": None, "recorded_by": None, "date": None, "ref": None, "version": None, "scope": None, "conditions": ""}},
    "sr_trail_1": {"id": "sr_trail_1", "request_id": "sq_trail_proto_s", "round": 1, "previous_round_id": None,
        "requested": 1, "made": 1, "dispatched": 1, "received": 1, "dates": {"made": d(-10), "dispatched": d(-8), "received": d(-6)}, "tracking": "Courier ref DEMO-1477",
        "receipts": [{"colour": "Olive", "size": "M", "qty": 1, "date": d(-6), "by": "u_merch1"}],
        "measurements": _meas([("p_chest", "M", "Olive", 58.1), ("p_len", "M", "Olive", 76.0), ("p_sh", "M", "Olive", 46.0), ("p_sleeve", "M", "Olive", 62.0), ("p_collar", "M", "Olive", 8.5)]),
        "comments": [], "internal": {"state": "passed", "draft": False, "by": "u_tech", "at": dt(-5), "note": "In tolerance."},
        "external": {"state": "pending", "person_role": None, "recorded_by": None, "date": None, "ref": None, "version": None, "scope": None, "conditions": ""}},
    "sr_green1_1": {"id": "sr_green1_1", "request_id": "sq_green1", "round": 1, "previous_round_id": None,
        "requested": 2, "made": 2, "dispatched": 2, "received": 0, "dates": {"made": d(-9), "dispatched": d(-7), "received": None}, "tracking": "Couriered to V-Mart; receipt by brand not yet confirmed.",
        "receipts": [], "measurements": [], "comments": [], "brand_receipt_confirmed": False,
        "internal": {"state": "not_started", "draft": False, "by": None, "at": None, "note": ""},
        "external": {"state": "pending", "person_role": None, "recorded_by": None, "date": None, "ref": None, "version": None, "scope": None, "conditions": ""}},
}

# ---- Orders & production --------------------------------------------------
ORDERS = {
    "o_meadow": {"id": "o_meadow", "brand_id": "b_argo", "work_id": "w_meadow", "ref": "PO-AN-2711", "state": "confirmed", "currency": "INR",
        "po_evidence": "PO PDF (demo placeholder, no original file)", "buyer": "Argo Navis Retail Pvt Ltd (demo)", "payment_terms": "60 days from GRN (demo)",
        "dates": {"required_in_dc": {"original": d(30), "proposed": None, "agreed": d(30), "actual": None},
                  "ex_factory": {"original": d(22), "proposed": None, "agreed": d(22), "actual": None}},
        "ean_note": "EAN assigned at SKU level (see lines)", "gst": "GSTIN recorded at party level (demo)", "destination": "Argo Navis DC, Bhiwandi (demo)",
        "lines": [{"id": "ol_navy", "style_id": "s_meadow", "spec_version": 2, "quote_id": "q_a2", "colour": "Navy", "price": 940, "ean": "DEMO0000001",
                   "qty": {"S": 150, "M": 250, "L": 200, "XL": 100}},
                  {"id": "ol_olive", "style_id": "s_meadow", "spec_version": 2, "quote_id": "q_b2", "colour": "Olive", "price": 940, "ean": "DEMO0000002",
                   "qty": {"S": 100, "M": 250, "L": 250, "XL": 100}}],
        "amendments": [{"id": "am1", "ts": dt(-15), "actor_id": "u_head", "type": "Quantity", "proposal": "Increase Navy by +100 pcs", "reason": "Brand asked for extra Navy cover.",
                        "state": "rejected", "decision_reason": "Vendor A could not commit extra capacity before PP approval.", "decided_by": "u_head", "decided_at": dt(-14)}],
        "created_at": dt(-33)},
    "o_meadow_repeat": {"id": "o_meadow_repeat", "brand_id": "b_argo", "work_id": "w_meadow", "ref": "Draft repeat (no PO yet)", "state": "draft", "currency": "INR",
        "po_evidence": None, "buyer": "Argo Navis Retail Pvt Ltd (demo)", "payment_terms": None,
        "dates": {"required_in_dc": {"original": None, "proposed": d(75), "agreed": None, "actual": None}, "ex_factory": {"original": None, "proposed": None, "agreed": None, "actual": None}},
        "ean_note": "", "gst": "", "destination": None,
        "lines": [{"id": "ol_rep1", "style_id": "s_meadow", "spec_version": 2, "quote_id": None, "colour": "Navy", "price": None, "ean": None, "qty": {"S": 50, "M": 100, "L": 100, "XL": 50}}],
        "amendments": [], "verbal_note": "Verbal intention from brand on a call; not counted as confirmed demand.", "created_at": dt(-3)},
}

ALLOCATIONS = {
    "al_a": {"id": "al_a", "order_id": "o_meadow", "style_id": "s_meadow", "vendor_id": "v_sunrise", "factory_id": "f_sun1", "label": "Vendor A · Sunrise Garments · Unit 1",
        "lines": [{"line_id": "ol_navy", "qty": {"S": 150, "M": 250, "L": 200, "XL": 100}}], "lots": [{"id": "lot_a1", "label": "Lot 1 (Navy, all sizes)", "qty": 700}],
        "gate3": {"state": "pending", "by": None, "at": None, "scope": None, "evidence": None},
        "pp_meeting": None,
        "clearance_manual": {"tech_pack": "satisfied", "graded_spec": "satisfied", "lab_reports": "pending", "bulk_fabric_test": "pending", "shade_band": "satisfied", "lab_dip": "satisfied",
                             "trim_card": "satisfied", "top": "missing", "inline": "missing", "midline": "missing", "packing": "missing"},
        "progress": [{"id": "pg_a1", "ts": dt(-1, "17:30"), "type": "cut", "basis": "cumulative", "qty": 120, "source": "Vendor report by phone (recorded by John Doe, Production coordinator)", "actor_id": "u_prod",
                      "flag": "Unauthorised start: cutting reported before Gate 3 sign-off. Recorded as actual; release remains blocked."}],
        "unauthorised_start": True},
    "al_b": {"id": "al_b", "order_id": "o_meadow", "style_id": "s_meadow", "vendor_id": "v_lotus", "factory_id": "f_lot1", "label": "Vendor B · Lotus Knit Works · Main factory",
        "lines": [{"line_id": "ol_olive", "qty": {"S": 100, "M": 250, "L": 250, "XL": 100}}], "lots": [{"id": "lot_b1", "label": "Lot 1 (Olive, S–L)", "qty": 600}, {"id": "lot_b2", "label": "Lot 2 (Olive, XL + part)", "qty": 100}],
        "gate3": {"state": "signed", "by": "u_head", "at": dt(-18), "scope": "Allocation Vendor B · Olive · PP round 1 approved with comments", "evidence": "PP meeting minutes (demo)"},
        "pp_meeting": {"date": d(-18), "attendees": ["John Doe (Sourcing head)", "John Doe (QA lead)", "John Doe (Technical reviewer)", "Vendor contact (Lotus)"],
                       "minutes": "Reviewed approved PP, label placement correction, fabric lot booking and quality plan (demo minutes).",
                       "critical_points": "Label placement; collar stitching tension.", "decision": "Release for bulk, Vendor B only.", "signoff_by": "u_head", "signoff_at": dt(-18)},
        "clearance_manual": {"tech_pack": "satisfied", "graded_spec": "satisfied", "lab_reports": "satisfied", "bulk_fabric_test": "satisfied", "shade_band": "satisfied", "lab_dip": "satisfied",
                             "trim_card": "satisfied", "top": "satisfied", "inline": "satisfied", "midline": "satisfied", "packing": "pending"},
        "progress": [{"id": "pg_b1", "ts": dt(-12, "18:00"), "type": "cut", "basis": "cumulative", "qty": 700, "source": "Vendor daily report (demo)", "actor_id": "u_prod", "flag": None},
                     {"id": "pg_b2", "ts": dt(-6, "18:00"), "type": "sewn", "basis": "cumulative", "qty": 640, "source": "Vendor daily report (demo)", "actor_id": "u_prod", "flag": None},
                     {"id": "pg_b3", "ts": dt(-3, "18:00"), "type": "packed", "basis": "cumulative", "qty": 600, "source": "Vendor daily report (demo)", "actor_id": "u_prod", "flag": None},
                     {"id": "pg_b4", "ts": dt(-1, "18:00"), "type": "dispatched", "basis": "incremental", "qty": 100, "source": "Shipment 1 (Lot 2)", "actor_id": "u_prod", "flag": None}],
        "unauthorised_start": False},
}

MILESTONES = {}
def _ms(mid, alloc, name, baseline, agreed, proposed=None, actual=None, owner="u_prod", deps=None, state=None, reason=None):
    st = state or ("done" if actual else "open")
    MILESTONES[mid] = {"id": mid, "allocation_id": alloc, "name": name, "baseline": baseline, "agreed": agreed, "proposed": proposed, "actual": actual,
                       "owner_id": owner, "deps": deps or [], "state": st, "reason": reason, "evidence": None}

_ms("ms_a1", "al_a", "Fabric in-house", d(-14), d(-14), actual=d(-13))
_ms("ms_a2", "al_a", "Lab tests (FPT/GPT) approved", d(-8), d(-8), owner="u_qa", deps=["ms_a1"], state="late", reason="Bulk lab report pending.")
_ms("ms_a3", "al_a", "PP approval", d(-4), d(-4), proposed=d(4), owner="u_tech", state="late", reason="Round 2 PP sample still in transit.")
_ms("ms_a4", "al_a", "PP meeting / Gate 3", d(0), d(0), proposed=d(5), owner="u_head", deps=["ms_a3", "ms_a2"], state="blocked", reason="Depends on PP approval.")
_ms("ms_a5", "al_a", "Cutting start", d(1), d(1), proposed=d(6), deps=["ms_a4"], state="blocked")
_ms("ms_a6", "al_a", "Final inspection", d(10), d(10), proposed=d(14), owner="u_qa", deps=["ms_a5"])
_ms("ms_a7", "al_a", "Dispatch", d(12), d(12), proposed=d(16), deps=["ms_a6"], reason="PP correction needs one more sample round.")
_ms("ms_b1", "al_b", "Fabric in-house", d(-22), d(-22), actual=d(-21))
_ms("ms_b2", "al_b", "Lab tests (FPT/GPT) approved", d(-18), d(-18), actual=d(-17), owner="u_qa", deps=["ms_b1"])
_ms("ms_b3", "al_b", "PP approval", d(-20), d(-20), actual=d(-21), owner="u_tech")
_ms("ms_b4", "al_b", "PP meeting / Gate 3", d(-18), d(-18), actual=d(-18), owner="u_head", deps=["ms_b3", "ms_b2"])
_ms("ms_b5", "al_b", "Cutting start", d(-14), d(-14), actual=d(-13), deps=["ms_b4"])
_ms("ms_b6", "al_b", "Mid-line inspection", d(-8), d(-8), actual=d(-8), owner="u_qa", deps=["ms_b5"])
_ms("ms_b7", "al_b", "Final inspection (Lot 1)", d(-3), d(2), actual=None, owner="u_qa", deps=["ms_b5"], state="open", reason="Lot 1 failed on d-2; re-inspection of reworked quantity agreed.")
_ms("ms_b8", "al_b", "Dispatch", d(8), d(8), owner="u_prod", deps=["ms_b7"])

TESTS = {
    "t_b_fpt": {"id": "t_b_fpt", "allocation_id": "al_b", "type": "FPT (fabric physical)", "material": "Olive poplin", "lot": "Fabric lot F-77", "issuer": "Third-party lab (demo)", "date": d(-19), "result": "pass", "retest_of": None, "evidence": "Report (demo placeholder)", "spec_ref": "Spec v2 / Bulk fabric"},
    "t_b_gpt1": {"id": "t_b_gpt1", "allocation_id": "al_b", "type": "GPT (garment physical)", "material": "Garment", "lot": "Lot 1", "issuer": "Third-party lab (demo)", "date": d(-17), "result": "fail", "retest_of": None, "evidence": "Report (demo placeholder)", "spec_ref": "Seam strength"},
    "t_b_gpt2": {"id": "t_b_gpt2", "allocation_id": "al_b", "type": "GPT (garment physical)", "material": "Garment", "lot": "Lot 1", "issuer": "Third-party lab (demo)", "date": d(-15), "result": "pass", "retest_of": "t_b_gpt1", "evidence": "Retest report (demo placeholder); covers Lot 1 seam strength only", "spec_ref": "Seam strength"},
    "t_a_fpt": {"id": "t_a_fpt", "allocation_id": "al_a", "type": "FPT (fabric physical)", "material": "Navy poplin", "lot": "Fabric lot F-81", "issuer": "Third-party lab (demo)", "date": None, "result": "pending", "retest_of": None, "evidence": None, "spec_ref": "Spec v2 / Bulk fabric"},
}

INSPECTIONS = {
    "ins_b_inline1": {"id": "ins_b_inline1", "allocation_id": "al_b", "type": "Inline", "lot": "Lot 1", "qty_inspected": 50, "plan_ref": "Inline plan (demo)", "inspector": "u_qa", "date": d(-10), "result": "fail",
        "defects": [{"cat": "Major", "name": "Skipped stitches", "count": 4}], "photos": 2, "disposition": "Rework", "recheck_of": None, "follow_up": "Rework and re-check"},
    "ins_b_inline2": {"id": "ins_b_inline2", "allocation_id": "al_b", "type": "Inline", "lot": "Lot 1", "qty_inspected": 50, "plan_ref": "Inline plan (demo)", "inspector": "u_qa", "date": d(-9), "result": "pass",
        "defects": [{"cat": "Minor", "name": "Loose threads", "count": 3}], "photos": 1, "disposition": "Accepted", "recheck_of": "ins_b_inline1", "follow_up": None, "rechecked": "Skipped-stitch operation (same 50 pcs re-checked)"},
    "ins_b_final1": {"id": "ins_b_final1", "allocation_id": "al_b", "type": "Final", "lot": "Lot 1", "qty_inspected": 600, "sample_size": 80, "plan_ref": "Buyer-approved plan AN-FIN-DEMO (limits illustrative; written re-confirmation pending)",
        "limits": {"major_accept": 5, "major_reject": 6, "minor_accept": 7}, "inspector": "u_qa", "date": d(-2), "result": "fail",
        "defects": [{"cat": "Major", "name": "Collar stitching defects", "count": 9}, {"cat": "Minor", "name": "Loose threads", "count": 4}], "photos": 4, "disposition": "Held · rework",
        "recheck_of": None, "follow_up": "a_reinspect"},
    "ins_b_final2": {"id": "ins_b_final2", "allocation_id": "al_b", "type": "Final", "lot": "Lot 2", "qty_inspected": 100, "sample_size": 32, "plan_ref": "Buyer-approved plan AN-FIN-DEMO (limits illustrative; written re-confirmation pending)",
        "limits": {"major_accept": 2, "major_reject": 3, "minor_accept": 5}, "inspector": "u_qa", "date": d(-2), "result": "pass",
        "defects": [{"cat": "Minor", "name": "Loose threads", "count": 2}], "photos": 1, "disposition": "Cleared for release: Lot 2 only (100 pcs)", "recheck_of": None, "follow_up": None, "cleared_qty": 100},
}

SHIPMENTS = {
    "sh_1": {"id": "sh_1", "order_id": "o_meadow", "label": "Shipment 1 (partial)", "state": "in_transit",
        "lines": [{"allocation_id": "al_b", "lot": "Lot 2", "colour": "Olive", "qty": 100}], "released_by": "u_qa", "release_basis": "Final inspection Lot 2 passed (ins_b_final2)",
        "dates": {"released": d(-1), "dispatched": d(-1), "delivered": None, "grn": None}, "carrier": "Demo Logistics", "lr_ref": "LR-DEMO-4471",
        "destination": "Argo Navis DC, Bhiwandi (demo)", "documents": ["Invoice (demo placeholder)", "Packing list (demo placeholder)"], "received_qty": None, "variance": None},
}
