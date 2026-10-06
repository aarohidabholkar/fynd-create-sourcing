from . import seed_core as c, seed_styles as s, seed_vendors as v


def build():
    return {
        "meta": {"rev": 0, "demo": True, "demo_date": c.d(0),
                 "notice": "Prototype data: every record, message and date is illustrative. No live integrations; sends and notifications are simulated."},
        "users": c.USERS, "brands": c.BRANDS, "sources": c.SOURCES, "works": c.WORKS, "issues": c.ISSUES, "actions": c.ACTIONS,
        "requests": c.UPDATE_REQUESTS, "commitments": c.COMMITMENTS, "waiting": c.WAITING, "notes": c.NOTES, "comments": c.COMMENTS,
        "events": {e["id"]: e for e in c.EVENTS}, "notifications": {n["id"]: n for n in c.NOTIFICATIONS},
        "styles": s.STYLES, "quote_requests": s.QUOTE_REQUESTS, "quotes": s.QUOTES,
        "sample_requests": s.SAMPLE_REQUESTS, "sample_rounds": s.SAMPLE_ROUNDS,
        "orders": s.ORDERS, "allocations": s.ALLOCATIONS, "milestones": s.MILESTONES, "tests": s.TESTS,
        "inspections": s.INSPECTIONS, "shipments": s.SHIPMENTS,
        "vendors": v.VENDORS, "factories": v.FACTORIES, "visits": v.VISITS, "audits": v.AUDITS, "findings": v.FINDINGS,
        "profile_proposals": {
            "pp1": {"id": "pp1", "vendor_id": "v_kaveri", "visit_id": "vis_kav_2", "field": "Embroidery (in-house)", "current": "Not recorded as available",
                    "proposed": "Planned (machines installed, operators in training)", "state": "pending", "capability_id": "cp2"}},
        "viewer": {},
        "seq": 1000,
    }
