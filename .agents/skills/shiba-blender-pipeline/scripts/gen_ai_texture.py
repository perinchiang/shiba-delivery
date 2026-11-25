#!/usr/bin/env /usr/local/bin/python3
"""
Reusable AI Hand-Painted 2D PBR Texture Generator for Shiba Delivery.
Reads credentials safely from repo-root `.env.local` (gitignored) or environment vars:
  SHIBA_IMAGE_API_BASE  (default: https://jp.nikoapi.xyz/v1)
  SHIBA_IMAGE_API_MODEL (default: gpt-image-2.6-sunburst)
  SHIBA_IMAGE_API_KEY   (required)

Examples:
  # Single texture with built-in style preset + derived tangent-space normal map:
  /usr/local/bin/python3 .agents/skills/shiba-blender-pipeline/scripts/gen_ai_texture.py \
    --preset surface --size 1024x1024 --normal \
    --out art/shared/textures/ai_brick_wall.png \
    --prompt "warm cream coastal retaining stone blocks (#DCD4C2)"

  # Batch mode from JSON file: [{"out": "art/shared/textures/ai_x.png", "size": "1024x1024", "preset": "poster", "prompt": "...", "normal": false}]
  /usr/local/bin/python3 .agents/skills/shiba-blender-pipeline/scripts/gen_ai_texture.py --batch specs.json
"""
import argparse
import base64
import io
import json
import os
import subprocess
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

REPO_ROOT = Path(__file__).resolve().parents[4]

PRESETS = {
    "none": ("", ""),
    "surface": (
        "Seamless tileable strictly flat top-down orthographic 2D game surface texture filling 100% of the square canvas. "
        "Cozy Animal Crossing and Studio Ghibli miniature diorama hand-painted gouache style. ",
        " Completely even diffuse flat lighting, ZERO directional cast shadows, ZERO dirt or grunge, ZERO text or letters. Seamless tileable edges."
    ),
    "poster": (
        "Strictly flat straight-on orthographic 2D vintage Japanese coastal illustration filling 100% of the canvas edge-to-edge "
        "with ZERO perspective, ZERO wall background, ZERO text, ZERO letters, ZERO kanji. "
        "Cozy Studio Ghibli and Animal Crossing hand-painted gouache aesthetic. ",
        " Leave clean breathing space for typography overlay with STRICTLY ZERO text, numbers, or lettering."
    ),
    "chalkboard": (
        "Strictly flat straight-on orthographic 2D retro Japanese cafe chalkboard art filling 100% of the canvas edge-to-edge "
        "with ZERO wooden frame, ZERO perspective, ZERO text, ZERO letters, ZERO numbers. "
        "Warm pastel chalk hand-drawn illustration on dusty dark forest-slate chalkboard (#242E2B) in cozy Studio Ghibli style. ",
        " Leave clean dark chalk slate area at the bottom 30% with STRICTLY ZERO text or prices."
    ),
    "fabric": (
        "Strictly flat straight-on orthographic 2D stylized Japanese woven textile texture filling 100% of the square canvas edge-to-edge "
        "with ZERO folds, ZERO perspective, ZERO cast shadows, ZERO text, ZERO letters. "
        "Cozy Studio Ghibli and Animal Crossing miniature diorama hand-dyed fabric feel. ",
        " Completely flat weave lighting with STRICTLY ZERO text or logos."
    ),
}


def load_env_local():
    env_file = REPO_ROOT / ".env.local"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def derive_normal_map(img_rgb, strength=2.6, blur_radius=0.9):
    gray = np.asarray(img_rgb.convert("L").filter(ImageFilter.GaussianBlur(blur_radius)), dtype=np.float32) / 255.0
    dx = (np.roll(gray, -1, axis=1) - np.roll(gray, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(gray, -1, axis=0) - np.roll(gray, 1, axis=0)) * 0.5 * strength
    nx, ny, nz = -dx, dy, np.ones_like(gray)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    rgb = np.stack([(nx / norm) * 0.5 + 0.5, (ny / norm) * 0.5 + 0.5, (nz / norm) * 0.5 + 0.5], axis=-1)
    return Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8), "RGB")


def generate_image(prompt, out_path, size="1024x1024", preset="surface", make_normal=False, force=False):
    out_path = Path(out_path)
    if not out_path.is_absolute():
        out_path = REPO_ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if out_path.exists() and out_path.stat().st_size > 10000 and not force:
        im = Image.open(out_path)
        print(f"  [SKIP] {out_path} already exists ({im.size}); pass --force to regenerate.")
        return out_path

    base_url = os.environ.get("SHIBA_IMAGE_API_BASE", "https://jp.nikoapi.xyz/v1").rstrip("/")
    model = os.environ.get("SHIBA_IMAGE_API_MODEL", "gpt-image-2.6-sunburst")
    api_key = os.environ.get("SHIBA_IMAGE_API_KEY") or os.environ.get("NIKO_API_KEY")
    if not api_key:
        raise RuntimeError("Missing SHIBA_IMAGE_API_KEY in .env.local or environment!")

    pre, suf = PRESETS.get(preset, PRESETS["none"])
    full_prompt = f"{pre}{prompt.strip()}{suf}".strip()
    payload = {
        "model": model,
        "prompt": full_prompt,
        "n": 1,
        "size": size,
        "response_format": "b64_json",
    }

    last_err = None
    for attempt in range(2):
        try:
            proc = subprocess.run(
                [
                    "curl", "-sS", "--max-time", "180",
                    "-w", "\n__HTTP_CODE__:%{http_code}",
                    "-X", "POST", f"{base_url}/images/generations",
                    "-H", f"Authorization: Bearer {api_key}",
                    "-H", "Content-Type: application/json",
                    "--data-binary", "@-",
                ],
                input=json.dumps(payload).encode("utf-8"),
                capture_output=True,
            )
            out = proc.stdout.decode("utf-8", "ignore")
            if "\n__HTTP_CODE__:" not in out:
                raise RuntimeError(f"curl error: {proc.stderr.decode('utf-8', 'ignore')[:200]}")
            body, code_s = out.rsplit("\n__HTTP_CODE__:", 1)
            code = int(code_s.strip())
            if code >= 400 or not body.strip():
                raise RuntimeError(f"HTTP {code}: {body[:240]}")
            res = json.loads(body)
            item = (res.get("data") or [{}])[0]
            if item.get("b64_json"):
                raw = base64.b64decode(item["b64_json"])
            elif item.get("url"):
                raw = subprocess.run(["curl", "-sSL", "--max-time", "60", item["url"]], capture_output=True, check=True).stdout
            else:
                raise RuntimeError(f"Unexpected response keys: {list(res.keys())}")
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            im.save(out_path)
            print(f"  [SAVED] {out_path} ({im.size}, model={model})")
            if make_normal:
                n_path = out_path.with_name(out_path.stem.replace("ai_", "tex_") + "_normal.png")
                derive_normal_map(im).save(n_path)
                print(f"  [NORMAL] {n_path}")
            return out_path
        except Exception as e:
            last_err = e
            if attempt == 0:
                print(f"  [RETRY] {out_path.name}: {e}", file=sys.stderr)
    raise RuntimeError(f"Failed generating {out_path.name}: {last_err}")


def main():
    load_env_local()
    ap = argparse.ArgumentParser(description="Generate stylized AI PBR textures for Shiba Delivery")
    ap.add_argument("--prompt", help="Core texture/illustration description")
    ap.add_argument("--out", help="Output PNG path")
    ap.add_argument("--size", default="1024x1024", help="Image size (e.g. 1024x1024, 1536x1024, 1024x1536)")
    ap.add_argument("--preset", default="surface", choices=list(PRESETS.keys()), help="Style guard preset")
    ap.add_argument("--normal", action="store_true", help="Also derive tangent-space _normal.png")
    ap.add_argument("--force", action="store_true", help="Overwrite existing image")
    ap.add_argument("--batch", help="Path to JSON batch specification array")
    ap.add_argument("--check", action="store_true", help="Verify local config without spending API quota")
    args = ap.parse_args()

    if args.check:
        base = os.environ.get("SHIBA_IMAGE_API_BASE", "https://jp.nikoapi.xyz/v1")
        model = os.environ.get("SHIBA_IMAGE_API_MODEL", "gpt-image-2.6-sunburst")
        has_key = bool(os.environ.get("SHIBA_IMAGE_API_KEY") or os.environ.get("NIKO_API_KEY"))
        print(f"Config check: base={base}, model={model}, key_configured={has_key}")
        sys.exit(0 if has_key else 1)

    if args.batch:
        specs = json.loads(Path(args.batch).read_text(encoding="utf-8"))
        for sp in specs:
            generate_image(
                prompt=sp["prompt"],
                out_path=sp["out"],
                size=sp.get("size", "1024x1024"),
                preset=sp.get("preset", "surface"),
                make_normal=bool(sp.get("normal", False)),
                force=args.force or bool(sp.get("force", False)),
            )
    else:
        if not args.prompt or not args.out:
            ap.error("Provide --prompt and --out, or --batch <file.json>, or --check")
        generate_image(args.prompt, args.out, args.size, args.preset, args.normal, args.force)


if __name__ == "__main__":
    main()
