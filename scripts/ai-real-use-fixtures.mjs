#!/usr/bin/env node

/**
 * Generate deterministic, unmistakable media for the AI real-use playbook.
 *
 * This tool never writes to the application data directory. It writes only to
 * the explicitly supplied output directory and records a row for every
 * requested extension, including a BLOCKED row when a local converter cannot
 * produce a valid representative.
 */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const output = resolve(option("--output", join(root, "test-runs", `fixtures-${Date.now()}`)));
const runId = option("--run-id", basename(output));
const allExtensions = args.includes("--all-extensions");

const accepted = {
  video: [".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi", ".wmv", ".asf", ".mpeg", ".mpg", ".mpe", ".m1v", ".m2v", ".ts", ".mts", ".m2ts", ".mxf", ".flv", ".f4v", ".ogv", ".ogm", ".3gp", ".3gpp", ".3g2", ".3gpp2", ".vob", ".rm", ".rmvb", ".nut", ".ivf", ".y4m", ".h264", ".264", ".h265", ".hevc", ".265", ".mjpeg", ".mjpg"],
  audio: [".mp3", ".mp2", ".mpa", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".oga", ".opus", ".wma", ".aiff", ".aif", ".aifc", ".amr", ".ac3", ".eac3", ".au", ".snd", ".caf", ".mka", ".ape", ".wv", ".tta", ".voc", ".spx"],
  image: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".heif", ".jxl", ".ico", ".jp2", ".j2k", ".jpf", ".jpm", ".mj2"],
  document: [".pdf", ".ppt", ".pptx", ".pps", ".ppsx", ".pot", ".potx", ".pptm", ".ppsm", ".potm", ".odp", ".otp", ".odt", ".ott", ".ods", ".ots", ".fodp", ".fodt", ".fods", ".key", ".pages", ".numbers", ".doc", ".docx", ".docm", ".dot", ".dotx", ".dotm", ".xls", ".xlt", ".xla", ".xlsx", ".xlsm", ".xltx", ".xltm", ".xlam", ".rtf", ".txt", ".md", ".csv", ".tsv"],
};

const familyFor = extension => Object.entries(accepted).find(([, values]) => values.includes(extension))?.[0] ?? "other";
const toolAvailable = (command, commandArgs = ["-version"]) =>
  spawnSync(command, commandArgs, { stdio: "ignore" }).status === 0;
const ffmpegAvailable = toolAvailable("ffmpeg");
const ffprobeAvailable = toolAvailable("ffprobe");
const zipAvailable = toolAvailable("zip", ["-v"]);

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    maxBuffer: 2 * 1024 * 1024,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "ignore",
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    signal: result.signal,
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function wavBuffer(marker = 17) {
  const sampleRate = 8_000;
  const seconds = 2;
  const dataBytes = sampleRate * seconds * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let offset = 44; offset < buffer.length; offset += 2) {
    const sample = Math.round(Math.sin((offset - 44) / 18) * 5000);
    buffer.writeInt16LE(sample + marker, offset);
  }
  return buffer;
}

function pdfBuffer(label) {
  const safeLabel = label.replace(/[()\\]/g, "");
  const pages = [1, 2, 3].map(page => `BT /F1 24 Tf 72 700 Td (${safeLabel} — page ${page}) Tj ET\n`);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>",
    ...pages.flatMap((content, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents ${4 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    ]),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(value));
    value += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1)
    value += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  value += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(value);
}

async function writeZipFixture(extension, files) {
  if (!zipAvailable) throw new Error("zip is not installed");
  const temporary = await mkdtemp(join(tmpdir(), "lessoncue-ai-fixture-"));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const path = join(temporary, relative);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    const destination = join(output, `FORMATTED-${extension.slice(1)}${extension}`);
    const result = run("zip", ["-q", "-r", destination, "."], { cwd: temporary, capture: true, timeout: 30_000 });
    if (!result.ok) throw new Error(result.stderr || "zip failed");
    return destination;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function makeImage(extension) {
  if (!ffmpegAvailable) throw new Error("ffmpeg is not installed");
  const destination = join(output, `IMAGE-C${extension}`);
  const codecs = {
    ".webp": ["-c:v", "libwebp"],
    ".jpg": ["-c:v", "mjpeg"], ".jpeg": ["-c:v", "mjpeg"],
    ".gif": ["-c:v", "gif"], ".bmp": ["-c:v", "bmp"],
    ".tif": ["-c:v", "tiff"], ".tiff": ["-c:v", "tiff"],
    ".avif": ["-c:v", "libaom-av1", "-still-picture", "1", "-f", "avif"],
    ".heic": ["-c:v", "libx265", "-tag:v", "hvc1", "-f", "heic"],
    ".heif": ["-c:v", "libx265", "-tag:v", "hvc1", "-f", "heic"],
    ".jxl": ["-c:v", "libjxl"],
    ".ico": ["-c:v", "bmp", "-f", "image2"],
    ".jp2": ["-c:v", "jpeg2000", "-f", "jp2"], ".j2k": ["-c:v", "jpeg2000", "-f", "j2k"],
    ".jpf": ["-c:v", "jpeg2000", "-f", "jp2"], ".jpm": ["-c:v", "jpeg2000", "-f", "jp2"],
    ".mj2": ["-c:v", "jpeg2000", "-f", "mj2"],
  };
  const result = run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
    "color=c=0x1c8c74:s=640x360:d=1", "-frames:v", "1", ...(codecs[extension] || ["-c:v", "png"]), destination,
  ], { capture: true, timeout: 30_000 });
  if (!result.ok) throw new Error(result.stderr || `ffmpeg could not create ${extension}`);
  return destination;
}

async function makeVideo(extension, incompatible = false) {
  if (!ffmpegAvailable) throw new Error("ffmpeg is not installed");
  const destination = join(output, `${incompatible ? "VIDEO-INCOMPATIBLE" : "VIDEO-H264"}${extension}`);
  const args = [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "2",
  ];
  if (extension === ".webm") args.push("-c:v", "libvpx-vp9", "-c:a", "libopus");
  else if (extension === ".ogv") args.push("-c:v", "libtheora", "-c:a", "libvorbis");
  else if (extension === ".ogm") args.push("-c:v", "libx264", "-c:a", "libvorbis", "-f", "ogg");
  else if ([".mpeg", ".mpg", ".mpe"].includes(extension)) args.push("-c:v", "mpeg2video", "-c:a", "mp2", "-f", "mpeg");
  else if (extension === ".m1v") args.push("-an", "-c:v", "mpeg1video", "-f", "mpeg1video");
  else if (extension === ".m2v") args.push("-an", "-c:v", "mpeg2video", "-f", "mpeg2video");
  else if ([".vob", ".ts", ".mts", ".m2ts"].includes(extension)) args.push("-c:v", "mpeg2video", "-c:a", "mp2", "-f", extension === ".vob" ? "mpeg2video" : "mpegts");
  else if (extension === ".mxf") args.push("-ar", "48000", "-c:v", "mpeg2video", "-c:a", "pcm_s16le", "-f", "mxf");
  else if ([".wmv", ".asf"].includes(extension)) args.push("-c:v", "wmv2", "-c:a", "wmav2");
  else if (extension === ".flv") args.push("-c:v", "flv", "-c:a", "mp3");
  else if ([".3gp", ".3gpp"].includes(extension)) args.push("-s", "352x288", "-c:v", "h263", "-c:a", "aac", "-f", "3gp");
  else if ([".3g2", ".3gpp2"].includes(extension)) args.push("-s", "352x288", "-c:v", "h263", "-c:a", "aac", "-f", "3g2");
  else if ([".rm", ".rmvb"].includes(extension)) args.push("-c:v", "rv20", "-c:a", "ac3", "-f", "rm");
  else if (extension === ".nut") args.push("-c:v", "libx264", "-c:a", "aac", "-f", "nut");
  else if (extension === ".ivf") args.push("-an", "-c:v", "libvpx-vp9", "-f", "ivf");
  else if (extension === ".y4m") args.push("-an", "-c:v", "rawvideo", "-pix_fmt", "yuv420p", "-f", "yuv4mpegpipe");
  else if ([".h264", ".264"].includes(extension)) args.push("-an", "-c:v", "libx264", "-f", "h264");
  else if ([".h265", ".hevc", ".265"].includes(extension)) args.push("-an", "-c:v", "libx265", "-f", "hevc");
  else if ([".mjpeg", ".mjpg"].includes(extension)) args.push("-an", "-c:v", "mjpeg", "-f", "mjpeg");
  else if (incompatible) args.push("-c:v", "mpeg4", "-c:a", "mp3");
  else args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart");
  args.push(destination);
  const result = run("ffmpeg", args, { capture: true, timeout: 90_000 });
  if (!result.ok) throw new Error(result.stderr || `ffmpeg could not create ${extension}`);
  return destination;
}

async function metadata(path, family, extension, status = "generated", error = "") {
  const bytes = await readFile(path).catch(() => null);
  if (!bytes || bytes.length === 0) return {
    runId, fileName: basename(path), family, extension, status: "blocked-fixture",
    ...(status === "negative-fixture" ? { status, bytes: 0, sha256: createHash("sha256").update(bytes ?? Buffer.alloc(0)).digest("hex") } : {}),
    error: error || "The converter exited without producing bytes.",
  };
  const result = {
    runId, fileName: basename(path), family, extension, status, error,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  if (ffprobeAvailable && family === "video") {
    const probe = run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height", "-of", "json", path], { capture: true, timeout: 20_000 });
    if (probe.ok) result.probe = probe.stdout.trim();
  }
  return result;
}

await mkdir(output, { recursive: true });
const rows = [];
const add = async (path, family, extension, status = "generated", error = "") => rows.push(await metadata(path, family, extension, status, error));

const wavPath = join(output, "STEREO-D.wav");
await writeFile(wavPath, wavBuffer());
await add(wavPath, "audio", ".wav");

const pdfPath = join(output, "THREE-SLIDE.pdf");
await writeFile(pdfPath, pdfBuffer("THREE-SLIDE"));
await add(pdfPath, "document", ".pdf");

if (ffmpegAvailable) {
  for (const extension of [".mp3", ".m4a", ".aac"]) {
    const path = join(output, `STEREO-D${extension}`);
    const codec = extension === ".mp3" ? "libmp3lame" : "aac";
    const formatArgs = extension === ".aac" ? ["-f", "adts"] : [];
    const result = run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "2", "-c:a", codec, ...formatArgs, path], { capture: true, timeout: 30_000 });
    if (result.ok) await add(path, "audio", extension);
    else rows.push({ runId, fileName: basename(path), family: "audio", extension, status: "blocked-fixture", error: result.stderr || "ffmpeg failed" });
  }
  for (const extension of [".png", ".jpg", ".jpeg", ".webp"]) {
    try { await add(await makeImage(extension), "image", extension); }
    catch (error) { rows.push({ runId, fileName: `IMAGE-C${extension}`, family: "image", extension, status: "blocked-fixture", error: String(error.message || error) }); }
  }
  for (const extension of [".mp4", ".m4v", ".mov"]) {
    try { await add(await makeVideo(extension), "video", extension); }
    catch (error) { rows.push({ runId, fileName: `VIDEO-H264${extension}`, family: "video", extension, status: "blocked-fixture", error: String(error.message || error) }); }
  }
  try { await add(await makeVideo(".mp4", true), "video", ".mp4", "incompatible-tv-copy"); }
  catch (error) { rows.push({ runId, fileName: "VIDEO-INCOMPATIBLE.mp4", family: "video", extension: ".mp4", status: "blocked-fixture", error: String(error.message || error) }); }
  if (allExtensions) {
    for (const extension of accepted.video.filter(value => ![".mp4", ".m4v", ".mov"].includes(value))) {
      try { await add(await makeVideo(extension), "video", extension); }
      catch (error) { rows.push({ runId, fileName: `VIDEO-H264${extension}`, family: "video", extension, status: "blocked-fixture", error: String(error.message || error) }); }
    }
  }
} else {
  rows.push({ runId, fileName: "ffmpeg-required", family: "video", extension: "*", status: "blocked-fixture", error: "ffmpeg is not installed" });
}

if (zipAvailable) {
  const packages = [
    ...[".pptx", ".ppsx", ".potx", ".pptm", ".ppsm", ".potm"].map(extension => [extension, { "[Content_Types].xml": "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>", "ppt/presentation.xml": "<p:presentation xmlns:p=\"urn:schemas-microsoft-com:office:powerpoint\"/>" }]),
    ...[".docx", ".docm", ".dotx", ".dotm"].map(extension => [extension, { "[Content_Types].xml": "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>", "word/document.xml": "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"/>" }]),
    ...[".xlsx", ".xlsm", ".xltx", ".xltm", ".xlam"].map(extension => [extension, { "[Content_Types].xml": "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>", "xl/workbook.xml": "<workbook/>" }]),
    ...[".odp", ".otp", ".odt", ".ott", ".ods", ".ots", ".fodp", ".fodt", ".fods"].map(extension => [extension, { "META-INF/manifest.xml": "<manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"/>", "content.xml": "<office:document-content xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\"/>" }]),
    [".key", { "Index/Document.iwa": Buffer.from("LessonCue Keynote package fixture") }],
    [".pages", { "Index/Document.iwa": Buffer.from("LessonCue Pages package fixture") }],
    [".numbers", { "Index/Document.iwa": Buffer.from("LessonCue Numbers package fixture") }],
  ];
  for (const [extension, files] of packages) {
    try { await add(await writeZipFixture(extension, files), "document", extension); }
    catch (error) { rows.push({ runId, fileName: `FORMATTED-${extension.slice(1)}${extension}`, family: "document", extension, status: "blocked-fixture", error: String(error.message || error) }); }
  }
} else {
  for (const extension of [".pptx", ".docx", ".odp", ".key"]) rows.push({ runId, fileName: `FORMATTED-${extension.slice(1)}${extension}`, family: "document", extension, status: "blocked-fixture", error: "zip is not installed" });
}

  for (const extension of [".ppt", ".pps", ".pot", ".doc", ".dot", ".xls", ".xlt", ".xla"]) {
  rows.push({ runId, fileName: `FORMATTED-${extension.slice(1)}${extension}`, family: "document", extension, status: "blocked-fixture", error: "A valid legacy OLE fixture requires LibreOffice or a real sample; no renamed package is used." });
}

for (const extension of [".rtf", ".txt", ".md", ".csv", ".tsv"]) {
  const path = join(output, `TEXT-${extension.slice(1)}${extension}`);
  const content = extension === ".rtf"
    ? "{\\rtf1\\ansi LessonCue broad document fixture}"
    : extension === ".csv" ? "name,value\nLessonCue,42\n" : extension === ".tsv" ? "name\tvalue\nLessonCue\t42\n" : "LessonCue broad document fixture\n";
  await writeFile(path, content);
  await add(path, "document", extension);
}

const invalid = [
  ["INVALID-zero-byte.png", "image", ".png", Buffer.alloc(0)],
  ["INVALID-mislabeled.mp4", "video", ".mp4", Buffer.from("not an mp4")],
  ["INVALID-truncated.wav", "audio", ".wav", Buffer.from("RIFF")],
  ["INVALID-package.pptx", "document", ".pptx", Buffer.from("PK but not a package")],
];
for (const [name, family, extension, bytes] of invalid) {
  const path = join(output, name);
  await writeFile(path, bytes);
  await add(path, family, extension, "negative-fixture");
}

const headers = ["run_id", "file_name", "family", "extension", "status", "bytes", "sha256", "probe", "error"];
const csv = [headers.join(","), ...rows.map(row => [row.runId, row.fileName, row.family, row.extension, row.status, row.bytes ?? "", row.sha256 ?? "", row.probe ?? "", row.error ?? ""].map(csvCell).join(","))].join("\n") + "\n";
await writeFile(join(output, "manifest.csv"), csv);
await writeFile(join(output, "manifest.json"), JSON.stringify({ runId, output, tools: { ffmpeg: ffmpegAvailable, ffprobe: ffprobeAvailable, zip: zipAvailable }, rows }, null, 2) + "\n");

console.log(`Generated ${rows.length} fixture rows in ${output}`);
console.log(`Generated: ${rows.filter(row => row.status === "generated").length}; blocked: ${rows.filter(row => row.status === "blocked-fixture").length}; negative: ${rows.filter(row => row.status === "negative-fixture").length}`);
