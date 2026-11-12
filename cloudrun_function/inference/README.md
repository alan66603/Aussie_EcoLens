# Aussie EcoLens — GCP Cloud Run Inference Service

Flask service that runs a two-stage ML pipeline on wildlife camera-trap images and videos:

1. **MegaDetector v5a** — detects animals in the full image, returns bounding boxes
2. **SpeciesNet (fine-tuned)** — classifies each 600×600 crop into one of 46 Australian species

---

## API

### POST /predict

```
POST /predict
Content-Type: application/json
Authorization: Bearer <Google ID token>   # validated by Cloud Run, not by this service
```

Request body:
```json
{
  "file_url": "https://s3.amazonaws.com/...?X-Amz-Signature=...",
  "file_type": "image"
}
```

`file_type` is `"image"` or `"video"`. The service downloads the file from the presigned URL directly.

Response `200`:
```json
{
  "tags": {"common wombat": 2, "eastern grey kangaroo": 1},
  "file_type": "image",
  "model_versions": {"detector": "v1", "classifier": "v3"},
  "frames_processed": 1,
  "processing_time_ms": 4200
}
```

Response `400` / `500` — JSON body with an `"error"` key.

### GET /healthz

Returns `{"status": "ok"}` with HTTP 200. Used by Cloud Run health checks.

---

## Local build and test

### 1. Build the image

Run from the **repo root**:

```bash
docker build -t inference-local ./cloudrun_function/inference
```

Build time: ~10–20 minutes on first run (downloads ~800 MB CPU PyTorch + megadetector).
Subsequent builds are fast thanks to layer caching.

### 2. Run with local model files (no GCS needed)

Mount the `AussieEcoLense/` directory as `/models` and set `LOCAL_MODEL_DIR`:

```bash
docker run --rm -p 8080:8080 \
  -e LOCAL_MODEL_DIR=/models \
  -v /Users/chencongyao/Monash/FIT5225/FIT5225-assignment-2/AussieEcoLense:/models \
  inference-local
```

The service expects `mdv5a.pt` and `model.pt` inside `LOCAL_MODEL_DIR`.

**Cold start note:** Loading two PyTorch models on CPU takes 15–30 seconds. The container
is ready when you see `* Running on http://0.0.0.0:8080` in the logs. Cloud Run cold
starts take 30–60 s on top of that (model download from GCS + load), so set the
minimum instances to 1 if latency matters.

### 3. Health check

```bash
curl http://localhost:8080/healthz
# {"status":"ok"}
```

### 4. Test with a real image

```bash
curl -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{
    "file_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Vombatus_ursinus_-Maria_Island_National_Park.jpg/320px-Vombatus_ursinus_-Maria_Island_National_Park.jpg",
    "file_type": "image"
  }'
```

Expected shape:
```json
{
  "tags": {"common wombat": 1},
  "file_type": "image",
  "model_versions": {"detector": "v1", "classifier": "v3"},
  "frames_processed": 1,
  "processing_time_ms": 8000
}
```

---

## Production deployment (for Teddy / Terraform)

The service reads three environment variables at startup:

| Variable | Example | Description |
|---|---|---|
| `MODEL_BUCKET` | `ecolen-models-prod` | GCS bucket that holds the `.pt` files |
| `DETECTOR_VERSION` | `v1` | Blob path: `models/detector/mdv5a-v1.pt` |
| `CLASSIFIER_VERSION` | `v3` | Blob path: `models/classifier/speciesnet-v3.pt` |

`LOCAL_MODEL_DIR` must **not** be set in production.

### Cloud Run configuration

- **Memory**: at least **4 GB** (two models in PyTorch + OpenCV frame buffers)
- **CPU**: 2 vCPU minimum recommended
- **Concurrency**: 4 (matches `--threads 4` in gunicorn)
- **Timeout**: 300 s (matches gunicorn `--timeout`)
- **Authentication**: `--no-allow-unauthenticated` — Google validates the Bearer token before the handler runs

### Model versioning

To deploy a new model version without rebuilding the Docker image:

1. Upload the new `.pt` file to GCS at the versioned path (e.g. `models/classifier/speciesnet-v4.pt`)
2. Update the `CLASSIFIER_VERSION` env var in Cloud Run to `v4`
3. Trigger a new revision — Cloud Run downloads and loads the new model on cold start

---

## Supported species (46)

australian brushturkey, agile antechinus, cattle, bush thick-knee, domestic dog,
pacific emerald dove, grey shrikethrush, white-winged chough, laughing kookaburra,
fallow deer, eastern yellow robin, domestic cat, bar-shouldered dove, australian magpie,
human, northern brown bandicoot, european hare, eastern grey kangaroo, superb lyrebird,
house mouse, european rabbit, long-nosed bandicoot, noisy pitta, rat, australian bush rat,
black rat, pied currawong, wild boar, echidna, red-legged pademelon, short-eared possum,
mountain brushtail possum, common brushtail possum, lace monitor, common wombat, red fox,
swamp wallaby, dingo, domestic goat, southern cassowary, grey-headed robin,
musky rat-kangaroo, orange-footed scrubfowl, red-necked wallaby, northern chowchilla,
giant white-tailed rat
