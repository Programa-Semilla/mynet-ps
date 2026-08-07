import sharp from 'sharp'

import {
  AVATAR_ACCEPTED_FORMATS,
  AVATAR_OUTPUT_CONTENT_TYPE,
  AVATAR_OUTPUT_FORMAT,
  loadConfig,
} from '../config.js'

/**
 * T082 (004) — decode, resize, **re-encode** (FR-348, FR-349, research D8).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **METADATA STRIPPING IS A PROPERTY OF THE OPERATION, NOT A LIST OF TAGS TO MAINTAIN.**
 *
 * FR-349 requires that what is stored and served carries no location, camera or timestamp
 * information from the original. The obvious implementation — enumerate the tags to remove —
 * **fails open**: a format nobody anticipated, a tag added to a future EXIF revision, an XMP
 * packet, a maker note, or an ICC profile carrying a serial number all survive a list that does
 * not name them, and nothing about the result looks wrong.
 *
 * A full decode-and-re-encode produces a new image **from pixels alone**. There is no path by
 * which anything from the original container reaches the output, because the container is never
 * copied — so the guarantee holds for tags nobody has thought of.
 *
 * This is why the work is on the server and not in the browser. Principle VIII: client-side
 * presentation is never enforcement, and a direct API call could upload anything regardless of
 * what the page did first.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Ceiling on the **decoded** pixel count, independent of the compressed byte limit (see
 * `processAvatar`). Not configurable: unlike `maxUploadBytes`, which is a product decision about
 * what a person may send, this is a bound on what the process will allocate — and an operator
 * raising it has no way to know they are trading it against the API's memory.
 */
export const AVATAR_MAX_INPUT_PIXELS = 50_000_000

/** Thrown when the bytes are not a decodable image of an accepted type. The route maps it to 415. */
export class UnreadableImageError extends Error {
  constructor(reason: string) {
    super(`Not a decodable image: ${reason}`)
    this.name = 'UnreadableImageError'
  }
}

export interface ProcessedAvatar {
  readonly bytes: Buffer
  readonly contentType: string
}

/**
 * Turns uploaded bytes into the single stored representation of an avatar.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The type is decided by inspecting the bytes**, never by the declared `content-type` header
 * and never by a filename — both are chosen by the caller, and a `.png` extension on a
 * PostScript file is the oldest trick there is (research D8). `sharp` reports what it actually
 * decoded, and anything outside the accepted set is refused.
 *
 * **One output format for every input.** The stored bytes are uniform, so "no metadata
 * survived" is a property of one encoder rather than of five, and the serving path never has to
 * decide what it is holding.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const processAvatar = async (input: Buffer): Promise<ProcessedAvatar> => {
  const { avatar } = loadConfig()

  // `failOn: 'error'` refuses a truncated or corrupt image rather than decoding whatever
  // prefix parsed — a half-decoded photograph is not a smaller problem than an undecodable one.
  //
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **`limitInputPixels` bounds the DECODED raster, which the byte limit does not.**
  //
  // `maxUploadBytes` and the route's `bodyLimit` bound the *compressed* upload. Compression
  // ratio is unbounded: a near-uniform PNG or WebP well under 5 MiB can declare dimensions of
  // 16000×16000 and force libvips to materialise ~1 GB of raw pixels — and because that
  // allocation is native, Node's heap limit never catches it. sharp's own default ceiling is
  // ~268 MP, which is far above anything this feature can use.
  //
  // 50 MP still accepts any camera a person owns (a 48 MP phone sensor is ~48 MP) while
  // costing ~200 MB decoded. Over-limit input throws inside `metadata()`/`toBuffer()`, so the
  // existing `catch` blocks already refuse it as unreadable — a 415, not a server fault.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  const image = sharp(input, { failOn: 'error', limitInputPixels: AVATAR_MAX_INPUT_PIXELS })

  let format: string | undefined
  let width: number | undefined
  let height: number | undefined
  try {
    ;({ format, width, height } = await image.metadata())
  } catch (error) {
    throw new UnreadableImageError((error as Error).message)
  }

  if (!format || !(AVATAR_ACCEPTED_FORMATS as readonly string[]).includes(format)) {
    throw new UnreadableImageError(`format ${format ?? 'unknown'} is not accepted`)
  }
  if (!width || !height) {
    throw new UnreadableImageError('the image reports no dimensions')
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **A square, and never an upscaled one.**
   *
   * `withoutEnlargement` alone would leave a 300×200 upload stored at 300×200 — bounded, as
   * FR-348 requires, but not square, and an avatar is rendered in a fixed frame everywhere it
   * appears. Computing the side from the input's shorter edge gives a genuine square crop at
   * every size, without ever inventing pixels: a 96px photograph stays 96px and stays sharp.
   *
   * The dimensions are read **before** `rotate()` applies the orientation tag, so a portrait
   * photograph reports its sensor dimensions here — swapped for the quarter-turn cases. That
   * swap does not need correcting: the side length is the *shorter edge*, and `min(w, h)` is
   * invariant under exchanging the two. The EXIF `Orientation` tag is therefore not consulted
   * here at all; `rotate()` below is what applies it, before the crop runs.
   *
   * An earlier revision branched on the tag and selected between `Math.min(height, width)` and
   * `Math.min(width, height)` — the same expression twice, so the branch never changed the
   * result. Do not reintroduce it: if this ever stops being a square crop, the fix is to swap
   * the two axes explicitly, not to re-derive a shorter edge that was already correct.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const side = Math.min(avatar.dimensionPx, Math.min(width, height))

  try {
    const resized = image
      // ───────────────────────────────────────────────────────────────────────────────────
      // **`rotate()` before the strip, and it must be before.**
      //
      // A phone photograph is stored in the sensor's orientation with an EXIF `Orientation`
      // tag saying which way up it is. Discarding metadata without applying that tag first
      // produces a face lying on its side — a "correct" strip that visibly breaks the feature.
      // Called with no argument, this applies the tag and then has no further use for it.
      // ───────────────────────────────────────────────────────────────────────────────────
      .rotate()
      .resize(side, side, {
        // Filled and cropped rather than letterboxed: an avatar frame is square everywhere it
        // appears, and padding would push the face into a fraction of the space.
        fit: 'cover',
        // Crops toward the busiest region rather than the geometric centre, which for a
        // photograph of a person is very nearly always the face.
        position: 'attention',
      })

    // `withMetadata()` is deliberately NOT called anywhere in this chain. Calling it is what
    // would copy EXIF, ICC and XMP across — the default is to emit none, and that default is
    // the requirement (FR-349).
    const bytes = await resized[AVATAR_OUTPUT_FORMAT]({ quality: 82 }).toBuffer()

    return { bytes, contentType: AVATAR_OUTPUT_CONTENT_TYPE }
  } catch (error) {
    // A decode that succeeded at the header and failed at the pixels lands here. Refused as
    // unreadable rather than as a server fault: nothing is wrong on our side.
    throw new UnreadableImageError((error as Error).message)
  }
}
