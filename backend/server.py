from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import base64
import uuid
import logging
import asyncio
import struct
import math
import re
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

import bcrypt
import jwt
import numpy as np
from stl import mesh as stl_mesh
import trimesh

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration

# ----- Config -----
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@forgeai.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Admin@123')
JWT_ALGORITHM = "HS256"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="ForgeAI")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log = logging.getLogger("forgeai")

# ----- Auth helpers -----
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
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
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ----- Pydantic Models -----
class RegisterReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class AuthResp(BaseModel):
    access_token: str
    user: dict

class ImageGenReq(BaseModel):
    prompt: str = Field(min_length=3)

class VideoGenReq(BaseModel):
    prompt: str = Field(min_length=3)
    duration: Literal[4, 8, 12] = 4
    size: Literal["1280x720", "1792x1024", "1024x1792", "1024x1024"] = "1280x720"

class ModelGenReq(BaseModel):
    prompt: str = Field(min_length=3)

class SlicerSettings(BaseModel):
    layer_height: float = 0.2
    infill_percent: int = 20
    supports: bool = False
    print_speed: int = 60
    nozzle_temp: int = 210
    bed_temp: int = 60

class UpdateSlicerReq(BaseModel):
    settings: SlicerSettings

# ----- Auth endpoints -----
@api.post("/auth/register", response_model=AuthResp)
async def register(body: RegisterReq):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    user_public = {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}
    return {"access_token": token, "user": user_public}

@api.post("/auth/login", response_model=AuthResp)
async def login(body: LoginReq):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    user_public = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    return {"access_token": token, "user": user_public}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}

# ----- Asset helpers -----
async def _save_asset(user_id: str, asset_type: str, prompt: str, data: dict) -> dict:
    asset = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": asset_type,  # image | video | model
        "prompt": prompt,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **data,
    }
    await db.assets.insert_one(asset.copy())
    asset.pop("_id", None)
    return asset

# ----- Image Generation -----
@api.post("/generate/image")
async def generate_image(body: ImageGenReq, user: dict = Depends(get_current_user)):
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"img-{uuid.uuid4()}",
            system_message="You are an expert AI image generator. Create vivid, detailed imagery.",
        )
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        msg = UserMessage(text=body.prompt)
        text, images = await chat.send_message_multimodal_response(msg)
        if not images:
            raise HTTPException(status_code=502, detail="No image returned from generator")
        img = images[0]
        b64 = img["data"]
        mime = img.get("mime_type", "image/png")
        asset = await _save_asset(user["id"], "image", body.prompt, {
            "mime_type": mime,
            "image_b64": b64,
            "caption": text or "",
        })
        return asset
    except HTTPException:
        raise
    except Exception as e:
        log.exception("image gen failed")
        raise HTTPException(status_code=500, detail=f"Image generation failed: {e}")

# ----- Video Generation (Sora 2) -----
def _sora_generate_sync(prompt: str, size: str, duration: int) -> bytes:
    gen = OpenAIVideoGeneration(api_key=EMERGENT_LLM_KEY)
    return gen.text_to_video(
        prompt=prompt, model="sora-2", size=size, duration=duration, max_wait_time=900,
    )

@api.post("/generate/video")
async def generate_video(body: VideoGenReq, user: dict = Depends(get_current_user)):
    try:
        video_bytes = await asyncio.to_thread(_sora_generate_sync, body.prompt, body.size, body.duration)
        if not video_bytes:
            raise HTTPException(status_code=502, detail="Video generation returned empty")
        b64 = base64.b64encode(video_bytes).decode()
        asset = await _save_asset(user["id"], "video", body.prompt, {
            "mime_type": "video/mp4",
            "video_b64": b64,
            "duration": body.duration,
            "size": body.size,
        })
        return asset
    except HTTPException:
        raise
    except Exception as e:
        log.exception("video gen failed")
        raise HTTPException(status_code=500, detail=f"Video generation failed: {e}")

# ----- 3D Model Generation (SCAD -> STL) -----
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
    """Build a binary STL from a list of primitive descriptors using trimesh."""
    meshes = []
    for p in primitives:
        shape = p.get("shape", "cube")
        try:
            if shape == "cube":
                size = p.get("size", [20, 20, 20])
                if isinstance(size, (int, float)):
                    size = [float(size)] * 3
                m = trimesh.creation.box(extents=[max(0.1, float(s)) for s in size[:3]])
            elif shape == "sphere":
                r = p.get("size", 10)
                if isinstance(r, list):
                    r = r[0]
                m = trimesh.creation.icosphere(radius=max(0.1, float(r)), subdivisions=2)
            elif shape == "cylinder":
                s = p.get("size", [10, 20])
                if isinstance(s, (int, float)):
                    s = [float(s), float(s) * 2]
                m = trimesh.creation.cylinder(radius=max(0.1, float(s[0])), height=max(0.1, float(s[1])), sections=32)
            else:
                continue
            tr = p.get("translate", [0, 0, 0])
            rot = p.get("rotate", [0, 0, 0])
            if any(rot):
                rx = trimesh.transformations.rotation_matrix(math.radians(rot[0]), [1, 0, 0])
                ry = trimesh.transformations.rotation_matrix(math.radians(rot[1]), [0, 1, 0])
                rz = trimesh.transformations.rotation_matrix(math.radians(rot[2]), [0, 0, 1])
                m.apply_transform(rx)
                m.apply_transform(ry)
                m.apply_transform(rz)
            m.apply_translation([float(tr[0]), float(tr[1]), float(tr[2])])
            meshes.append(m)
        except Exception:
            continue
    if not meshes:
        meshes = [trimesh.creation.box(extents=[20, 20, 20])]
    combined = trimesh.util.concatenate(meshes)
    buf = io.BytesIO()
    combined.export(buf, file_type="stl")
    return buf.getvalue()

def _mesh_stats(stl_bytes: bytes) -> dict:
    try:
        m = trimesh.load(io.BytesIO(stl_bytes), file_type="stl")
        bounds = m.bounds.tolist() if m.bounds is not None else [[0, 0, 0], [0, 0, 0]]
        extents = m.extents.tolist() if m.extents is not None else [0, 0, 0]
        return {
            "triangle_count": int(len(m.faces)),
            "vertex_count": int(len(m.vertices)),
            "bounds": bounds,
            "dimensions_mm": {"x": round(extents[0], 2), "y": round(extents[1], 2), "z": round(extents[2], 2)},
            "volume_mm3": round(float(m.volume), 2) if m.is_volume else 0.0,
        }
    except Exception:
        return {"triangle_count": 0, "vertex_count": 0, "dimensions_mm": {"x": 0, "y": 0, "z": 0}, "volume_mm3": 0}

def _estimate_print(stats: dict, settings: SlicerSettings) -> dict:
    """Very rough print-time / filament estimate."""
    z = stats.get("dimensions_mm", {}).get("z", 0) or 0
    vol = stats.get("volume_mm3", 0) or 0
    layers = max(1, int(z / max(0.05, settings.layer_height)))
    # rough: filament volume ~ infill * model volume
    filament_vol = vol * (settings.infill_percent / 100.0) * 0.6 + vol * 0.4  # shell + infill
    filament_length_mm = filament_vol / (math.pi * (1.75 / 2) ** 2) if filament_vol > 0 else 0
    # rough: time = perimeter per layer / speed (very rough)
    time_min = (layers * 0.25) * (100 / max(20, settings.print_speed))
    return {
        "layers": layers,
        "estimated_time_min": round(time_min, 1),
        "filament_length_m": round(filament_length_mm / 1000, 2),
        "filament_grams": round(filament_vol * 0.00124, 2),  # PLA density ~1.24g/cm3
    }

@api.post("/generate/model")
async def generate_model(body: ModelGenReq, user: dict = Depends(get_current_user)):
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"scad-{uuid.uuid4()}",
            system_message=SCAD_SYSTEM,
        )
        chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        msg = UserMessage(text=f"Design a 3D-printable object: {body.prompt}")
        response = await chat.send_message(msg)
        response_text = response if isinstance(response, str) else str(response)

        scad_code = _extract_block(response_text, "scad") or response_text
        json_block = _extract_block(response_text, "json")
        primitives = []
        name = body.prompt[:40]
        if json_block:
            try:
                import json as _json
                parsed = _json.loads(json_block)
                primitives = parsed.get("primitives", [])
                name = parsed.get("name", name)
            except Exception:
                pass

        stl_bytes = await asyncio.to_thread(_build_stl_from_primitives, primitives or [{"shape": "cube", "size": [30, 30, 30]}])
        stats = _mesh_stats(stl_bytes)
        default_settings = SlicerSettings().model_dump()
        estimate = _estimate_print(stats, SlicerSettings(**default_settings))

        asset = await _save_asset(user["id"], "model", body.prompt, {
            "name": name,
            "scad_code": scad_code,
            "stl_b64": base64.b64encode(stl_bytes).decode(),
            "primitives": primitives,
            "stats": stats,
            "slicer_settings": default_settings,
            "estimate": estimate,
        })
        return asset
    except HTTPException:
        raise
    except Exception as e:
        log.exception("model gen failed")
        raise HTTPException(status_code=500, detail=f"Model generation failed: {e}")

# ----- Library & asset CRUD -----
@api.get("/assets")
async def list_assets(
    asset_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query = {"user_id": user["id"]}
    if asset_type in ("image", "video", "model"):
        query["type"] = asset_type
    cursor = db.assets.find(query, {"_id": 0}).sort("created_at", -1).limit(200)
    items = await cursor.to_list(length=200)
    # Strip heavy fields from list view
    light = []
    for a in items:
        light.append({
            "id": a["id"],
            "type": a["type"],
            "prompt": a.get("prompt", ""),
            "created_at": a.get("created_at"),
            "name": a.get("name"),
            "thumb_b64": (a.get("image_b64") if a["type"] == "image" else None),
            "duration": a.get("duration"),
            "size": a.get("size"),
            "stats": a.get("stats"),
        })
    return light

@api.get("/assets/{asset_id}")
async def get_asset(asset_id: str, user: dict = Depends(get_current_user)):
    asset = await db.assets.find_one({"id": asset_id, "user_id": user["id"]}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset

@api.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, user: dict = Depends(get_current_user)):
    r = await db.assets.delete_one({"id": asset_id, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"ok": True}

@api.patch("/assets/{asset_id}/slicer")
async def update_slicer(asset_id: str, body: UpdateSlicerReq, user: dict = Depends(get_current_user)):
    asset = await db.assets.find_one({"id": asset_id, "user_id": user["id"]}, {"_id": 0})
    if not asset or asset.get("type") != "model":
        raise HTTPException(status_code=404, detail="Model not found")
    settings_dict = body.settings.model_dump()
    estimate = _estimate_print(asset.get("stats", {}), body.settings)
    await db.assets.update_one(
        {"id": asset_id, "user_id": user["id"]},
        {"$set": {"slicer_settings": settings_dict, "estimate": estimate}},
    )
    asset["slicer_settings"] = settings_dict
    asset["estimate"] = estimate
    return asset

@api.get("/assets/{asset_id}/gcode-preview")
async def gcode_preview(asset_id: str, user: dict = Depends(get_current_user)):
    asset = await db.assets.find_one({"id": asset_id, "user_id": user["id"]}, {"_id": 0})
    if not asset or asset.get("type") != "model":
        raise HTTPException(status_code=404, detail="Model not found")
    s = SlicerSettings(**(asset.get("slicer_settings") or {}))
    stats = asset.get("stats", {})
    est = asset.get("estimate") or _estimate_print(stats, s)
    dims = stats.get("dimensions_mm", {"x": 0, "y": 0, "z": 0})
    gcode = f"""; ForgeAI Slicer preview
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

# ----- Dashboard summary -----
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
    ]
    counts = {"image": 0, "video": 0, "model": 0}
    async for row in db.assets.aggregate(pipeline):
        counts[row["_id"]] = row["count"]
    recent_cursor = db.assets.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(6)
    recent = []
    async for a in recent_cursor:
        recent.append({
            "id": a["id"],
            "type": a["type"],
            "prompt": a.get("prompt", ""),
            "created_at": a.get("created_at"),
            "name": a.get("name"),
            "thumb_b64": (a.get("image_b64") if a["type"] == "image" else None),
        })
    return {"counts": counts, "recent": recent}

# ----- Health -----
@api.get("/")
async def root():
    return {"service": "ForgeAI", "ok": True}

# ----- Startup -----
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.assets.create_index([("user_id", 1), ("created_at", -1)])
    # Seed admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL.lower(),
            "name": "Admin",
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        log.info("Seeded admin user %s", ADMIN_EMAIL)

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
