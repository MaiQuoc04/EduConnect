// Image compression in the browser before upload (Supabase Free has no Storage Image Transformations, so the server
// cannot shrink images: whatever the client sends is what is stored and downloaded). Canvas API only, no library.
// Compressing is an optimisation, never a condition: when it cannot be done the ORIGINAL file is used.

// Avatars are shown at 40–96 px (SCR-33 preview 96 px); 400 px covers 4x on a high-density screen with room to spare.
export const AVATAR_IMAGE = { maxWidth: 400, maxHeight: 400, quality: 0.85 };
// Post images (stage 5): 1600 px on the long side is sharp full-width on a laptop and on a phone at 3x.
export const POST_IMAGE = { maxWidth: 1600, maxHeight: 1600, quality: 0.8 };

// ASSUMPTION: files above 30 MB are refused before decoding. A 48 MP phone JPEG is about 10–20 MB; decoding a much
// bigger file can take hundreds of MB of memory and freeze a phone's tab, and nobody needs such a file for an avatar
// or a post picture.
export const MAX_SOURCE_MB = 30;

// Only these come out (mimeType option: one of them). Both are accepted by every bucket and by the server's type check.
const OUTPUT_TYPES = ['image/webp', 'image/jpeg'];

let webpSupport; // cached: does this browser ENCODE WebP with canvas.toBlob (Safari does not, it returns PNG)?

// Short form: always resolves to a File (the compressed one, or the original).
export async function compressImage(file, options = POST_IMAGE) {
  return (await compressImageDetailed(file, options)).file;
}

// Long form for screens that want to tell the user what happened:
//   { file, status, width?, height?, originalWidth?, originalHeight? }
//   status: 'compressed'  – file is the smaller copy
//           'original'    – the copy was not smaller (an image already small and optimised): file is the original
//           'unsupported' – this browser cannot compress: file is the original
//           'unreadable'  – the file could not be decoded as an image (damaged, or not an image): file is the original
export async function compressImageDetailed(file, { maxWidth, maxHeight, quality = 0.8, mimeType } = POST_IMAGE) {
  if (typeof document === 'undefined' || !HTMLCanvasElement.prototype.toBlob) {
    console.warn('[imageCompress] canvas.toBlob not available, keeping the original file');
    return { file, status: 'unsupported' };
  }
  let source;
  try {
    source = await decode(file);
  } catch (err) {
    console.warn(`[imageCompress] cannot read "${file.name}" as an image, keeping the original file`, err);
    return { file, status: 'unreadable' };
  }
  try {
    const { width: ow, height: oh } = source;
    if (!ow || !oh) throw new Error('image has no size');
    // Keep the aspect ratio, never enlarge.
    const scale = Math.min(1, maxWidth / ow, maxHeight / oh);
    const width = Math.max(1, Math.round(ow * scale));
    const height = Math.max(1, Math.round(oh * scale));
    const canvas = resize(source.image, ow, oh, width, height);

    // WebP when the browser can encode it (checked on the real output type), JPEG otherwise.
    const wantWebp = mimeType ? mimeType === 'image/webp' : await canEncodeWebp();
    let blob = wantWebp ? await toBlob(canvas, 'image/webp', quality) : null;
    if (blob?.type !== 'image/webp') {
      // JPEG has no transparency: transparent pixels would turn black. Paint them white (the "paper" background)
      // first. WebP keeps the transparency, so this only happens where WebP cannot be encoded (Safari).
      blob = await toBlob(onWhite(canvas), 'image/jpeg', quality);
    }
    if (!blob || !OUTPUT_TYPES.includes(blob.type)) throw new Error(`encoder returned ${blob?.type ?? 'nothing'}`);

    const dims = { width, height, originalWidth: ow, originalHeight: oh };
    if (blob.size >= file.size) return { file, status: 'original', ...dims };
    const name = `${file.name.replace(/\.[^./\\]*$/, '') || 'image'}${blob.type === 'image/webp' ? '.webp' : '.jpg'}`;
    return { file: new File([blob], name, { type: blob.type, lastModified: file.lastModified }), status: 'compressed', ...dims };
  } catch (err) {
    console.warn(`[imageCompress] cannot compress "${file.name}", keeping the original file`, err);
    return { file, status: 'unsupported' };
  } finally {
    source?.close?.();
  }
}

// Decodes the file the right way up. createImageBitmap with imageOrientation 'from-image' applies the EXIF
// orientation of phone photos; where it is missing (older Safari), an <img> is used instead, which every current
// browser also draws the right way up (CSS image-orientation: from-image is the default).
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (err) {
      if (err?.name !== 'TypeError') throw err; // InvalidStateError etc.: the data is not a decodable image
      // TypeError: this browser does not know the options object, fall back to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

// Draws the image at width x height. Large reductions go in halving steps: one big jump looks jagged in browsers
// that ignore imageSmoothingQuality.
function resize(image, ow, oh, width, height) {
  let src = image;
  let w = ow;
  let h = oh;
  while (w / 2 >= width && h / 2 >= height) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    src = draw(src, w, h);
  }
  return draw(src, width, height);
}

function draw(src, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  return canvas;
}

function onWhite(canvas) {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function canEncodeWebp() {
  if (webpSupport === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const blob = await toBlob(canvas, 'image/webp', 0.8);
    webpSupport = blob?.type === 'image/webp';
  }
  return webpSupport;
}
