"""Fast standalone shot renderer reading already-built Haikaze-Hero.blend (one shot per invocation -> zero RAM buildup)."""
import sys
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "art" / "town" / "haikaze-hero"))
import build_haikaze_hero as BH

SHOTS = {
    "01": ("01-diorama-hero-34.png",       "day",   (14.8, -16.5, 7.6), (0.6, 0.0, 3.75), 38, 5.0, 28),
    "02": ("02-shopfront-closeup.png",     "day",   (-0.5, -10.8, 2.05), (-0.7, -3.5, 1.60), 38, 5.6, 28),
    "03": ("03-corridor-doors-hook.png",   "day",   (7.4,  -4.6, 5.10), (2.4, 0.25, 4.45), 48, 5.6, 24),
    "04": ("04-stairs-rooftop-detail.png", "day",   (12.2,  9.2, 10.6), (0.6, 0.4, 4.80), 38, 5.6, 24),
    "05": ("05-diorama-night.png",         "night", (14.8, -16.5, 7.6), (0.6, 0.0, 3.75), 38, 5.0, 28),
    "06": ("06-stairs-flush-closeup.png",  "day",   (9.6,  -8.4, 2.95), (4.6, -0.3, 1.85), 45, 5.6, 24),
}

def optimize_cycles_for_preview():
    """Keep Cycles OIDN preview renders super fast (~15-25s/shot) without losing visual quality."""
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "AMBIENT_OCCLUSION":
                node.samples = 2

def main():
    argv = sys.argv
    keys = argv[argv.index("--") + 1:] if "--" in argv else ["03", "04", "05"]
    bpy.ops.wm.open_mainfile(filepath=str(BH.OUT_DIR / "Haikaze-Hero.blend"))
    optimize_cycles_for_preview()
    M = {"dark_iron": bpy.data.materials.get("Arch_Dark_Iron")}
    stage = BH.build_diorama_stage(M)
    optimize_cycles_for_preview()
    for k in keys:
        fname, mode, cpos, tgt, lens, fstop, smp = SHOTS[k]
        BH.setup_world_lighting(stage, mode=mode)
        BH.boost_night_emissives(mode == "night")
        BH.render_shot(stage, fname, cpos, tgt, lens=lens, dof_fstop=fstop, samples=smp)

if __name__ == "__main__":
    main()
