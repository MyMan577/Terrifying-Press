# AI upscaler sources

`tools/build_sr_models.py` turns these into `www/pp-sr-models.js` (run it after changing anything here).

| File | What | Licence |
|---|---|---|
| `aimet-weights.json` | QuickSRNet small/medium, XLSR, SESR-M5 (2x, float32) from the Qualcomm AIMET Model Zoo release checkpoints (`*_2x_checkpoint_float32.pth.tar`), read without unpickling their code; SESR's linear blocks collapsed to plain convolutions. | BSD-3-Clause (repo licence) |
| `anime4k/*.glsl` | Anime4K v3.2 Upscale CNN x2 S and M, as published for mpv. | MIT (`anime4k/LICENSE`) |

The app shows the notices from `www/CREDITS.txt` under Settings > Credits (at the bottom).
The shader versions were checked against a NumPy reference of each model: within 1/255 per pixel.
