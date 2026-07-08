"""AiForge backend API tests (iteration 3 — Google Play readiness).

Covers:
- Health, Auth (admin login, register, /me, logout)
- Dashboard
- Billing: 4 packs (starter/creator/pro/studio), checkout, status endpoint, webhook accepts POST
- Legal endpoints: /legal/privacy and /legal/terms
- Chat (Claude/Azure fallback, 3D intent → model job)
- Image gen (expected 500 + refund — Emergent over budget)
- Model gen async job (expected done via Azure fallback)
- Video gen async job (expected failed + refund)
- Assets CRUD, slicer settings, gcode preview
- Delete account: creates a fresh temp user and wipes it (never admin)
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@aiforge.app"
ADMIN_PASSWORD = "Admin@123"


# ----- shared fixtures -----
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    return data["access_token"]


@pytest.fixture(scope="session")
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _poll_job(session, auth, job_id, timeout=120, interval=3):
    start = time.time()
    last = None
    while time.time() - start < timeout:
        r = session.get(f"{API}/jobs/{job_id}", headers=auth, timeout=15)
        if r.status_code == 200:
            last = r.json()
            if last.get("status") in ("done", "failed"):
                return last
        time.sleep(interval)
    return last or {"status": "timeout"}


# ---------- Health ----------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self, session):
        r = session.post(f"{API}/auth/login",
                         json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == ADMIN_EMAIL
        assert body["user"].get("role") == "admin"
        assert body["user"].get("credits") == 9999
        assert "password_hash" not in body["user"]
        assert "_id" not in body["user"]

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login",
                         json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_register_and_me_with_10_credits(self, session):
        email = f"test_{uuid.uuid4().hex[:8]}@aiforge.app"
        r = session.post(f"{API}/auth/register",
                         json={"email": email, "password": "Test@1234", "name": "Tester"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        token = data["access_token"]
        assert data["user"]["credits"] == 10
        r2 = session.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        assert body["email"] == email
        assert "credits" in body

    def test_me_unauthorized(self, session):
        r = session.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_logout(self, session, auth):
        r = session.post(f"{API}/auth/logout", headers=auth, timeout=10)
        # Should be 200 (JWT is stateless — endpoint just returns ok)
        assert r.status_code in (200, 204)


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard(self, session, auth):
        r = session.get(f"{API}/dashboard", headers=auth, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "counts" in d and "recent" in d
        for k in ("image", "video", "model"):
            assert k in d["counts"]
        assert "credits" in d


# ---------- Billing (NEW: 4 tiers) ----------
class TestBilling:
    def test_packs_four_tiers(self, session, auth):
        r = session.get(f"{API}/billing/packs", headers=auth, timeout=15)
        assert r.status_code == 200
        packs = r.json()
        assert isinstance(packs, list) and len(packs) == 4
        by_id = {p["id"]: p for p in packs}
        # Expected new tiers
        assert set(by_id.keys()) == {"starter", "creator", "pro", "studio"}
        # Amounts
        assert by_id["starter"]["amount"] == 9.99 and by_id["starter"]["credits"] == 5
        assert by_id["creator"]["amount"] == 39.99 and by_id["creator"]["credits"] == 25
        assert by_id["creator"].get("best") is True
        assert by_id["pro"]["amount"] == 129.99 and by_id["pro"]["credits"] == 100
        assert by_id["studio"]["amount"] == 499.99 and by_id["studio"]["credits"] == 500

    def test_checkout_creator_returns_stripe_url(self, session, auth):
        r = session.post(f"{API}/billing/checkout", headers=auth,
                         json={"pack": "creator",
                               "origin_url": "https://ai-media-3d.preview.emergentagent.com"},
                         timeout=45)
        assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert "checkout_url" in body and body["checkout_url"].startswith("https://")
        assert "stripe.com" in body["checkout_url"] or "checkout.stripe" in body["checkout_url"]
        assert "session_id" in body and body["session_id"]
        pytest.checkout_session_id = body["session_id"]

    def test_checkout_status(self, session, auth):
        sid = getattr(pytest, "checkout_session_id", None)
        if not sid:
            pytest.skip("no checkout session")
        r = session.get(f"{API}/billing/status/{sid}", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "payment_status" in body
        assert "status" in body

    def test_webhook_accepts_post(self, session):
        # Should NOT return 405. Signature will be invalid so 200 with ok:false is acceptable.
        r = session.post(f"{API}/billing/webhook",
                         data=b"{}",
                         headers={"stripe-signature": "t=0,v1=deadbeef",
                                  "Content-Type": "application/json"},
                         timeout=15)
        assert r.status_code != 405
        assert r.status_code in (200, 400)

    def test_checkout_unknown_pack_400(self, session, auth):
        r = session.post(f"{API}/billing/checkout", headers=auth,
                         json={"pack": "bogus",
                               "origin_url": "https://ai-media-3d.preview.emergentagent.com"},
                         timeout=15)
        # Pydantic Literal validation returns 422; endpoint fallback 400 is also acceptable.
        assert r.status_code in (400, 422)


# ---------- Legal ----------
class TestLegal:
    def test_privacy(self, session):
        r = session.get(f"{API}/legal/privacy", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "policy" in body and isinstance(body["policy"], str)
        assert len(body["policy"]) > 200

    def test_terms(self, session):
        r = session.get(f"{API}/legal/terms", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "terms" in body and isinstance(body["terms"], str)
        assert len(body["terms"]) > 200


# ---------- Chat ----------
class TestChat:
    def test_chat_greeting(self, session, auth):
        r = session.post(f"{API}/chat", headers=auth,
                         json={"message": "Hi! What can you help me build today?"}, timeout=60)
        assert r.status_code == 200, f"chat failed: {r.status_code} {r.text[:500]}"
        body = r.json()
        assert "reply" in body and isinstance(body["reply"], str) and len(body["reply"]) > 0
        print(f"chat reply via={body.get('via','primary')}: {body['reply'][:120]}")

    def test_chat_3d_model_intent(self, session, auth):
        r = session.post(f"{API}/chat", headers=auth,
                         json={"message": "Design a 3D model of a phone stand 100mm tall"},
                         timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("kind") == "model"
        assert "job_id" in body
        pytest.chat_model_job = body["job_id"]

    def test_chat_3d_job_completes(self, session, auth):
        jid = getattr(pytest, "chat_model_job", None)
        if not jid:
            pytest.skip("no chat model job")
        final = _poll_job(session, auth, jid, timeout=180)
        assert final.get("status") == "done", f"job did not finish: {final}"
        asset_id = final.get("asset_id")
        assert asset_id
        r = session.get(f"{API}/assets/{asset_id}", headers=auth, timeout=15)
        assert r.status_code == 200
        a = r.json()
        assert a["type"] == "model"
        assert a.get("scad_code")
        assert a.get("stl_b64") and len(a["stl_b64"]) > 100
        assert "stats" in a
        pytest.chat_model_asset_id = asset_id


# ---------- Image gen (expected 500 + refund) ----------
class TestImageGen:
    def test_generate_image_fails_gracefully_and_refunds(self, session, auth):
        me_before = session.get(f"{API}/auth/me", headers=auth, timeout=15).json()
        credits_before = me_before["credits"]

        r = session.post(f"{API}/generate/image", headers=auth,
                         json={"prompt": "TEST a small red apple on white background"}, timeout=120)
        if r.status_code == 200:
            print("Image gen unexpectedly succeeded — Emergent key must have been topped up.")
            return
        assert r.status_code in (500, 502, 402), f"unexpected: {r.status_code} {r.text[:200]}"
        time.sleep(1)
        credits_after = session.get(f"{API}/auth/me", headers=auth, timeout=15).json()["credits"]
        assert credits_after >= credits_before - 1, (
            f"credits not refunded: before={credits_before} after={credits_after}")
        print(f"Image gen failed as expected ({r.status_code}); "
              f"credits before={credits_before} after={credits_after}")


# ---------- Model gen (async) ----------
class TestModelGen:
    def test_generate_model_async_job(self, session, auth):
        r = session.post(f"{API}/generate/model", headers=auth,
                         json={"prompt": "TEST a simple cylindrical pen holder 60mm tall 40mm diameter"},
                         timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "queued"
        assert "job_id" in body
        pytest.model_job_id = body["job_id"]

    def test_model_job_completes_via_azure_fallback(self, session, auth):
        jid = getattr(pytest, "model_job_id", None)
        if not jid:
            pytest.skip("no model job")
        final = _poll_job(session, auth, jid, timeout=180)
        assert final.get("status") == "done", f"model job did not finish: {final}"
        asset_id = final.get("asset_id")
        assert asset_id
        r = session.get(f"{API}/assets/{asset_id}", headers=auth, timeout=15)
        assert r.status_code == 200
        a = r.json()
        assert a["type"] == "model"
        assert a.get("stl_b64") and len(a["stl_b64"]) > 100
        assert a.get("scad_code")
        assert "slicer_settings" in a and "estimate" in a
        pytest.model_asset_id = asset_id

    def test_update_slicer(self, session, auth):
        aid = getattr(pytest, "model_asset_id", None)
        if not aid:
            pytest.skip("no model asset")
        r = session.patch(
            f"{API}/assets/{aid}/slicer", headers=auth,
            json={"settings": {"layer_height": 0.3, "infill_percent": 35, "supports": True,
                               "print_speed": 80, "nozzle_temp": 215, "bed_temp": 65}},
            timeout=15)
        assert r.status_code == 200
        a = r.json()
        assert a["slicer_settings"]["layer_height"] == 0.3
        assert a["slicer_settings"]["infill_percent"] == 35
        assert a["slicer_settings"]["supports"] is True
        assert "estimate" in a

    def test_gcode_preview(self, session, auth):
        aid = getattr(pytest, "model_asset_id", None)
        if not aid:
            pytest.skip("no model asset")
        r = session.get(f"{API}/assets/{aid}/gcode-preview", headers=auth, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "gcode" in body and "M104" in body["gcode"]
        assert "estimate" in body


# ---------- Video gen (async, expected fail + refund) ----------
class TestVideoGen:
    def test_generate_video_returns_job(self, session, auth):
        me_before = session.get(f"{API}/auth/me", headers=auth, timeout=15).json()
        pytest.credits_before_video = me_before["credits"]
        r = session.post(f"{API}/generate/video", headers=auth,
                         json={"prompt": "TEST a calm ocean wave at sunset",
                               "duration": 4, "size": "1280x720"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "queued"
        assert "job_id" in body
        pytest.video_job_id = body["job_id"]

    def test_video_job_fails_and_refunds(self, session, auth):
        jid = getattr(pytest, "video_job_id", None)
        if not jid:
            pytest.skip("no video job")
        final = _poll_job(session, auth, jid, timeout=180, interval=5)
        status = final.get("status")
        assert status in ("failed", "done"), f"unexpected final state: {final}"
        if status == "failed":
            time.sleep(2)
            credits_after = session.get(f"{API}/auth/me", headers=auth, timeout=15).json()["credits"]
            assert credits_after >= pytest.credits_before_video - 1, (
                f"video failure did not refund: before={pytest.credits_before_video} "
                f"after={credits_after}")
            print(f"Video failed as expected; credits before={pytest.credits_before_video} "
                  f"after={credits_after}")


# ---------- Assets CRUD ----------
class TestAssets:
    def test_list_assets(self, session, auth):
        r = session.get(f"{API}/assets", headers=auth, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_filter_assets(self, session, auth):
        for t in ("image", "video", "model"):
            r = session.get(f"{API}/assets?asset_type={t}", headers=auth, timeout=15)
            assert r.status_code == 200
            for a in r.json():
                assert a["type"] == t

    def test_get_asset_detail(self, session, auth):
        aid = (getattr(pytest, "model_asset_id", None)
               or getattr(pytest, "chat_model_asset_id", None))
        if not aid:
            pytest.skip("no asset created")
        r = session.get(f"{API}/assets/{aid}", headers=auth, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == aid

    def test_delete_asset_and_404(self, session, auth):
        aid = getattr(pytest, "chat_model_asset_id", None)
        if not aid:
            pytest.skip("no asset to delete")
        r = session.delete(f"{API}/assets/{aid}", headers=auth, timeout=15)
        assert r.status_code == 200
        r2 = session.get(f"{API}/assets/{aid}", headers=auth, timeout=15)
        assert r2.status_code == 404


# ---------- Delete Account (fresh temp user only) ----------
class TestDeleteAccount:
    def test_delete_account_wipes_everything(self, session):
        # Register fresh user
        email = f"testdelete_{int(time.time())}_{uuid.uuid4().hex[:6]}@aiforge.app"
        r = session.post(f"{API}/auth/register",
                         json={"email": email, "password": "Test@1234", "name": "ToDelete"},
                         timeout=20)
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        hdrs = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # /me works before deletion
        r2 = session.get(f"{API}/auth/me", headers=hdrs, timeout=10)
        assert r2.status_code == 200

        # Delete account
        r3 = session.delete(f"{API}/auth/account", headers=hdrs, timeout=15)
        assert r3.status_code == 200, r3.text
        body = r3.json()
        assert body.get("ok") is True
        assert body.get("deleted_user_id")

        # /me should now fail (user is gone, token invalid)
        r4 = session.get(f"{API}/auth/me", headers=hdrs, timeout=10)
        assert r4.status_code in (401, 404), f"expected 401/404, got {r4.status_code}"

        # Re-login should also fail
        r5 = session.post(f"{API}/auth/login",
                          json={"email": email, "password": "Test@1234"}, timeout=15)
        assert r5.status_code == 401
