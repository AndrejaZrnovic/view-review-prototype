# Blue bottle stimulus set

The source is [“Blue Water Bottle” by Byoung82](https://commons.wikimedia.org/wiki/File:Blue_Water_Bottle.jpg), downloaded from Wikimedia Commons on 2026-11-03. The source page identifies the photo as the creator's own work under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). `original-blue-bottle.jpg` is the unmodified source. The eight PNGs were made with the built-in image generation tool as image-guided edits of that source. The prompts asked for photorealistic variants that preserve the product, except for one specified error in each error image.

| File | Ground truth | Intended feature |
| --- | --- | --- |
| `ai-control-front.png` | No discrepancy | Cyan flip lid, blue gradient body, cyan right handle |
| `ai-control-angle.png` | No discrepancy | Same features, angle/setting variation |
| `ai-control-light.png` | No discrepancy | Same features, light variation |
| `ai-error-orange-body.png` | Discrepancy | Orange body replaces blue gradient |
| `ai-error-no-handle.png` | Discrepancy | Right handle removed |
| `ai-error-navy-lid.png` | Discrepancy | Navy lid replaces cyan lid |
| `ai-error-screw-cap.png` | Discrepancy | Screw cap replaces hinged flip lid |
| `ai-error-yellow-handle.png` | Discrepancy | Yellow handle replaces cyan handle |

The answer key also lives in the `VIEWS` configuration in `index.html`. Participants see only the image and product sheet until debrief. Before collecting study data, pilot the images with independent reviewers: check that controls have no unintended product changes, each error is recognizable at the review-card size, and the different backgrounds/crops do not become answer cues. The source photo's bottom edge is cropped, so do not score bottom-shape judgments.

This directory contains stimulus images and answer keys, **not participant observations**. Participant responses are created only when someone completes a session; they are saved in that browser's `localStorage` and can be copied from the researcher results view.
