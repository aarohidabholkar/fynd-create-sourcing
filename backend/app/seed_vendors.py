"""Vendors, factories, visits, audits. ALL ILLUSTRATIVE DEMO DATA; vendor names are fictional."""
from .clock import d, dt

VENDORS = {
    "v_sunrise": {"id": "v_sunrise", "name": "Sunrise Garments", "location": "Bengaluru, Karnataka", "category": ["Wovens", "Ethnic sets", "Shirts"], "owner_id": "u_merch2",
        "suitability": "Woven shirts and co-ord / ethnic sets in cotton and viscose blends at medium volumes.",
        "limitations": ["Unit 2 has open audit findings; do not assume Unit 1 results apply to Unit 2.", "No in-house embroidery (outsourced)."],
        "capabilities": [
            {"id": "cp1", "label": "Woven shirts", "kind": "product", "state": "available", "basis": "observed", "note": "Two stitching lines at Unit 1.", "observed_on": d(-90), "visit_id": "vis_sun_1"},
            {"id": "cp2", "label": "Co-ord / ethnic sets", "kind": "product", "state": "available", "basis": "observed", "note": "Dedicated line at Unit 2.", "observed_on": d(-30), "visit_id": "vis_sun_2"},
            {"id": "cp3", "label": "Embroidery", "kind": "process", "state": "limited", "basis": "reported", "note": "Outsourced to a nearby unit (not visited).", "observed_on": None, "visit_id": None},
            {"id": "cp4", "label": "In-house wash", "kind": "process", "state": "not_offered", "basis": "reported", "note": "Wash outsourced.", "observed_on": None, "visit_id": None}],
        "moq": {"qty": 300, "basis": "per colour", "conditions": "Lower for repeat styles at vendor discretion."},
        "capacity": {"text": "Unit 1: ~1,800 pcs/day reported; Unit 2: ~1,200 pcs/day reported (not a booking commitment).", "observed_on": d(-30)},
        "indicative_pricing": {"text": "Shirts INR 560–650 CMT+fabric ex-factory (indicative, not an approved style quote).", "currency": "INR", "basis": "Per pc, ex-factory", "date": d(-45)},
        "payment_terms": "30% advance, balance against shipping documents (reported).",
        "certifications": [{"name": "WRAP (claimed)", "state": "evidence_attached", "evidence": "Certificate scan (demo placeholder)", "expiry": None},
                           {"name": "ISO 9001 (claimed)", "state": "reported", "evidence": None, "expiry": None}],
        "contacts": [{"role": "Primary contact", "name": "John Doe (vendor contact)", "detail": "Contact details not recorded in demo"}],
        "factories": ["f_sun1", "f_sun2"], "created_at": dt(-200), "profile_history": []},
    "v_kaveri": {"id": "v_kaveri", "name": "Kaveri Apparels", "location": "Tiruppur, Tamil Nadu", "category": ["Shirts", "Resort wear"], "owner_id": "u_merch1",
        "suitability": "Resort-collar shirts in cotton and linen blends; good at small minimums.",
        "limitations": ["Resort-collar shirts only; not set up for formal shirts or outerwear at volume.", "Embroidery machines installed but not yet producing (planned, not available)."],
        "capabilities": [
            {"id": "cp1", "label": "Resort-collar shirts", "kind": "product", "state": "available", "basis": "observed", "note": "Restricted to resort collars.", "observed_on": d(-20), "visit_id": "vis_kav_2"},
            {"id": "cp2", "label": "Embroidery (in-house)", "kind": "process", "state": "planned", "basis": "planned", "note": "Machines installed, operators in training. Not an available capability yet.", "observed_on": d(-20), "visit_id": "vis_kav_2"},
            {"id": "cp3", "label": "Overshirts / outerwear", "kind": "product", "state": "limited", "basis": "reported", "note": "Willing to sample Orbit overshirt; production capability not established.", "observed_on": None, "visit_id": None}],
        "moq": {"qty": 200, "basis": "per style", "conditions": "Across colours within a style."},
        "capacity": {"text": "~600 pcs/day reported.", "observed_on": d(-20)},
        "indicative_pricing": {"text": "Not recorded", "currency": None, "basis": None, "date": None},
        "payment_terms": "Not recorded",
        "certifications": [], "contacts": [{"role": "Primary contact", "name": "John Doe (vendor contact)", "detail": "Contact details not recorded in demo"}],
        "factories": ["f_kav1"], "created_at": dt(-120), "profile_history": []},
    "v_lotus": {"id": "v_lotus", "name": "Lotus Knit Works", "location": "Noida, Uttar Pradesh", "category": ["Knits", "Shirts"], "owner_id": "u_merch1",
        "suitability": "Knitwear and casual cotton shirts; currently producing Meadow shirt (Vendor B).",
        "limitations": [], "capabilities": [
            {"id": "cp1", "label": "Casual shirts", "kind": "product", "state": "available", "basis": "observed", "note": "", "observed_on": d(-45), "visit_id": "vis_lot_1"},
            {"id": "cp2", "label": "Knit tees", "kind": "product", "state": "available", "basis": "reported", "note": "", "observed_on": None, "visit_id": None}],
        "moq": None, "capacity": {"text": "Not recorded", "observed_on": None},
        "indicative_pricing": {"text": "Not recorded", "currency": None, "basis": None, "date": None}, "payment_terms": "40% advance (from Meadow quote)",
        "certifications": [], "contacts": [{"role": "Primary contact", "name": "John Doe (vendor contact)", "detail": "Contact details not recorded in demo"}],
        "factories": ["f_lot1"], "created_at": dt(-150), "profile_history": []},
    "v_meera": {"id": "v_meera", "name": "Meera Embroidery Unit", "location": None, "category": ["Embroidery"], "owner_id": None,
        "suitability": "Embroidery specialist (reported by a referral; not yet visited).", "limitations": [], "capabilities": [
            {"id": "cp1", "label": "Machine embroidery", "kind": "process", "state": "available", "basis": "reported", "note": "Referral only.", "observed_on": None, "visit_id": None}],
        "moq": {"qty": 100, "basis": "per design", "conditions": "Reported"}, "capacity": {"text": "Not recorded", "observed_on": None},
        "indicative_pricing": {"text": "Not recorded", "currency": None, "basis": None, "date": None}, "payment_terms": "Not recorded",
        "certifications": [], "contacts": [], "factories": [], "created_at": dt(-9), "profile_history": []},
}

FACTORIES = {
    "f_sun1": {"id": "f_sun1", "vendor_id": "v_sunrise", "name": "Unit 1 (Peenya)", "location": "Peenya, Bengaluru"},
    "f_sun2": {"id": "f_sun2", "vendor_id": "v_sunrise", "name": "Unit 2 (Hosur Road)", "location": "Hosur Road, Bengaluru"},
    "f_kav1": {"id": "f_kav1", "vendor_id": "v_kaveri", "name": "Main unit", "location": "Tiruppur"},
    "f_lot1": {"id": "f_lot1", "vendor_id": "v_lotus", "name": "Main factory", "location": "Noida"},
}


def _att(aid, kind, name, caption, day, by="u_merch2"):
    return {"id": aid, "kind": kind, "name": name, "caption": caption, "uploaded_at": dt(day, "18:00"), "uploaded_by": by, "demo_placeholder": True}


VISITS = {
    "vis_sun_1": {"id": "vis_sun_1", "vendor_id": "v_sunrise", "factory_id": "f_sun1", "date": d(-90), "attendees": ["u_merch2"], "state": "published",
        "observations": "Two clean stitching lines producing woven shirts. Cutting room well organised. Embroidery is outsourced.", "attachments": [_att("at1", "photo", "unit1-line.jpg", "Stitching line 1, woven shirts", -90)],
        "followups": [], "audit_id": "au_sun1", "history": [], "created_at": dt(-89), "author_id": "u_merch2"},
    "vis_sun_2": {"id": "vis_sun_2", "vendor_id": "v_sunrise", "factory_id": "f_sun2", "date": d(-30), "attendees": ["u_merch1", "u_qa"], "state": "published",
        "observations": "Co-ord set line is efficient but needle control and sleeve-hem finishing need work. Audit performed during the visit.",
        "attachments": [_att("at2", "photo", "unit2-needle.jpg", "Needle control area: broken-needle log not maintained", -30, "u_qa"),
                        _att("at3", "photo", "unit2-hem.jpg", "Sleeve-hem finishing station", -30, "u_qa"),
                        _att("at4", "video", "unit2-walkthrough.mp4", "Walkthrough of co-ord line (demo placeholder, no media file)", -30, "u_merch1")],
        "followups": [{"id": "vf1", "action_id": "a_vendor_review"}], "audit_id": "au_sun2", "history": [], "created_at": dt(-29), "author_id": "u_merch1"},
    "vis_kav_1": {"id": "vis_kav_1", "vendor_id": "v_kaveri", "factory_id": "f_kav1", "date": d(-60), "attendees": ["u_merch1"], "state": "published",
        "observations": "Small, well-run unit making resort-collar shirts. Not set up for formal collars.", "attachments": [_att("at5", "photo", "kaveri-resort.jpg", "Resort-collar shirts on the line", -60, "u_merch1")],
        "followups": [], "audit_id": None, "history": [], "created_at": dt(-60), "author_id": "u_merch1"},
    "vis_kav_2": {"id": "vis_kav_2", "vendor_id": "v_kaveri", "factory_id": "f_kav1", "date": d(-20), "attendees": ["u_merch1", "u_head"], "state": "published",
        "observations": "Embroidery machines are installed (6 heads) but operators are still in training; vendor says production could start next quarter. Still resort-collar only.",
        "attachments": [_att("at6", "photo", "kaveri-emb.jpg", "Installed embroidery machines (not yet producing)", -20, "u_merch1"),
                        _att("at7", "photo", "kaveri-training.jpg", "Operator training session", -19, "u_merch1")],
        "followups": [], "audit_id": None, "created_at": dt(-19), "author_id": "u_merch1",
        "history": [{"id": "vh1", "ts": dt(-18, "10:00"), "editor_id": "u_merch1", "changes": [{"field": "Visit date", "old": d(-21), "new": d(-20)}, {"field": "Attachments", "old": "1 photo", "new": "2 photos (added kaveri-training.jpg)"}], "reason": "Corrected visit date and added a photo."}]},
    "vis_kav_draft": {"id": "vis_kav_draft", "vendor_id": "v_kaveri", "factory_id": "f_kav1", "date": d(-1), "attendees": ["u_merch1"], "state": "draft",
        "observations": "Quick check-in on Orbit sleeve pattern. (draft: not yet published)", "attachments": [], "followups": [], "audit_id": None, "history": [], "created_at": dt(-1), "author_id": "u_merch1"},
    "vis_lot_1": {"id": "vis_lot_1", "vendor_id": "v_lotus", "factory_id": "f_lot1", "date": d(-45), "attendees": ["u_head"], "state": "published",
        "observations": "Large shirt floor; relies on a single QC table at the end of the line.", "attachments": [], "followups": [], "audit_id": "au_lot1", "history": [], "created_at": dt(-44), "author_id": "u_head"},
}

AUDITS = {
    "au_sun1": {"id": "au_sun1", "vendor_id": "v_sunrise", "factory_id": "f_sun1", "date": d(-90), "report_date": d(-88), "uploaded_at": dt(-87), "auditor": "John Doe (QA lead)", "type": "Technical systems assessment",
        "scope": "Cutting, stitching, quality systems. Dyeing and wash not assessed (not on site).", "outcome": "Grade B (report scale A–D, as written)", "outcome_state": "recorded",
        "report": "Report PDF (demo placeholder, no original file)", "reported_totals": {"critical": 0, "major": 2, "minor": 5}, "capture_complete": True, "requires_reaudit": False, "visit_id": "vis_sun_1", "not_assessed": ["Dyeing", "Wash"]},
    "au_sun2": {"id": "au_sun2", "vendor_id": "v_sunrise", "factory_id": "f_sun2", "date": d(-30), "report_date": d(-28), "uploaded_at": dt(-27), "auditor": "John Doe (QA lead)", "type": "Technical systems assessment",
        "scope": "Co-ord line, needle control, finishing. Cutting room N/A for this unit (outsourced).", "outcome": "Grade C: corrective actions required (as written)", "outcome_state": "recorded",
        "report": "Report PDF (demo placeholder, no original file)", "reported_totals": {"critical": 4, "major": 3, "minor": 6}, "capture_complete": False, "requires_reaudit": True, "visit_id": "vis_sun_2", "not_assessed": ["Wash"], "na": ["Cutting room (outsourced)"]},
    "au_lot1": {"id": "au_lot1", "vendor_id": "v_lotus", "factory_id": "f_lot1", "date": d(-45), "report_date": None, "uploaded_at": dt(-44), "auditor": "John Doe (Sourcing head)", "type": "Capability visit assessment",
        "scope": "Not stated", "outcome": None, "outcome_state": "pending_review", "report": None, "reported_totals": None, "capture_complete": False, "requires_reaudit": False, "visit_id": "vis_lot_1", "not_assessed": []},
}

FINDINGS = {
    "f_sunrise_1": {"id": "f_sunrise_1", "audit_id": "au_sun2", "vendor_id": "v_sunrise", "factory_id": "f_sun2", "section": "Needle control", "checkpoint": "NC-3",
        "description": "Broken-needle log not maintained; no needle-replacement control.", "severity": "Critical", "evidence": ["at2"], "corrective_action": "Introduce needle log and replacement control; train supervisors.",
        "vendor_responsible": "John Doe (vendor contact, Sunrise)", "internal_owner_id": "u_merch1", "target": "Within 30 days of report", "target_date": d(-28 + 30), "state": "open", "action_id": None, "submissions": [], "history": [], "requires_reaudit": True},
    "f_sunrise_2": {"id": "f_sunrise_2", "audit_id": "au_sun2", "vendor_id": "v_sunrise", "factory_id": "f_sun2", "section": "Finishing", "checkpoint": "FN-1",
        "description": "Sleeve-hem finishing inconsistent; no in-line check before pressing.", "severity": "Critical", "evidence": ["at3"], "corrective_action": "Add in-line hem check and record results.",
        "vendor_responsible": "John Doe (vendor contact, Sunrise)", "internal_owner_id": "u_merch1", "target": "Within 14 days of report", "target_date": d(-28 + 14), "state": "open", "action_id": "a_vendor_review", "submissions": [], "history": [], "requires_reaudit": False},
    "f_sunrise_3": {"id": "f_sunrise_3", "audit_id": "au_sun2", "vendor_id": "v_sunrise", "factory_id": "f_sun2", "section": "Quality records", "checkpoint": "QR-2",
        "description": "Inspection records not retained for the last month.", "severity": "Critical", "evidence": [], "corrective_action": "Retain inspection records for a minimum period and show a sample.",
        "vendor_responsible": "John Doe (vendor contact, Sunrise)", "internal_owner_id": "u_merch2", "target": "Within 21 days of report", "target_date": d(-28 + 21), "state": "awaiting_verification", "action_id": None,
        "submissions": [{"id": "sub1", "ts": dt(-3, "12:00"), "by": "u_merch2", "note": "Vendor shared 30 days of retained inspection records with a retention register.", "attachments": [{"name": "inspection-records.pdf", "demo_placeholder": True}], "response": None}],
        "history": [], "requires_reaudit": False},
}
