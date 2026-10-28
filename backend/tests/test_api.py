from datetime import date

import pytest

from app.data_paths import model_available


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["database"] == "sqlite"


def test_meetings_and_segments(client):
    meetings = client.get("/api/meetings").json()
    assert len(meetings) == 4
    assert {"taskCount", "decisionCount", "riskCount", "participants", "pipelineStage"} <= meetings[0].keys()
    first = meetings[0]
    segs = client.get(f"/api/meetings/{first['id']}/segments").json()
    assert segs and segs[0]["timestamp"].count(":") == 2
    assert client.get("/api/meetings/9999").status_code == 404


def test_task_filters_and_patch(client):
    tasks = client.get("/api/tasks").json()
    assert len(tasks) == 11
    assert all(t["evidence"]["segmentId"] for t in tasks)

    overdue = client.get("/api/tasks", params={"overdue": "true"}).json()
    assert overdue and all(t["deadline"] < date.today().isoformat() and t["status"] != "Completed" for t in overdue)

    by_deadline = client.get("/api/tasks", params={"sort": "deadline", "limit": 3}).json()
    assert [t["deadline"] for t in by_deadline] == sorted(t["deadline"] for t in by_deadline)

    task = tasks[0]
    r = client.patch(f"/api/tasks/{task['id']}", json={"status": "Completed"})
    assert r.status_code == 200 and r.json()["status"] == "Completed"

    r = client.patch(f"/api/tasks/{task['id']}", json={"ownerId": 9999})
    assert r.status_code == 422


def test_decisions_risks_insights_search(client):
    assert len(client.get("/api/decisions").json()) == 7
    risks = client.get("/api/risks", params={"severity": "High"}).json()
    assert risks and all(r["severity"] == "High" for r in risks)

    ins = client.get("/api/insights/summary").json()
    assert ins["totals"]["meetings"] == 4 and ins["totals"]["risks"] == 7
    assert len(ins["recurringRisks"]) == 2 and ins["topOwner"]

    s = client.get("/api/search", params={"q": "DistilBERT"}).json()
    assert s["tasks"] and s["decisions"] and s["meetings"]


def test_notifications(client):
    notes = client.get("/api/notifications").json()
    assert any(n["type"] == "overdue" for n in notes)
    assert client.post("/api/notifications/read-all").status_code == 204
    assert all(n["read"] for n in client.get("/api/notifications").json())


def test_upload_rejects_unknown_type(client):
    r = client.post("/api/meetings/upload", data={"title": "x", "date": "2026-10-29"},
                    files={"file": ("notes.xyz", b"hello", "application/octet-stream")})
    assert r.status_code == 415


@pytest.mark.skipif(not model_available(), reason="no trained classifier under ml/models/")
def test_upload_transcript_runs_pipeline(client):
    text = ("[00:00:05] Chanya: Let's start.\n"
            "[00:00:20] Ravindu: I'll finish the upload endpoint by Friday.\n"
            "[00:00:40] Chanya: So we go with the version three model for the demo.\n"
            "[00:01:00] Nethmi: The problem is the Risk class, we have far fewer examples.\n")
    r = client.post("/api/meetings/upload", data={"title": "Pipeline test", "date": "2026-10-29"},
                    files={"file": ("test.txt", text.encode(), "text/plain")})
    assert r.status_code == 201
    mid = r.json()["id"]
    # TestClient runs background tasks before returning, so the pipeline has finished.
    m = client.get(f"/api/meetings/{mid}").json()
    assert m["status"] == "Processed", m["errorMessage"]
    segs = client.get(f"/api/meetings/{mid}/segments").json()
    assert len(segs) == 4 and all(s["confidence"] for s in segs)
    tasks = client.get("/api/tasks", params={"meetingId": mid}).json()
    assert any(t["owner"] and t["owner"]["name"].startswith("Ravindu") and t["deadline"] for t in tasks)
    assert m["summary"]
