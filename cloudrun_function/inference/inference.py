"""
GCP Cloud Run inference service for Aussie EcoLens.

Two-stage pipeline:
  1. MegaDetector v5a  — detects animals in full image, returns bounding boxes
  2. SpeciesNet (fine-tuned) — classifies each 600x600 crop into one of 46 species

Models are downloaded from GCS at container startup.
Set LOCAL_MODEL_DIR to skip GCS and use local .pt files instead (dev/test).
"""

import logging
import os
import tempfile
import time
import warnings
from collections import defaultdict

import cv2
import numpy as np
import requests
import torch
import torchvision.transforms as transforms
from flask import Flask, jsonify, request
from PIL import Image

warnings.filterwarnings("ignore")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# ── Species metadata ──────────────────────────────────────────────────────────

# Ordered list matching the fine-tuned SpeciesNet output indices (from batch.py)
CLASSES: list[str] = [
    "Alectura_lathami", "Antechinus_agilis", "Bos_taurus", "Burhinus_grallarius",
    "Canis_familiaris", "Chalcophaps_longirostris", "Colluricincla_harmonica",
    "Corcorax_melanorhamphos", "Dacelo_novaeguineae", "Dama_dama",
    "Eopsaltria_australis", "Felis_catus", "Geopelia_humeralis", "Gymnorhina_tibicen",
    "Homo_sapiens", "Isoodon_macrourus", "Lepus_europaeus", "Macropus_giganteus",
    "Menura_novaehollandiae", "Mus_musculus", "Oryctolagus_cuniculus",
    "Perameles_nasuta", "Pitta_versicolor", "Rattus", "Rattus_fuscipes",
    "Rattus_rattus", "Strepera_graculina", "Sus_scrofa", "Tachyglossus_aculeatus",
    "Thylogale_stigmatica", "Trichosurus_caninus", "Trichosurus_cunninghami",
    "Trichosurus_vulpecula", "Varanus_varius", "Vombatus_ursinus", "Vulpes_vulpes",
    "Wallabia_bicolor", "Canis_dingo", "Capra_hircus", "Casuarius_casuarius",
    "Heteromyias_cinereifrons", "Hypsiprymnodon_moschatus", "Megapodius_reinwardt",
    "Notamacropus_rufogriseus", "Orthonyx_spaldingii", "Uromys_caudimaculatus",
]

COMMON_NAMES: dict[str, str] = {
    "Alectura_lathami": "australian brushturkey",
    "Antechinus_agilis": "agile antechinus",
    "Bos_taurus": "cattle",
    "Burhinus_grallarius": "bush thick-knee",
    "Canis_familiaris": "domestic dog",
    "Chalcophaps_longirostris": "pacific emerald dove",
    "Colluricincla_harmonica": "grey shrikethrush",
    "Corcorax_melanorhamphos": "white-winged chough",
    "Dacelo_novaeguineae": "laughing kookaburra",
    "Dama_dama": "fallow deer",
    "Eopsaltria_australis": "eastern yellow robin",
    "Felis_catus": "domestic cat",
    "Geopelia_humeralis": "bar-shouldered dove",
    "Gymnorhina_tibicen": "australian magpie",
    "Homo_sapiens": "human",
    "Isoodon_macrourus": "northern brown bandicoot",
    "Lepus_europaeus": "european hare",
    "Macropus_giganteus": "eastern grey kangaroo",
    "Menura_novaehollandiae": "superb lyrebird",
    "Mus_musculus": "house mouse",
    "Oryctolagus_cuniculus": "european rabbit",
    "Perameles_nasuta": "long-nosed bandicoot",
    "Pitta_versicolor": "noisy pitta",
    "Rattus": "rat",
    "Rattus_fuscipes": "australian bush rat",
    "Rattus_rattus": "black rat",
    "Strepera_graculina": "pied currawong",
    "Sus_scrofa": "wild boar",
    "Tachyglossus_aculeatus": "echidna",
    "Thylogale_stigmatica": "red-legged pademelon",
    "Trichosurus_caninus": "short-eared possum",
    "Trichosurus_cunninghami": "mountain brushtail possum",
    "Trichosurus_vulpecula": "common brushtail possum",
    "Varanus_varius": "lace monitor",
    "Vombatus_ursinus": "common wombat",
    "Vulpes_vulpes": "red fox",
    "Wallabia_bicolor": "swamp wallaby",
    "Canis_dingo": "dingo",
    "Capra_hircus": "domestic goat",
    "Casuarius_casuarius": "southern cassowary",
    "Heteromyias_cinereifrons": "grey-headed robin",
    "Hypsiprymnodon_moschatus": "musky rat-kangaroo",
    "Megapodius_reinwardt": "orange-footed scrubfowl",
    "Notamacropus_rufogriseus": "red-necked wallaby",
    "Orthonyx_spaldingii": "northern chowchilla",
    "Uromys_caudimaculatus": "giant white-tailed rat",
}

# ── Pipeline constants ────────────────────────────────────────────────────────

DETECTOR_CONF = 0.05     # MegaDetector: minimum bbox confidence (config.yaml LOWER_CONF)
CLASSIFIER_CONF = 0.50   # SpeciesNet: minimum class probability to emit a tag
SNIP_SIZE = 600          # Crop resize target in pixels (config.yaml SNIP_SIZE)
MAX_FRAMES = 30         # Video: hard cap at 300 frames (5 min @ 1 fps) to bound cost

# ── Model loading (runs once at container startup) ────────────────────────────

_local_dir: str | None = os.environ.get("LOCAL_MODEL_DIR")
_bucket: str = os.environ.get("MODEL_BUCKET", "")
_det_ver: str = os.environ.get("DETECTOR_VERSION", "v1")
_cls_ver: str = os.environ.get("CLASSIFIER_VERSION", "v1")


def _gcs_download(bucket_name: str, blob_path: str, dest: str) -> None:
    from google.cloud import storage  # lazy — not needed for local dev
    logger.info("Downloading gs://%s/%s -> %s", bucket_name, blob_path, dest)
    client = storage.Client()
    client.bucket(bucket_name).blob(blob_path).download_to_filename(dest)
    logger.info("Download complete: %s (%.1f MB)", dest, os.path.getsize(dest) / 1e6)


def _resolve_model(local_filename: str, gcs_blob: str, tmp_dest: str) -> str:
    """Return local filesystem path to the model file.

    LOCAL_MODEL_DIR set  -> look for local_filename inside that dir (dev/test)
    otherwise            -> download gcs_blob from MODEL_BUCKET to tmp_dest
    """
    if _local_dir:
        path = os.path.join(_local_dir, local_filename)
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"LOCAL_MODEL_DIR={_local_dir!r} is set but {path!r} was not found. "
                "Mount the AussieEcoLense directory."
            )
        logger.info("Local model: %s", path)
        return path
    _gcs_download(_bucket, gcs_blob, tmp_dest)
    return tmp_dest


logger.info("Resolving detector (version=%s)...", _det_ver)
_det_path = _resolve_model(
    local_filename="mdv5a.pt",
    gcs_blob=f"models/detector/mdv5a-{_det_ver}.pt",
    tmp_dest="/tmp/det.pt",
)

logger.info("Resolving classifier (version=%s)...", _cls_ver)
_cls_path = _resolve_model(
    local_filename="model.pt",
    gcs_blob=f"models/classifier/speciesnet-{_cls_ver}.pt",
    tmp_dest="/tmp/cls.pt",
)

# PTDetector owns the MegaDetector model object and is reused across all requests
from megadetector.detection.pytorch_detector import PTDetector  # noqa: E402

DETECTOR = PTDetector(_det_path)
logger.info("MegaDetector loaded")

# Full model object (not a state_dict), weights_only=False is required here
CLASSIFIER: torch.nn.Module = torch.load(
    _cls_path, map_location="cpu", weights_only=False
)
CLASSIFIER.eval()
logger.info("SpeciesNet classifier loaded")

_TRANSFORM = transforms.Compose([
    transforms.Resize((480, 480)),
    transforms.ToTensor(),
])

# ── Pipeline ──────────────────────────────────────────────────────────────────


def _detect(img_pil: Image.Image) -> list[dict]:
    """Run MegaDetector on a PIL image and return raw detection dicts."""
    img_np = np.array(img_pil.convert("RGB"))  # H x W x C uint8
    result = DETECTOR.generate_detections_one_image(img_np)
    return result.get("detections", [])


def _crop_detections(img_pil: Image.Image, detections: list[dict]) -> list[Image.Image]:
    """Crop each accepted animal bbox and resize to SNIP_SIZE x SNIP_SIZE."""
    W, H = img_pil.size
    img_rgb = img_pil.convert("RGB")
    crops: list[Image.Image] = []
    for det in detections:
        if det.get("category") != "1":  # category 1 = animal
            continue
        if det["conf"] < DETECTOR_CONF:
            continue
        x, y, w, h = det["bbox"]        # normalized [0,1], top-left origin
        left = int(x * W)
        top = int(y * H)
        right = int((x + w) * W)
        bottom = int((y + h) * H)
        crop = img_rgb.crop((left, top, right, bottom))
        crops.append(crop.resize((SNIP_SIZE, SNIP_SIZE), Image.BILINEAR))
    return crops


@torch.no_grad()
def _classify(crop_pil: Image.Image) -> tuple[str, float]:
    """Classify a single 600x600 crop; return (Genus_species, confidence)."""
    img = _TRANSFORM(crop_pil)         # C,H,W  float32
    img = img.unsqueeze(0)              # B,C,H,W
    img = img.permute(0, 2, 3, 1)      # B,H,W,C  — SpeciesNet expects channels-last
    logits = CLASSIFIER(img)
    probs = torch.softmax(logits, dim=1)[0].cpu().numpy()
    best_idx = int(np.argmax(probs))
    return CLASSES[best_idx], float(probs[best_idx])


def _process_frame(img_pil: Image.Image) -> dict[str, int]:
    """Full pipeline for one frame: detect -> crop -> classify -> count species."""
    detections = _detect(img_pil)
    counts: dict[str, int] = defaultdict(int)
    for crop in _crop_detections(img_pil, detections):
        species, conf = _classify(crop)
        if conf >= CLASSIFIER_CONF:
            label = COMMON_NAMES.get(species, species.replace("_", " ").lower())
            counts[label] += 1
    return dict(counts)


# ── Flask app ─────────────────────────────────────────────────────────────────

app = Flask(__name__)


@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok"}), 200

# /predict helper
def _download_to_tmp(file_url: str, suffix: str) -> str:
    """Download file_url to a temp file; return its path. Raises requests.RequestException on failure."""
    resp = requests.get(file_url, timeout=60, stream=True,
                        headers={"User-Agent": "AussieEcoLens/1.0"})
    resp.raise_for_status()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False, dir="/tmp") as fh:
        for chunk in resp.iter_content(chunk_size=65536):
            fh.write(chunk)
        return fh.name


def _run_image(tmp_path: str) -> dict[str, int]:
    """Run the full pipeline on a single image file; return species tag counts."""
    img = Image.open(tmp_path)
    return _process_frame(img)


def _run_video(tmp_path: str) -> tuple[dict[str, int], int]:
    """Run the full pipeline on a video file, 1 frame/sec up to MAX_FRAMES.
    Returns (tags, frames_processed)."""
    cap = cv2.VideoCapture(tmp_path)
    if not cap.isOpened():
        raise ValueError("Cannot open video file")

    raw_fps = cap.get(cv2.CAP_PROP_FPS)
    fps = raw_fps if raw_fps > 0 else 25.0
    frame_interval = max(1, int(fps))
    tags: dict[str, int] = defaultdict(int)
    frames_processed = 0
    next_pos = 0

    try:
        while frames_processed < MAX_FRAMES:
            cap.set(cv2.CAP_PROP_POS_FRAMES, next_pos)
            ret, frame = cap.read()
            if not ret:
                break
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            for species, count in _process_frame(Image.fromarray(frame_rgb)).items():
                tags[species] = max(tags[species], count)
            frames_processed += 1
            next_pos += frame_interval
    finally:
        cap.release()

    return dict(tags), frames_processed


@app.route("/predict", methods=["POST"])
def predict():
    t0 = time.time()

    body = request.get_json(force=True, silent=True) or {}
    file_url: str | None = body.get("file_url")
    file_type: str = body.get("file_type", "image")

    if not file_url:
        return jsonify({"error": "file_url is required"}), 400
    if file_type not in ("image", "video"):
        return jsonify({"error": "file_type must be 'image' or 'video'"}), 400

    logger.info("predict: file_type=%s url=%.80s", file_type, file_url)

    suffix = ".mp4" if file_type == "video" else ".jpg"
    try:
        tmp_path = _download_to_tmp(file_url, suffix)
    except requests.RequestException as exc:
        logger.warning("Download failed: %s", exc)
        return jsonify({"error": f"Failed to download file: {exc}"}), 400

    try:
        if file_type == "image":
            try:
                tags = _run_image(tmp_path)
            except Exception as exc:
                return jsonify({"error": f"Cannot read image: {exc}"}), 400
            frames_processed = 1
        else:
            try:
                tags, frames_processed = _run_video(tmp_path)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400
    finally:
        os.unlink(tmp_path)  # delete temp files

    elapsed_ms = int((time.time() - t0) * 1000)
    logger.info("predict done: frames=%d tags=%s elapsed_ms=%d",
                frames_processed, tags, elapsed_ms)

    return jsonify({
        "tags": tags,
        "file_type": file_type,
        "model_versions": {"detector": _det_ver, "classifier": _cls_ver},
        "frames_processed": frames_processed,
        "processing_time_ms": elapsed_ms,
    }), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
