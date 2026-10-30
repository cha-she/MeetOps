from datetime import date


def test_health_and_auth_required(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["database"] == "sqlite" and body["rules"] is True
    assert client.get("/api/tasks").status_code == 401
    assert client.get("/api/auth/status").json() == {"needsSetup": False}


def test_login_rejects_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "chanya@meetops.demo", "password": "wrong-password"})
    assert r.status_code == 401


def test_me(client, member):
    me = client.get("/api/auth/me", headers=member).json()
    assert me["name"] == "Kasun Silva" and me["role"] == "member" and me["department"]["name"] == "Engineering"


def test_meetings_processed_by_real_pipeline(client, member):
    meetings = client.get("/api/meetings", headers=member).json()
    assert len(meetings) == 4
    assert all(m["status"] == "Processed" for m in meetings)
    assert all(m["modelName"] and "rules" in m["modelName"] for m in meetings)
    segs = client.get(f"/api/meetings/{meetings[0]['id']}/segments", headers=member).json()
    assert segs and {"modelLabel", "rule", "confidence", "corrected"} <= segs[0].keys()


def test_release_notes_exchange_becomes_one_task(client, member):
    tasks = client.get("/api/tasks", params={"q": "release notes"}, headers=member).json()
    assert len(tasks) == 1
    assert tasks[0]["description"] == "Update the release notes"
    assert tasks[0]["owner"]["name"] == "Kasun Silva"


def test_task_filters(client, member):
    all_tasks = client.get("/api/tasks", headers=member).json()
    mine = client.get("/api/tasks", params={"mine": "true"}, headers=member).json()
    assert mine and all(t["owner"]["name"] == "Kasun Silva" for t in mine)
    assert len(mine) < len(all_tasks)
    by_deadline = client.get("/api/tasks", params={"sort": "deadline"}, headers=member).json()
    dated = [t["deadline"] for t in by_deadline if t["deadline"]]
    assert dated == sorted(dated)
    suggested = client.get("/api/tasks", params={"review": "suggested"}, headers=member).json()
    assert all(t["reviewStatus"] == "suggested" for t in suggested)
    today = date.today().isoformat()
    upcoming = client.get("/api/tasks", params={"dueFrom": today}, headers=member).json()
    assert all(t["deadline"] >= today for t in upcoming)


def test_member_can_only_edit_own_tasks(client, member):
    tasks = client.get("/api/tasks", headers=member).json()
    me = client.get("/api/auth/me", headers=member).json()
    own = next(t for t in tasks if t["owner"] and t["owner"]["id"] == me["id"])
    other = next(t for t in tasks if t["owner"] and t["owner"]["id"] != me["id"])
    r = client.patch(f"/api/tasks/{own['id']}", json={"status": "In Progress"}, headers=member)
    assert r.status_code == 200 and r.json()["status"] == "In Progress"
    assert r.json()["reviewStatus"] == "confirmed"           # editing a suggestion accepts it
    assert client.patch(f"/api/tasks/{other['id']}", json={"status": "Completed"}, headers=member).status_code == 403


def test_admin_completes_task_and_owner_is_notified(client, admin, other_member):
    ishara = next(u for u in client.get("/api/users", headers=admin).json() if u["name"] == "Ishara Jayasuriya")
    task = client.get("/api/tasks", params={"ownerId": ishara["id"]}, headers=admin).json()[0]
    r = client.patch(f"/api/tasks/{task['id']}", json={"status": "Completed"}, headers=admin)
    assert r.status_code == 200 and r.json()["completedAt"]
    notes = client.get("/api/notifications", headers=other_member).json()
    assert any(n["type"] == "status_change" and n["taskId"] == task["id"] for n in notes)


def test_reject_records_feedback_and_hides_item(client, admin):
    queue = client.get("/api/review", headers=admin).json()
    decision = queue["decisions"][0]
    r = client.patch(f"/api/decisions/{decision['id']}", json={"reviewStatus": "rejected"}, headers=admin)
    assert r.status_code == 200
    ids = [d["id"] for d in client.get("/api/decisions", headers=admin).json()]
    assert decision["id"] not in ids
    activity = client.get("/api/activity", headers=admin).json()
    assert any(a["action"] == "rejected" and a["entityId"] == decision["id"] for a in activity)


def test_reclassify_segment_creates_confirmed_task(client, admin):
    meeting = next(m for m in client.get("/api/meetings", headers=admin).json() if m["title"] == "Sprint 8 Planning")
    segs = client.get(f"/api/meetings/{meeting['id']}/segments", headers=admin).json()
    seg = next(s for s in segs if "slide deck" in s["text"])
    r = client.post(f"/api/segments/{seg['id']}/category", json={"category": "Task"}, headers=admin)
    assert r.status_code == 200 and r.json()["category"] == "Task" and r.json()["corrected"]
    tasks = client.get("/api/tasks", params={"meetingId": meeting["id"]}, headers=admin).json()
    new = next(t for t in tasks if t["evidence"] and t["evidence"]["segmentId"] == seg["id"])
    assert new["reviewStatus"] == "confirmed" and new["source"] == "manual" and new["deadline"]


def test_manual_task(client, manager):
    meeting = client.get("/api/meetings", headers=manager).json()[0]
    r = client.post("/api/tasks", json={"description": "Book the demo room", "meetingId": meeting["id"],
                                        "deadline": date.today().isoformat(), "priority": "High"}, headers=manager)
    assert r.status_code == 201 and r.json()["source"] == "manual"


def test_people_admin_only(client, admin, member):
    r = client.post("/api/departments", json={"name": "Finance"}, headers=member)
    assert r.status_code == 403
    r = client.post("/api/departments", json={"name": "Finance"}, headers=admin)
    assert r.status_code == 201
    dept = r.json()["id"]
    r = client.post("/api/users", json={"name": "Amaya Perera", "email": "amaya@meetops.demo",
                                        "password": "a-long-password", "role": "member", "departmentId": dept},
                    headers=admin)
    assert r.status_code == 201 and r.json()["initials"] == "AP"
    depts = {d["name"]: d["memberCount"] for d in client.get("/api/departments", headers=member).json()}
    assert depts["Finance"] == 1


def test_insights_and_search(client, member):
    ins = client.get("/api/insights/summary", headers=member).json()
    assert ins["totals"]["meetings"] == 4 and ins["me"]["openTasks"] >= 1
    assert len(ins["weekly"]) == 8 and ins["departments"]
    s = client.get("/api/search", params={"q": "release"}, headers=member).json()
    assert s["tasks"] and s["meetings"]


def test_upload_rejects_unknown_type(client, member):
    r = client.post("/api/meetings/upload", data={"title": "x", "date": "2026-10-29"},
                    files={"file": ("notes.xyz", b"hello", "application/octet-stream")}, headers=member)
    assert r.status_code == 415


def test_upload_transcript(client, member):
    text = ("[00:00:05] Kasun: Let's start.\n"
            "[00:00:20] Ravindu: Kasun, can you fix the login bug by Friday?\n"
            "[00:00:40] Kasun: Sure, I'll do it.\n"
            "[00:01:00] Nethmi: The problem is the test server keeps crashing.\n")
    r = client.post("/api/meetings/upload", data={"title": "Bug triage", "date": "2026-10-29"},
                    files={"file": ("t.txt", text.encode(), "text/plain")}, headers=member)
    assert r.status_code == 201
    m = client.get(f"/api/meetings/{r.json()['id']}", headers=member).json()
    assert m["status"] == "Processed", m["errorMessage"]
    assert m["uploadedBy"]["name"] == "Kasun Silva"
    tasks = client.get("/api/tasks", params={"meetingId": m["id"]}, headers=member).json()
    assert len(tasks) == 1 and tasks[0]["owner"]["name"] == "Kasun Silva" and tasks[0]["deadline"] == "2026-10-30"
    assert tasks[0]["description"] == "Fix the login bug"
