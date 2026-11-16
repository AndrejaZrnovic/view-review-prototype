# DSLR rear-control stimulus set

The original is [“Canon EOS 50D back.jpg” by Thomas Wolf](https://commons.wikimedia.org/wiki/File:Canon_EOS_50D_back.jpg). Its Wikimedia Commons file page marks the photographer's work [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). `original-back.jpg` is the unmodified downloaded image. The eight PNGs were generated with the built-in image-generation tool as image-guided edits. The control images requested only lighting differences; each error prompt requested exactly one altered label, symbol, or displayed value.

| File | Answer key | Intended change |
| --- | --- | --- |
| `ai-control-front.png` | No discrepancy | Near-identical rear view |
| `ai-control-soft-light.png` | No discrepancy | Slightly softer light |
| `ai-control-cool-light.png` | No discrepancy | Slightly cooler light |
| `ai-error-no-star.png` | Discrepancy | Star symbol beside the upper-right dial removed |
| `ai-error-iso-1600.png` | Discrepancy | LCD ISO 3200 changed to ISO 1600 |
| `ai-error-f8.png` | Discrepancy | LCD F11 changed to F8 |
| `ai-error-no-afon.png` | Discrepancy | AF-ON label removed while its button remains |
| `ai-error-no-play.png` | Discrepancy | Playback triangle above lower-left button removed |

`index.html` uses this as the default set and stores the answer key in `DSLR.views`. The review images can be enlarged so participants can inspect small text and controls. Exported view data includes participant flags, notes, and answer keys.

**Pilot before formal use.** AI generation can also change fine glyphs, LCD icons, or texture unintentionally. Have independent reviewers compare every generated image with `original-back.jpg`, identify unintended changes, and confirm the intended edits are visible at the available zoom level. The answer key records intended edits and must be validated before analysis. No participant observations are included in this directory.
