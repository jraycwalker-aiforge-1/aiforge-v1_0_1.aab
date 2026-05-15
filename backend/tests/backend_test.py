"""ForgeAI backend API tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ai-media-3d.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@forgeai.com"
ADMIN_PASSWORD = "Admin@123"


# ----- shared state -----
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    return data["access_token"]


@pytest.fixture(scope="session")
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Health ----------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == ADMIN_EMAIL
        assert body["user"].get("role") == "admin"
        assert "password_hash" not in body["user"]

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_register_and_me(self, session):
        email = f"test_{uuid.uuid4().hex[:8]}@forgeai.com"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "Tester"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        token = data["access_token"]
        # /me
        r2 = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["email"] == email

    def test_me_unauthorized(self, session):
        r = session.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard(self, session, auth):
        r = session.get(f"{API}/dashboard", headers=auth, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "counts" in d and "recent" in d
        for k in ("image", "video", "model"):
            assert k in d["counts"]


# ---------- Image Generation ----------
class TestImageGen:
    def test_generate_image(self, session, auth):
        r = session.post(
            f"{API}/generate/image",
            headers=auth,
            json={"prompt": "TEST a small red apple on white background, studio lighting"},
            timeout=120,
        )
        assert r.status_code == 200, f"image gen failed: {r.status_code} {r.text[:500]}"
        a = r.json()
        assert a["type"] == "image"
        assert a.get("image_b64") and len(a["image_b64"]) > 100
        pytest.image_asset_id = a["id"]

    def test_image_appears_in_assets(self, session, auth):
        aid = getattr(pytest, "image_asset_id", None)
        if not aid:
            pytest.skip("no image asset created")
        r = session.get(f"{API}/assets?asset_type=image", headers=auth, timeout=15)
        assert r.status_code == 200
        ids = [a["id"] for a in r.json()]
        assert aid in ids


# ---------- Model Generation ----------
class TestModelGen:
    def test_generate_model(self, session, auth):
        r = session.post(
            f"{API}/generate/model",
            headers=auth,
            json={"prompt": "TEST a simple cylindrical pen holder 60mm tall 40mm diameter"},
            timeout=180,
        )
        assert r.status_code == 200, f"model gen failed: {r.status_code} {r.text[:500]}"
        a = r.json()
        assert a["type"] == "model"
        assert a.get("stl_b64") and len(a["stl_b64"]) > 100
        assert "scad_code" in a
        assert "stats" in a and "triangle_count" in a["stats"]
        assert "slicer_settings" in a and "estimate" in a
        pytest.model_asset_id = a["id"]

    def test_update_slicer(self, session, auth):
        aid = getattr(pytest, "model_asset_id", None)
        if not aid:
            pytest.skip("no model asset created")
        r = session.patch(
            f"{API}/assets/{aid}/slicer",
            headers=auth,
            json={"settings": {"layer_height": 0.3, "infill_percent": 35, "supports": True, "print_speed": 80, "nozzle_temp": 215, "bed_temp": 65}},
            timeout=15,
        )
        assert r.status_code == 200
        a = r.json()
        assert a["slicer_settings"]["layer_height"] == 0.3
        assert a["slicer_settings"]["infill_percent"] == 35
        assert a["slicer_settings"]["supports"] is True

    def test_gcode_preview(self, session, auth):
        aid = getattr(pytest, "model_asset_id", None)
        if not aid:
            pytest.skip("no model asset")
        r = session.get(f"{API}/assets/{aid}/gcode-preview", headers=auth, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "gcode" in body and "M104" in body["gcode"]


# ---------- Video Generation (the key bug) ----------
class TestVideoGen:
    def test_generate_video(self, session, auth):
        start = time.time()
        try:
            r = session.post(
                f"{API}/generate/video",
                headers=auth,
                json={"prompt": "TEST a calm ocean wave at sunset, cinematic", "duration": 4, "size": "1280x720"},
                timeout=600,
            )
        except requests.exceptions.ReadTimeout:
            pytest.fail(f"video gen client timeout after {time.time()-start:.0f}s")
        elapsed = time.time() - start
        print(f"Video gen took {elapsed:.1f}s, status={r.status_code}")
        assert r.status_code == 200, f"video gen failed: {r.status_code} {r.text[:1000]}"
        a = r.json()
        assert a["type"] == "video"
        assert a.get("video_b64") and len(a["video_b64"]) > 1000
        pytest.video_asset_id = a["id"]


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
        aid = getattr(pytest, "image_asset_id", None) or getattr(pytest, "model_asset_id", None)
        if not aid:
            pytest.skip("no asset created")
        r = session.get(f"{API}/assets/{aid}", headers=auth, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == aid

    def test_delete_asset_and_404(self, session, auth):
        # create a throwaway image to delete? expensive; reuse image_asset_id only if exists
        aid = getattr(pytest, "image_asset_id", None)
        if not aid:
            pytest.skip("no image asset to delete")
        r = session.delete(f"{API}/assets/{aid}", headers=auth, timeout=15)
        assert r.status_code == 200
        r2 = session.get(f"{API}/assets/{aid}", headers=auth, timeout=15)
        assert r2.status_code == 404
