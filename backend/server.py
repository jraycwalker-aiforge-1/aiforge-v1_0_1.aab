from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os, io, base64, uuid, logging, asyncio, math, re, json as _json
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal, Any

import bcrypt
import jwt
import stripe
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest, CheckoutStatusResponse,
)
import trimesh

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration

# Azure OpenAI fallback (AI Foundry GPT-4o) — used when Emergent key fails
try:
    from openai import AzureOpenAI
    AZURE_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
    AZURE_KEY = os.environ.get("AZURE_OPENAI_KEY", "")
    AZURE_DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-aiforge1")
    AZURE_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
    _azure_client = (
        AzureOpenAI(api_version=AZURE_API_VERSION, azure_endpoint=AZURE_ENDPOINT, api_key=AZURE_KEY)
        if AZURE_ENDPOINT and AZURE_KEY else None
    )
except Exception:
    _azure_client = None

def azure_chat(system: str, user_text: str, max_tokens: int = 2048) -> Optional[str]:
    """Synchronous Azure GPT-4o chat completion. Returns text or None on failure."""
    if not _azure_client:
        return None
    try:
        r = _azure_client.chat.completions.create(
            model=AZURE_DEPLOYMENT,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user_text}],
            max_tokens=max_tokens, temperature=0.7, top_p=1.0,
        )
        return r.choices[0].message.content or ""
    except Exception as e:
        log_azure = logging.getLogger("aiforge.azure")
        log_azure.warning("Azure fallback failed: %s", e)
        return None

# ----- Config -----
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@aiforge.app')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Admin@123')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')
JWT_ALGORITHM = "HS256"
FREE_CREDITS = 10

stripe.api_key = STRIPE_API_KEY

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="AiForge")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log = logging.getLogger("aiforge")

# ----- Auth helpers -----
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try: return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception: return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user: raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ----- Models -----
class RegisterReq(BaseModel):
    email: EmailStr; password: str = Field(min_length=6); name: str = Field(min_length=1)

class LoginReq(BaseModel):
    email: EmailStr; password: str

class ImageGenReq(BaseModel):
    prompt: str = Field(min_length=3)

class VideoGenReq(BaseModel):
    prompt: str = Field(min_length=3)
    duration: Literal[4, 8, 12] = 4
    size: Literal["1280x720", "1792x1024", "1024x1792", "1024x1024"] = "1280x720"

class ModelGenReq(BaseModel):
    prompt: str = Field(min_length=3)

class SlicerSettings(BaseModel):
    layer_height: float = 0.2; infill_percent: int = 20; supports: bool = False
    print_speed: int = 60; nozzle_temp: int = 210; bed_temp: int = 60

class UpdateSlicerReq(BaseModel):
    settings: SlicerSettings

class ChatReq(BaseModel):
    message: str
    session_id: Optional[str] = None

class CheckoutReq(BaseModel):
    pack: Literal["starter", "creator", "pro", "studio"]
    origin_url: str  # frontend origin so we redirect back

# ----- Credit helpers -----
async def consume_credit(user: dict, n: int = 1):
    """Atomically decrement credits. Raise 402 if not enough."""
    res = await db.users.find_one_and_update(
        {"id": user["id"], "credits": {"$gte": n}},
        {"$inc": {"credits": -n}},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=402,
            detail="Out of credits. Top up to keep creating.")
    return res

# ----- Auth endpoints -----
@api.post("/auth/register")
async def register(body: RegisterReq):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {"id": user_id, "email": email, "name": body.name.strip(),
           "password_hash": hash_password(body.password), "role": "user",
           "credits": FREE_CREDITS,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    return {"access_token": token, "user": {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}}

@api.post("/auth/login")
async def login(body: LoginReq):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    return {"access_token": token, "user": {k: v for k, v in user.items() if k not in ("password_hash", "_id")}}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}

# ----- Asset helpers -----
async def _save_asset(user_id: str, asset_type: str, prompt: str, data: dict) -> dict:
    asset = {"id": str(uuid.uuid4()), "user_id": user_id, "type": asset_type,
             "prompt": prompt, "created_at": datetime.now(timezone.utc).isoformat(), **data}
    await db.assets.insert_one(asset.copy())
    asset.pop("_id", None)
    return asset

# ----- Image (sync, fast ~5-15s) -----
@api.post("/generate/image")
async def generate_image(body: ImageGenReq, user: dict = Depends(get_current_user)):
    await consume_credit(user, 1)
    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"img-{uuid.uuid4()}",
                       system_message="You are an expert AI image generator. Create vivid, detailed imagery.")
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        text, images = await chat.send_message_multimodal_response(UserMessage(text=body.prompt))
        if not images: raise HTTPException(status_code=502, detail="No image returned")
        img = images[0]
        return await _save_asset(user["id"], "image", body.prompt, {
            "mime_type": img.get("mime_type", "image/png"),
            "image_b64": img["data"], "caption": text or ""})
    except HTTPException: raise
    except Exception as e:
        log.exception("image gen failed")
        # refund
        await db.users.update_one({"id": user["id"]}, {"$inc": {"credits": 1}})
        raise HTTPException(status_code=500, detail=f"Image generation failed: {e}")

# ----- 3D Model gen (async via job) -----
SCAD_SYSTEM = """You are an expert OpenSCAD 3D modeler. When the user describes an object, you MUST:
1. Write concise, valid OpenSCAD code (use primitives: cube, sphere, cylinder, polyhedron, and operations: union, difference, intersection, translate, rotate, scale). Max 60 lines.
2. Also output a simplified JSON parameters block our renderer can use to build a preview mesh.

Return your response in this EXACT format (no markdown fences around the whole response):

```scad
<openscad code here>
```

```json
{
  "primitives": [
    {"shape": "cube"|"sphere"|"cylinder", "size": [x,y,z]|radius|[r,h], "translate": [x,y,z], "rotate": [x,y,z]}
  ],
  "bounds": {"x": mm, "y": mm, "z": mm},
  "name": "short descriptive name"
}
```

All dimensions in millimeters. Keep the model printable: non-zero wall thickness, max bounds ~100mm."""

def _extract_block(text: str, tag: str) -> Optional[str]:
    m = re.search(rf"```{tag}\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else None

def _build_stl_from_primitives(primitives: list) -> bytes:
    meshes = []
    for p in primitives:
        shape = p.get("shape", "cube")
        try:
            if shape == "cube":
                size = p.get("size", [20, 20, 20])
                if isinstance(size, (int, float)): size = [float(size)] * 3
                m = trimesh.creation.box(extents=[max(0.1, float(s)) for s in size[:3]])
            elif shape == "sphere":
                r = p.get("size", 10)
                if isinstance(r, list): r = r[0]
                m = trimesh.creation.icosphere(radius=max(0.1, float(r)), subdivisions=2)
            elif shape == "cylinder":
                s = p.get("size", [10, 20])
                if isinstance(s, (int, float)): s = [float(s), float(s) * 2]
                m = trimesh.creation.cylinder(radius=max(0.1, float(s[0])), height=max(0.1, float(s[1])), sections=32)
            else: continue
            tr = p.get("translate", [0, 0, 0])
            rot = p.get("rotate", [0, 0, 0])
            if any(rot):
                for axis, ang in zip([[1,0,0],[0,1,0],[0,0,1]], rot):
                    m.apply_transform(trimesh.transformations.rotation_matrix(math.radians(ang), axis))
            m.apply_translation([float(tr[0]), float(tr[1]), float(tr[2])])
            meshes.append(m)
        except Exception: continue
    if not meshes:
        meshes = [trimesh.creation.box(extents=[20, 20, 20])]
    combined = trimesh.util.concatenate(meshes)
    buf = io.BytesIO()
    combined.export(buf, file_type="stl")
    return buf.getvalue()

def _mesh_stats(stl_bytes: bytes) -> dict:
    try:
        m = trimesh.load(io.BytesIO(stl_bytes), file_type="stl")
        bounds = m.bounds.tolist() if m.bounds is not None else [[0,0,0],[0,0,0]]
        extents = m.extents.tolist() if m.extents is not None else [0,0,0]
        return {"triangle_count": int(len(m.faces)), "vertex_count": int(len(m.vertices)),
                "bounds": bounds,
                "dimensions_mm": {"x": round(extents[0],2), "y": round(extents[1],2), "z": round(extents[2],2)},
                "volume_mm3": round(float(m.volume),2) if m.is_volume else 0.0}
    except Exception:
        return {"triangle_count": 0, "vertex_count": 0,
                "dimensions_mm": {"x":0,"y":0,"z":0}, "volume_mm3": 0}

def _estimate_print(stats: dict, settings: SlicerSettings) -> dict:
    z = stats.get("dimensions_mm", {}).get("z", 0) or 0
    vol = stats.get("volume_mm3", 0) or 0
    layers = max(1, int(z / max(0.05, settings.layer_height)))
    filament_vol = vol * (settings.infill_percent / 100.0) * 0.6 + vol * 0.4
    filament_length_mm = filament_vol / (math.pi * (1.75/2)**2) if filament_vol > 0 else 0
    time_min = (layers * 0.25) * (100 / max(20, settings.print_speed))
    return {"layers": layers, "estimated_time_min": round(time_min,1),
            "filament_length_m": round(filament_length_mm/1000, 2),
            "filament_grams": round(filament_vol * 0.00124, 2)}

# ----- Job system (handles long-running video & model gen) -----
async def _create_job(user_id: str, kind: str, payload: dict) -> str:
    job_id = str(uuid.uuid4())
    await db.jobs.insert_one({
        "id": job_id, "user_id": user_id, "kind": kind,
        "status": "queued", "progress": 0, "asset_id": None, "error": None,
        "payload": payload,
        "created_at": datetime.now(timezone.utc).isoformat()})
    return job_id

async def _update_job(job_id: str, **fields):
    await db.jobs.update_one({"id": job_id}, {"$set": fields})

async def _run_video_job(job_id: str, user_id: str, payload: dict):
    try:
        await _update_job(job_id, status="running", progress=10)
        def _sora(prompt, size, duration):
            gen = OpenAIVideoGeneration(api_key=EMERGENT_LLM_KEY)
            return gen.text_to_video(prompt=prompt, model="sora-2", size=size,
                                     duration=duration, max_wait_time=900)
        video_bytes = await asyncio.to_thread(_sora, payload["prompt"], payload["size"], payload["duration"])
        if not video_bytes:
            raise RuntimeError("Empty video bytes from Sora")
        await _update_job(job_id, progress=90)
        b64 = base64.b64encode(video_bytes).decode()
        asset = await _save_asset(user_id, "video", payload["prompt"], {
            "mime_type": "video/mp4", "video_b64": b64,
            "duration": payload["duration"], "size": payload["size"]})
        await _update_job(job_id, status="done", progress=100, asset_id=asset["id"])
    except Exception as e:
        log.exception("video job failed")
        await db.users.update_one({"id": user_id}, {"$inc": {"credits": 5}})  # refund
        await _update_job(job_id, status="failed", error=str(e))

async def _run_model_job(job_id: str, user_id: str, payload: dict):
    try:
        await _update_job(job_id, status="running", progress=15)
        response_text: Optional[str] = None
        # Try Claude via Emergent first
        try:
            chat = LlmChat(api_key=EMERGENT_LLM_KEY,
                           session_id=f"scad-{uuid.uuid4()}",
                           system_message=SCAD_SYSTEM)
            chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
            r = await chat.send_message(UserMessage(text=f"Design a 3D-printable object: {payload['prompt']}"))
            response_text = r if isinstance(r, str) else str(r)
        except Exception as e:
            log.warning("Claude SCAD gen failed, falling back to Azure GPT-4o: %s", e)
            response_text = await asyncio.to_thread(
                azure_chat, SCAD_SYSTEM,
                f"Design a 3D-printable object: {payload['prompt']}", 3072,
            )
            if not response_text:
                raise RuntimeError("Both Claude and Azure GPT-4o failed for SCAD generation")
        await _update_job(job_id, progress=70)
        scad_code = _extract_block(response_text, "scad") or response_text
        json_block = _extract_block(response_text, "json")
        primitives, name = [], payload["prompt"][:40]
        if json_block:
            try:
                parsed = _json.loads(json_block)
                primitives = parsed.get("primitives", [])
                name = parsed.get("name", name)
            except Exception: pass
        stl_bytes = await asyncio.to_thread(_build_stl_from_primitives,
                                            primitives or [{"shape": "cube", "size": [30,30,30]}])
        stats = _mesh_stats(stl_bytes)
        default_settings = SlicerSettings().model_dump()
        estimate = _estimate_print(stats, SlicerSettings(**default_settings))
        asset = await _save_asset(user_id, "model", payload["prompt"], {
            "name": name, "scad_code": scad_code,
            "stl_b64": base64.b64encode(stl_bytes).decode(),
            "primitives": primitives, "stats": stats,
            "slicer_settings": default_settings, "estimate": estimate})
        await _update_job(job_id, status="done", progress=100, asset_id=asset["id"])
    except Exception as e:
        log.exception("model job failed")
        await db.users.update_one({"id": user_id}, {"$inc": {"credits": 2}})  # refund
        await _update_job(job_id, status="failed", error=str(e))

@api.post("/generate/video")
async def generate_video(body: VideoGenReq, bg: BackgroundTasks,
                         user: dict = Depends(get_current_user)):
    await consume_credit(user, 5)  # video costs 5 credits
    job_id = await _create_job(user["id"], "video", body.model_dump())
    bg.add_task(_run_video_job, job_id, user["id"], body.model_dump())
    return {"job_id": job_id, "status": "queued",
            "eta_seconds": 60 if body.duration == 4 else 120}

@api.post("/generate/model")
async def generate_model(body: ModelGenReq, bg: BackgroundTasks,
                         user: dict = Depends(get_current_user)):
    await consume_credit(user, 2)  # model costs 2 credits
    job_id = await _create_job(user["id"], "model", body.model_dump())
    bg.add_task(_run_model_job, job_id, user["id"], body.model_dump())
    return {"job_id": job_id, "status": "queued", "eta_seconds": 30}

@api.get("/jobs/{job_id}")
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id, "user_id": user["id"]}, {"_id": 0})
    if not job: raise HTTPException(status_code=404, detail="Job not found")
    return job

# ----- AI Chat Assistant (with on-the-fly creation) -----
@api.post("/chat")
async def chat_assistant(body: ChatReq, bg: BackgroundTasks,
                         user: dict = Depends(get_current_user)):
    """Smart chat: if message asks to generate image/video/3D, kicks off a job and returns its id."""
    session_id = body.session_id or f"chat-{user['id']}"
    msg_lower = body.message.lower()
    # Intent detection (simple heuristic — model is also instructed below)
    if any(k in msg_lower for k in ["generate image", "make image", "draw ", "make a picture"]):
        try:
            await consume_credit(user, 1)
            chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"img-{uuid.uuid4()}",
                           system_message="You are an AI image generator.")
            chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image","text"])
            text, images = await chat.send_message_multimodal_response(UserMessage(text=body.message))
            if images:
                asset = await _save_asset(user["id"], "image", body.message, {
                    "mime_type": images[0].get("mime_type", "image/png"),
                    "image_b64": images[0]["data"], "caption": text or ""})
                return {"reply": f"Here's your image. Saved to library.",
                        "asset_id": asset["id"], "asset_type": "image"}
        except HTTPException as e:
            return {"reply": f"⚠️ {e.detail}"}
    if any(k in msg_lower for k in ["3d model", "stl", "openscad", "print this", "design a 3d"]):
        try:
            await consume_credit(user, 2)
            job_id = await _create_job(user["id"], "model", {"prompt": body.message})
            bg.add_task(_run_model_job, job_id, user["id"], {"prompt": body.message})
            return {"reply": "Designing your 3D model... I'll save the STL to your library when ready.",
                    "job_id": job_id, "kind": "model"}
        except HTTPException as e:
            return {"reply": f"⚠️ {e.detail}"}
    if any(k in msg_lower for k in ["generate video", "make video", "sora", "make a clip"]):
        try:
            await consume_credit(user, 5)
            payload = {"prompt": body.message, "duration": 4, "size": "1280x720"}
            job_id = await _create_job(user["id"], "video", payload)
            bg.add_task(_run_video_job, job_id, user["id"], payload)
            return {"reply": "Generating video with Sora 2... I'll save it to your library when done.",
                    "job_id": job_id, "kind": "video"}
        except HTTPException as e:
            return {"reply": f"⚠️ {e.detail}"}

    # Regular conversation (Claude → Azure GPT-4o fallback)
    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id,
                       system_message=(
                           "You are AiForge's AI maker assistant. You help users brainstorm and refine "
                           "prompts for image, video, and 3D model generation. You know about OpenSCAD, "
                           "3D printing slicer settings (layer height, infill, supports), and creative "
                           "prompting. Keep replies under 120 words, friendly, technical, no markdown headers."))
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        reply = await chat.send_message(UserMessage(text=body.message))
        return {"reply": str(reply)}
    except Exception as e:
        log.warning("Claude chat failed, trying Azure GPT-4o fallback: %s", e)
        # Azure GPT-4o fallback
        az = await asyncio.to_thread(
            azure_chat,
            "You are AiForge's AI maker assistant. Help with image/video/3D prompts, OpenSCAD, "
            "slicer settings. Keep replies under 120 words. No markdown headers.",
            body.message, 1024,
        )
        if az:
            return {"reply": az, "via": "azure-gpt-4o"}
        raise HTTPException(status_code=500, detail=f"Chat failed (both providers): {e}")

# ----- Stripe Credits Checkout (uses emergentintegrations wrapper) -----
CREDIT_PACKS = {
    "starter": {"credits": 5,   "amount": 9.99,   "name": "Starter", "tagline": "Try it out"},
    "creator": {"credits": 25,  "amount": 39.99,  "name": "Creator", "tagline": "Most popular", "best": True},
    "pro":     {"credits": 100, "amount": 129.99, "name": "Pro",     "tagline": "Heavy maker"},
    "studio":  {"credits": 500, "amount": 499.99, "name": "Studio",  "tagline": "Best value"},
}

@api.get("/billing/packs")
async def list_packs():
    return [{"id": k, **v} for k, v in CREDIT_PACKS.items()]

@api.post("/billing/checkout")
async def create_checkout(body: CheckoutReq, request: Request,
                          user: dict = Depends(get_current_user)):
    pack = CREDIT_PACKS.get(body.pack)
    if not pack:
        raise HTTPException(status_code=400, detail="Unknown pack")
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    origin = body.origin_url.rstrip("/")
    webhook_url = f"{str(request.base_url).rstrip('/')}/api/billing/webhook"
    try:
        checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        session = await checkout.create_checkout_session(CheckoutSessionRequest(
            amount=float(pack["amount"]),
            currency="usd",
            success_url=f"{origin}/billing/return?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/billing/return?canceled=1",
            metadata={"user_id": user["id"], "pack": body.pack,
                      "credits": str(pack["credits"]), "pack_name": pack["name"]},
        ))
        await db.payments.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"], "session_id": session.session_id,
            "pack": body.pack, "credits": pack["credits"],
            "amount": float(pack["amount"]), "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()})
        return {"checkout_url": session.url, "session_id": session.session_id}
    except Exception as e:
        log.exception("stripe failed")
        raise HTTPException(status_code=500, detail=f"Stripe error: {e}")

@api.get("/billing/status/{session_id}")
async def billing_status(session_id: str, request: Request,
                         user: dict = Depends(get_current_user)):
    payment = await db.payments.find_one({"session_id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    try:
        webhook_url = f"{str(request.base_url).rstrip('/')}/api/billing/webhook"
        checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        status_obj: CheckoutStatusResponse = await checkout.get_checkout_status(session_id)
        if status_obj.payment_status == "paid" and payment["status"] != "completed":
            upd = await db.payments.update_one(
                {"session_id": session_id, "status": {"$ne": "completed"}},
                {"$set": {"status": "completed",
                          "completed_at": datetime.now(timezone.utc).isoformat()}})
            if upd.modified_count == 1:
                await db.users.update_one({"id": user["id"]},
                                          {"$inc": {"credits": payment["credits"]}})
                payment["status"] = "completed"
        return {"payment_status": status_obj.payment_status,
                "status": payment["status"], "credits_granted": payment["credits"]}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.post("/billing/webhook")
async def billing_webhook(request: Request):
    sig = request.headers.get("stripe-signature", "")
    body = await request.body()
    try:
        webhook_url = f"{str(request.base_url).rstrip('/')}/api/billing/webhook"
        checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        event = await checkout.handle_webhook(body, sig)
        if event.event_type == "checkout.session.completed" and event.payment_status == "paid":
            payment = await db.payments.find_one({"session_id": event.session_id}, {"_id": 0})
            if payment and payment.get("status") != "completed":
                upd = await db.payments.update_one(
                    {"session_id": event.session_id, "status": {"$ne": "completed"}},
                    {"$set": {"status": "completed",
                              "completed_at": datetime.now(timezone.utc).isoformat()}})
                if upd.modified_count == 1:
                    await db.users.update_one({"id": payment["user_id"]},
                                              {"$inc": {"credits": payment["credits"]}})
        return {"ok": True}
    except Exception as e:
        log.warning("webhook err: %s", e)
        return {"ok": False, "error": str(e)}

# ----- Account / Privacy -----
PRIVACY_POLICY = """# AiForge Privacy Policy

Last updated: February 2026

## Summary
We collect the minimum needed to run AiForge. Your prompts and generated content are stored
in your private library and never shared.

## Data we collect
- **Account**: email + display name (used to sign you in)
- **Authentication**: hashed password (bcrypt) — never stored in plaintext
- **Generated content**: images, videos, 3D models you create, plus the prompts you typed
- **Billing**: Stripe handles all card data — we only see your purchase history (pack, date, status)
- **Usage**: credit balance and history of jobs (queued/running/completed)

## How AI providers see your data
- Image generation: Google (Gemini Nano Banana)
- Video generation: OpenAI (Sora 2)
- 3D / SCAD / chat: Anthropic (Claude Sonnet 4.5) or Microsoft Azure OpenAI (GPT-4o, fallback)
Each provider receives only your prompt text. We do not send your account email or personal data to them.

## How we use it
- To generate the content you asked for
- To bill you for credit packs you purchase
- To show you your library across devices

## What we DO NOT do
- We do NOT train any AI on your prompts
- We do NOT show your content to other users
- We do NOT sell your data to anyone
- We do NOT use cookies for tracking
- We do NOT collect location, contacts, camera, microphone, or files on your device

## Google Play Data Safety declarations
- Data collected: email, name, purchase history, user-generated content (prompts, images, videos, 3D models)
- Data shared: only your prompt text is sent to AI providers listed above to fulfill your request
- Data encrypted in transit (HTTPS)
- Data can be deleted: yes — see below
- All data collection is optional (only what you enter or generate)

## Your rights
- **Export**: every asset can be exported (PNG, MP4, STL) via the share sheet
- **Delete one asset**: tap the trash icon on any asset detail screen
- **Delete your whole account + all data**: Profile → Delete Account (permanent, irreversible)
- **Email us**: privacy@aiforge.app for any other request

## Children
AiForge is not intended for users under 13.

## Changes
We will notify you in-app if this policy changes.

## Contact
privacy@aiforge.app
"""

TERMS_OF_SERVICE = """# AiForge Terms of Service

Last updated: February 2026

## 1. Acceptance
By using AiForge you agree to these terms. If you do not agree, do not use the app.

## 2. What AiForge does
AiForge lets you generate images, videos, and 3D-printable models using AI providers.
Content is generated on demand and saved to your private library.

## 3. Your account
- You must provide a valid email and a password of at least 6 characters.
- You are responsible for keeping your password safe.
- One account per person. No shared or bot accounts.
- Minimum age: 13.

## 4. Credits & payments
- New accounts receive 10 free credits.
- Additional credits can be purchased in packs (Starter / Creator / Pro / Studio).
- Costs: image = 1 credit, 3D model = 2 credits, video = 5 credits. Failed jobs are automatically refunded.
- Payments are processed by Stripe. We do not see your card details.
- Credits are non-refundable once consumed. Unconsumed credits do not expire.
- Prices shown in USD. Local tax may be added at checkout.

## 5. Acceptable use — you agree NOT to
- Generate content that is illegal in your jurisdiction.
- Generate CSAM, non-consensual sexual content, or content designed to deceive/impersonate real people.
- Generate content that violates any third-party rights (copyright, trademark, publicity).
- Attempt to bypass credit limits, reverse-engineer the app, or resell access.
- Use the app to send spam, malware, or automated attacks.

We reserve the right to suspend accounts that violate these rules. Serious violations may be reported to authorities.

## 6. Ownership of generated content
- You own the content you generate, subject to the underlying AI provider terms
  (Google/OpenAI/Anthropic/Microsoft).
- We do not claim ownership of anything you create.
- You are responsible for how you use, publish, or sell your generated content.

## 7. Availability
- We aim for high uptime but do not guarantee it.
- Third-party AI providers may fail or be unavailable; we will refund credits for failed jobs.
- Features may change without notice as we improve the app.

## 8. Termination
- You can delete your account any time from Profile → Delete Account.
- We may terminate accounts that violate section 5 or these terms.
- On termination, your assets are permanently deleted.

## 9. Disclaimer
The app is provided "as-is" without warranties. AI-generated content may be inaccurate or unexpected.
Do not rely on generated STL files for load-bearing, medical, or safety-critical prints without your own validation.

## 10. Limitation of liability
To the maximum extent allowed by law, AiForge is not liable for indirect damages, lost profits,
or lost data. Our total liability is capped at the amount you paid us in the previous 12 months.

## 11. Governing law
These terms are governed by the laws of the jurisdiction where AiForge is headquartered.

## 12. Contact
support@aiforge.app · privacy@aiforge.app
"""

@api.get("/legal/privacy")
async def get_privacy():
    return {"policy": PRIVACY_POLICY, "updated_at": "2026-02-04"}

@api.get("/legal/terms")
async def get_terms():
    return {"terms": TERMS_OF_SERVICE, "updated_at": "2026-02-04"}

@api.delete("/auth/account")
async def delete_account(user: dict = Depends(get_current_user)):
    """Permanently delete user + all their assets, jobs, payments. Irreversible."""
    uid = user["id"]
    await db.assets.delete_many({"user_id": uid})
    await db.jobs.delete_many({"user_id": uid})
    await db.payments.delete_many({"user_id": uid})
    await db.users.delete_one({"id": uid})
    return {"ok": True, "deleted_user_id": uid}

# ----- Library & asset CRUD -----
@api.get("/assets")
async def list_assets(asset_type: Optional[str] = None,
                      user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if asset_type in ("image", "video", "model"): query["type"] = asset_type
    items = await db.assets.find(query, {"_id": 0}).sort("created_at", -1).limit(200).to_list(length=200)
    return [{"id": a["id"], "type": a["type"], "prompt": a.get("prompt",""),
             "created_at": a.get("created_at"), "name": a.get("name"),
             "thumb_b64": (a.get("image_b64") if a["type"]=="image" else None),
             "duration": a.get("duration"), "size": a.get("size"),
             "stats": a.get("stats")} for a in items]

@api.get("/assets/{asset_id}")
async def get_asset(asset_id: str, user: dict = Depends(get_current_user)):
    asset = await db.assets.find_one({"id": asset_id, "user_id": user["id"]}, {"_id": 0})
    if not asset: raise HTTPException(status_code=404, detail="Asset not found")
    return asset

@api.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, user: dict = Depends(get_current_user)):
    r = await db.assets.delete_one({"id": asset_id, "user_id": user["id"]})
    if r.deleted_count == 0: raise HTTPException(status_code=404, detail="Asset not found")
    return {"ok": True}

@api.patch("/assets/{asset_id}/slicer")
async def update_slicer(asset_id: str, body: UpdateSlicerReq, user: dict = Depends(get_current_user)):
    asset = await db.assets.find_one({"id": asset_id, "user_id": user["id"]}, {"_id": 0})
    if not asset or asset.get("type") != "model":
        raise HTTPException(status_code=404, detail="Model not found")
    settings_dict = body.settings.model_dump()
    estimate = _estimate_print(asset.get("stats", {}), body.settings)
    await db.assets.update_one({"id": asset_id, "user_id": user["id"]},
                               {"$set": {"slicer_settings": settings_dict, "estimate": estimate}})
    asset["slicer_settings"] = settings_dict; asset["estimate"] = estimate
    return asset

@api.get("/assets/{asset_id}/gcode-preview")
async def gcode_preview(asset_id: str, user: dict = Depends(get_current_user)):
    asset = await db.assets.find_one({"id": asset_id, "user_id": user["id"]}, {"_id": 0})
    if not asset or asset.get("type") != "model":
        raise HTTPException(status_code=404, detail="Model not found")
    s = SlicerSettings(**(asset.get("slicer_settings") or {}))
    stats = asset.get("stats", {})
    est = asset.get("estimate") or _estimate_print(stats, s)
    dims = stats.get("dimensions_mm", {"x":0,"y":0,"z":0})
    gcode = f"""; AiForge Slicer preview
; Object: {asset.get('name','model')}
; Dimensions: X{dims.get('x',0)}mm Y{dims.get('y',0)}mm Z{dims.get('z',0)}mm
; Layer height: {s.layer_height}mm | Infill: {s.infill_percent}% | Supports: {s.supports}
; Estimated time: {est.get('estimated_time_min',0)} min | Filament: {est.get('filament_length_m',0)}m
M104 S{s.nozzle_temp} ; set hotend
M140 S{s.bed_temp} ; set bed
G28 ; home all axes
G1 Z15.0 F9000
M109 S{s.nozzle_temp} ; wait hotend
M190 S{s.bed_temp} ; wait bed
G92 E0
; ---- Layer 1 ----
G1 F{s.print_speed * 60} X10 Y10 E0.2
G1 X{dims.get('x',20)+10} Y10 E1.2
G1 X{dims.get('x',20)+10} Y{dims.get('y',20)+10} E2.4
G1 X10 Y{dims.get('y',20)+10} E3.6
G1 X10 Y10 E4.8
; ... {est.get('layers',1)} layers total ...
M104 S0 ; hotend off
M140 S0 ; bed off
M84 ; disable motors
"""
    return {"gcode": gcode, "estimate": est, "settings": s.model_dump()}

@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    counts = {"image": 0, "video": 0, "model": 0}
    async for row in db.assets.aggregate([
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}}]):
        counts[row["_id"]] = row["count"]
    recent = []
    async for a in db.assets.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(6):
        recent.append({"id": a["id"], "type": a["type"], "prompt": a.get("prompt",""),
                       "created_at": a.get("created_at"), "name": a.get("name"),
                       "thumb_b64": (a.get("image_b64") if a["type"]=="image" else None)})
    return {"counts": counts, "recent": recent, "credits": user.get("credits", 0)}

@api.get("/")
async def root():
    return {"service": "AiForge", "ok": True}

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.assets.create_index([("user_id", 1), ("created_at", -1)])
    await db.jobs.create_index([("user_id", 1), ("created_at", -1)])
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if not existing:
        await db.users.insert_one({"id": str(uuid.uuid4()), "email": ADMIN_EMAIL.lower(),
            "name": "Admin", "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin", "credits": 9999,
            "created_at": datetime.now(timezone.utc).isoformat()})
        log.info("Seeded admin %s", ADMIN_EMAIL)
    else:
        # ensure admin has credits + correct password
        await db.users.update_one({"email": ADMIN_EMAIL.lower()},
                                  {"$set": {"credits": max(existing.get("credits", 0), 9999),
                                            "password_hash": hash_password(ADMIN_PASSWORD)}})

@app.on_event("shutdown")
async def shutdown(): client.close()

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])
