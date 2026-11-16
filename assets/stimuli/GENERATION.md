# Image generation record

All AI images were made with the built-in image-generation tool. Each call supplied one reference image and requested a photorealistic study stimulus. The typewriter set used `product-mockup` generation; the earlier controlled edits used `precise-object-edit`. No image was produced by SVG or code. The file pages and licenses for the real source photographs are linked in each set's README.

## Woodstock typewriter (default exploratory study)

All twelve calls referenced `typewriter/original-front.jpg` as the only real view. The shared prompt requested the same worn black 1940s Woodstock machine, round cream-ringed QWERTY keys, wide black space bar, platen, ruler, left carriage lever, metal side knobs, and worn housing. It instructed the model to move the camera around the object, preserve visible details, and infer hidden surfaces naturally, without deliberate errors. All outputs were framed as whole-object photographs against a neutral warm background, without the source photo's ink bottle, package, or mat. Each call specified a different viewpoint: front-left 25°, front-right 25°, front-left 50°, front-right 50°, high front, left profile, right profile, high rear-left, high rear-right, straight rear, overhead, and low front-right. The overhead view was regenerated with a stricter vertical-camera prompt. See `typewriter/README.md` for the file-to-angle map and interpretation limits.

## DSLR rear controls (controlled study)

The first control and the star-symbol edit referenced `dslr/original-back.jpg`. The remaining six images referenced `dslr/ai-control-front.png`. Every prompt required the same rear camera layout, buttons, dials, grip texture, Canon mark, LCD characters, and white background except for the specified change:

| Output | Prompt instruction that changed the reference |
| --- | --- |
| `ai-control-front.png` | Near-identical photo with only a very slight soft-light change. |
| `ai-control-soft-light.png` | Near-identical second exposure with slightly softer light. |
| `ai-control-cool-light.png` | Near-identical exposure with slightly cooler white light. |
| `ai-error-no-star.png` | Remove only the small white star beside the upper-right rear dial. |
| `ai-error-iso-1600.png` | Change only the LCD value `ISO 3200` to `ISO 1600`. |
| `ai-error-f8.png` | Change only the LCD value `F11` to `F8`. |
| `ai-error-no-afon.png` | Remove only the `AF-ON` label, leaving its button intact. |
| `ai-error-no-play.png` | Remove only the playback triangle above the bottom-left button. |

## Blue sneakers (controlled study)

The reference for `ai-control-front.png` and `ai-error-no-tag.png` was `blue-shoes/original.jpg`. The reference for the remaining five sneaker images was the generated `ai-control-front.png`. Every prompt described the same pair of navy canvas sneakers, one diagonally on the other, on a pale neutral background. It specified navy laces, silver eyelets, a small white heel tag, curved stitched side panel, and finely ribbed white soles as invariants, except for the requested edit:

| Output | Prompt instruction that changed the reference |
| --- | --- |
| `ai-control-front.png` | Very slightly shift camera angle; preserve all product features. |
| `ai-control-soft-light.png` | Make a near-identical second frame with only a small shift in soft light. |
| `ai-control-cool-light.png` | Make a near-identical frame with slightly cooler light and subtle camera movement. |
| `ai-error-no-tag.png` | Remove only the tiny white woven tag near the heel opening of the upper shoe. |
| `ai-error-black-eyelet.png` | Make only the uppermost visible silver eyelet on the upper shoe black. |
| `ai-error-no-side-seam.png` | Remove only the curved stitched seam on the outer side of the upper shoe, above the sole. |
| `ai-error-smooth-sole.png` | Make only the upper shoe's white sole edge smooth; leave the lower shoe's sole ribbed. |

## Blue bottle (practice set)

Each bottle prompt used `original-blue-bottle.jpg` as the reference. The invariant features were a cyan hinged flip lid, cyan-to-deep-blue gradient body, and one cyan right-side handle. Controls changed only angle or light. Error prompts requested one change each: solid orange body, no handle, navy lid, flat round screw cap instead of the hinge, or yellow handle. All prompts specified a photorealistic bottle with no added text or objects.

The generated images were inspected visually, but this record is a prompt log, not proof that each render obeyed every invariant. Complete the blinded pilot described in the set READMEs before using the answer keys for formal analysis.
