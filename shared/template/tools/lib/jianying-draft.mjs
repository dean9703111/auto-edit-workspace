// 剪映草稿：把 output/capcut/ 的剪映素材（主軌.mp4、每段 .mov、字幕.srt、清單.json）排成一份剪映專業版（Mac）的明文草稿，
// 放進剪映的草稿資料夾 com.lveditor.draft/<草稿名>/ 並註冊進 root_meta_info.json，剪映首頁就看得到。
//
//   makeDraft({ dir, name, force, root, running, probe, cover, log })   → 結束碼（0 好了、1 拒絕或失敗）
//   buildDraft({ name, width, height, main, overlays, cues, ... })      → { info, meta, store }（純函式：draft_info.json 等內容）
//   laneOf(items)                                                       → 每個 { start, end } 放第幾條疊加軌（時間重疊就分開）
//   draftRoot()／jianyingRunning()                                      → 剪映草稿根目錄（JIANYING_DRAFT_ROOT 可覆寫）／剪映主程式開著沒
//
// 結構照剪映自己存過的明文草稿（10月8日：version 360000、new_version 107.0.0），軌道與字幕的欄位照已被剪映 11.x 打開過的
// 生成草稿（esim-ep2-side：疊加影片軌 flag 2、字幕軌 flag 1、type subtitle）。
// 安全：剪映開著不寫；同名草稿已存在就拒絕（--force 先整個複製成備份再換）；剪映存過的（加密）草稿 --force 也不換；
// 改 root_meta_info.json 前先備份；素材用絕對路徑指回 output/capcut/，不複製大檔。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseSrt } from './srt.mjs';
import { writeAtomic } from './atomic.mjs';

export const US = 1_000_000;
export const us = (sec) => Math.round(Number(sec) * US);
export const JY_PROCESS = 'VideoFusion-macOS.app/Contents/MacOS/VideoFusion-macOS$';   // 錨定主程式，TrayHelper、同一行指令含這串字的不算
const OFFICIAL_ROOT = path.join(os.homedir(), 'Movies', 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft');
const FONT = '/Applications/VideoFusion-macOS.app/Contents/Resources/Font/SystemFont/zh-hans.ttf';   // 剪映內建字體（沒有就用剪映預設字體）
// 字幕：白字黑邊、置中偏下。字級照作者的剪映草稿：橫式 7（esim-ep2）、直式 8（manus-ep4-short）
const SUB = { landscape: { size: 7, y: -0.8 }, portrait: { size: 8, y: -0.6 } };
const STROKE = 0.08;

// 091 目標程式：剪映專業版（Mac，原本就有的）、CapCut／剪映（Windows）。每一種的草稿根目錄、平台欄位、字體、主檔名、路徑寫法都不一樣：
//   Windows 的 CapCut 讀 draft_content.json；draft_meta_info.json 的 draft_root_path 是反斜線、draft_fold_path 是正斜線（照 CapCut 9.9 自己存的草稿），
//   寫錯就會「專案來自異常路徑」（作者 2026-11-27：Mac 格式的草稿用 JIANYING_DRAFT_ROOT 放進 CapCut，打開就是這個錯）
const MAC_APP = { id: 'jianying-mac', label: '剪映', quit: '關掉剪映（⌘Q）', platform: null, font: null, files: ['draft_info.json'], win: false, exe: null };
export function windowsApps(env = process.env) {
  const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const at = (dir) => path.win32.join(local, dir, 'User Data', 'Projects', 'com.lveditor.draft');
  return [
    { id: 'capcut-win', label: 'CapCut', install: path.win32.join(local, 'CapCut'), root: at('CapCut'), exe: 'CapCut.exe', app_id: 359289, app_source: 'cc' },
    { id: 'jianying-win', label: '剪映', install: path.win32.join(local, 'JianyingPro'), root: at('JianyingPro'), exe: 'JianyingPro.exe', app_id: 3704, app_source: 'lv' },
  ];
}
// 安裝資料夾（或它的 Apps）裡版本號最大的那個資料夾（CapCut\9.9.0.4254 → 9.9.0）；找不到回 ''
export function appVersion(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => /^\d+\.\d+\.\d+\.\d+$/.test(n)); } catch { return ''; }
  const key = (n) => n.split('.').map(Number);
  names.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
  return names.length ? names.at(-1).split('.').slice(0, 3).join('.') : '';
}
const winApp = (a, root) => ({
  id: a.id, label: a.label, quit: `關掉 ${a.label}（右上角的 ×，工作列上也沒有它）`, exe: a.exe, win: true, root: path.win32.resolve(root),
  font: '', files: ['draft_content.json', 'draft_info.json'],
  // 版本：CapCut 9.x 裝在 CapCut\Apps\<版本>，也找安裝資料夾本身
  platform: { app_id: a.app_id, app_source: a.app_source, app_version: appVersion(a.install) || appVersion(path.win32.join(a.install, 'Apps')), device_id: '', hard_disk_id: '', mac_address: '', os: 'windows', os_version: os.release() },
});
// 這台電腦的草稿要寫到哪：JIANYING_DRAFT_ROOT 指定就用它（Windows 照路徑認是 CapCut 還是剪映）；不然 Mac 用剪映專業版、Windows 先找 CapCut 再找剪映（有草稿資料夾的那個）
export function draftTarget({ platform = process.platform, env = process.env } = {}) {
  const override = env.JIANYING_DRAFT_ROOT;
  if (platform === 'win32') {
    const apps = windowsApps(env);
    if (override) { const norm = (p) => path.win32.resolve(p).toLowerCase(); const a = apps.find((x) => norm(x.root) === norm(override)) || (/jianying/i.test(override) ? apps[1] : apps[0]); return winApp(a, override); }
    const a = apps.find((x) => fs.existsSync(x.root));
    return a ? winApp(a, a.root) : null;
  }
  const root = override || (platform === 'darwin' ? OFFICIAL_ROOT : null);
  return root ? { ...MAC_APP, root } : null;
}
export const draftRoot = () => draftTarget()?.root ?? null;
export function jianyingRunning() {
  if (process.platform !== 'darwin') return false;
  return spawnSync('pgrep', ['-f', JY_PROCESS], { stdio: 'ignore' }).status === 0;
}
// Windows：tasklist 看主程式開著沒（CapCut.exe／JianyingPro.exe）
export function appRunning(app) {
  if (!app?.exe) return jianyingRunning();
  const r = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${app.exe}`, '/NH'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 && String(r.stdout).toLowerCase().includes(app.exe.toLowerCase());
}
// 草稿裡寫的路徑：Mac 照原樣；Windows 照 CapCut 自己存的寫法（見上面）
const fwd = (p) => String(p).replace(/\\/g, '/');
function draftPaths(app, root, name) {
  if (!app.win) { const dst = path.join(root, name); return { dst, fold: dst, metaRoot: root, listRoot: root, json: path.join(dst, app.files[0]), cover: path.join(dst, 'draft_cover.jpg') }; }
  const fold = `${fwd(root)}/${name}`;
  return { dst: path.win32.join(root, name), fold, metaRoot: path.win32.resolve(root), listRoot: fwd(root), json: `${fold}\\${app.files[0]}`, cover: `${fold}\\draft_cover.jpg` };
}
const backupDir = (root) => (path.resolve(root) === OFFICIAL_ROOT ? path.join(os.homedir(), 'Movies', 'JianyingPro', 'backups') : path.join(path.dirname(path.resolve(root)), 'backups'));
const stamp = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const UID = () => crypto.randomUUID().toUpperCase();

export function checkName(name) {
  const n = String(name ?? '');
  if (!n.trim()) return '草稿名是空的';
  if (/[/\\]/.test(n) || n.startsWith('.') || n === 'root_meta_info.json') return `草稿名「${n}」不能有 / 或 \\、不能用 . 開頭`;
  return null;
}

// 時間重疊就分到不同軌（貪婪：照起點排，放進第一條已經空出來的軌）。回傳和 items 同順序的軌號（0 起算）
export function laneOf(items) {
  const ends = [];
  const out = new Array(items.length);
  items.map((it, i) => ({ ...it, i })).sort((a, b) => a.start - b.start || a.i - b.i).forEach((it) => {
    let k = ends.findIndex((e) => e <= it.start + 1e-6);
    if (k < 0) { k = ends.length; ends.push(0); }
    ends[k] = it.end;
    out[it.i] = k;
  });
  return out;
}

// ---------- draft_info.json 的各個零件（欄位照剪映 5.7 存的 10月8日） ----------
const MATERIAL_GROUPS = ['ai_translates', 'audio_balances', 'audio_effects', 'audio_fades', 'audio_track_indexes', 'audios', 'beats', 'canvases', 'chromas', 'color_curves', 'digital_humans', 'drafts', 'effects', 'flowers', 'green_screens', 'handwrites', 'hsl', 'images', 'log_color_wheels', 'loudnesses', 'manual_deformations', 'masks', 'material_animations', 'material_colors', 'multi_language_refs', 'placeholders', 'plugin_effects', 'primary_color_wheels', 'realtime_denoises', 'shapes', 'smart_crops', 'smart_relights', 'sound_channel_mappings', 'speeds', 'stickers', 'tail_leaders', 'text_templates', 'texts', 'time_marks', 'transitions', 'video_effects', 'video_trackings', 'videos', 'vocal_beautifys', 'vocal_separations'];
const PLATFORM = { app_id: 3704, app_source: 'lv', app_version: '5.7.0', device_id: '', hard_disk_id: '', mac_address: '', os: 'mac', os_version: '' };
const CROP = { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 };

function videoMaterial(f, localId) {
  return {
    aigc_type: 'none', audio_fade: null, cartoon_path: '', category_id: '', category_name: 'local', check_flag: 63487, crop: { ...CROP }, crop_ratio: 'free', crop_scale: 1,
    duration: f.durUs, extra_type_option: 0, formula_id: '', freeze: null, has_audio: !!f.hasAudio, height: f.height, id: UID(), intensifies_audio_path: '', intensifies_path: '',
    is_ai_generate_content: false, is_copyright: false, is_text_edit_overdub: false, is_unified_beauty_mode: false, local_id: '', local_material_id: localId, material_id: '',
    material_name: path.basename(f.path), material_url: '', matting: { flag: 0, has_use_quick_brush: false, has_use_quick_eraser: false, interactiveTime: [], path: '', strokes: [] },
    media_path: '', object_locked: null, origin_material_id: '', path: f.path, picture_from: 'none', picture_set_category_id: '', picture_set_category_name: '', request_id: '',
    reverse_intensifies_path: '', reverse_path: '', smart_motion: null, source: 0, source_platform: 0, stable: { matrix_path: '', stable_level: 0, time_range: { duration: 0, start: 0 } },
    team_id: '', type: 'video', video_algorithm: { algorithms: [], complement_frame_config: null, deflicker: null, gameplay_configs: [], motion_blur_config: null, noise_reduction: null, path: '', quality_enhance: null, time_range: null }, width: f.width,
  };
}

// 影片片段的附屬素材：剪映存檔時每段都有這五個（速度、畫布、動畫、聲道、人聲分離）
function videoExtras(m) {
  const list = [
    ['speeds', { curve_speed: null, id: UID(), mode: 0, speed: 1, type: 'speed' }],
    ['canvases', { album_image: '', blur: 0, color: '', id: UID(), image: '', image_id: '', image_name: '', source_platform: 0, team_id: '', type: 'canvas_color' }],
    ['material_animations', { animations: [], id: UID(), multi_language_current: 'none', type: 'sticker_animation' }],
    ['sound_channel_mappings', { audio_channel_mapping: 0, id: UID(), is_config_open: false, type: '' }],
    ['vocal_separations', { choice: 0, id: UID(), production_path: '', time_range: null, type: 'vocal_separation' }],
  ];
  for (const [g, x] of list) m[g].push(x);
  return list.map(([, x]) => x.id);
}

function segment({ materialId, extras, start, dur, srcDur, renderIndex, trackIndex, text = false, y = 0 }) {
  return {
    caption_info: null, cartoon: false, clip: { alpha: 1, flip: { horizontal: false, vertical: false }, rotation: 0, scale: { x: 1, y: 1 }, transform: { x: 0, y } },
    common_keyframes: [], enable_adjust: !text, enable_color_curves: true, enable_color_match_adjust: false, enable_color_wheels: true, enable_lut: !text, enable_smart_color_adjust: false,
    extra_material_refs: extras, group_id: '', hdr_settings: text ? null : { intensity: 1, mode: 1, nits: 1000 }, id: UID(), intensifies_audio: false, is_placeholder: false, is_tone_modify: false,
    keyframe_refs: [], last_nonzero_volume: 1, material_id: materialId, render_index: renderIndex,
    responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: '', vertical_pos_layout: 0 }, reverse: false,
    source_timerange: text ? null : { duration: srcDur ?? dur, start: 0 }, speed: 1, target_timerange: { duration: dur, start }, template_id: '', template_scene: 'default',
    track_attribute: 0, track_render_index: trackIndex, uniform_scale: { on: true, value: 1 }, visible: true, volume: 1,
  };
}

function subtitleMaterial(text, { size, groupId, font = FONT }) {
  const content = { styles: [{ fill: { content: { solid: { color: [1, 1, 1] } } }, range: [0, text.length], size, font: { id: '', path: font }, strokes: [{ content: { solid: { color: [0, 0, 0] } }, width: STROKE }] }], text };
  return {
    add_type: 1, alignment: 1, background_alpha: 1, background_color: '', background_height: 0.14, background_horizontal_offset: 0, background_round_radius: 0, background_style: 0,
    background_vertical_offset: 0, background_width: 0.14, bold_width: 0, border_alpha: 1, border_color: '#000000', border_width: STROKE,
    caption_template_info: { category_id: '', category_name: '', effect_id: '', is_new: false, path: '', request_id: '', resource_id: '', resource_name: '', source_platform: 0 },
    check_flag: 23, combo_info: { text_templates: [] }, content: JSON.stringify(content), fixed_height: -1, fixed_width: -1, font_category_id: '', font_category_name: '', font_id: '',
    font_name: '', font_path: font, font_resource_id: '', font_size: size, font_source_platform: 0, font_team_id: '', font_title: 'none', font_url: '', fonts: [],
    force_apply_line_max_width: false, global_alpha: 1, group_id: groupId, has_shadow: false, id: UID(), initial_scale: 1, inner_padding: -1, is_rich_text: false, italic_degree: 0,
    ktv_color: '', language: '', layer_weight: 1, letter_spacing: 0, line_feed: 1, line_max_width: 0.82, line_spacing: 0.02, multi_language_current: 'none', name: '', original_size: [],
    preset_category: '', preset_category_id: '', preset_has_set_alignment: false, preset_id: '', preset_index: 0, preset_name: '', recognize_task_id: '', recognize_type: 0,
    relevance_segment: [], shadow_alpha: 0.8, shadow_angle: -45, shadow_color: '', shadow_distance: 8, shadow_point: { x: 1.0182337649086284, y: -1.0182337649086284 }, shadow_smoothing: 1,
    shape_clip_x: false, shape_clip_y: false, source_from: '', style_name: '', sub_type: 0, subtitle_keywords: null, subtitle_template_original_fontsize: 0, text_alpha: 1,
    text_color: '#ffffff', text_curve: null, text_preset_resource_id: '', text_size: 30, text_to_audio_ids: [], tts_auto_update: false, type: 'subtitle', typesetting: 0,
    underline: false, underline_offset: 0.22, underline_width: 0.05, use_effect_default_color: true, words: { end_time: [], start_time: [], text: [] },
  };
}

const track = (type, flag, segments) => ({ attribute: 0, flag, id: UID(), is_default_name: true, name: '', segments, type });

// main：{ path, durUs, width, height, hasAudio }；overlays：[{ path, startUs, durUs, fileDurUs, width, height, hasAudio }]；cues：[{ start, end, text }]（秒）
export function buildDraft({ name, width, height, fps = 30, main, overlays = [], cues = [], now = Date.now(), platform = null, font = null }) {   // platform／font：091 目標程式（null＝剪映 Mac）
  const m = Object.fromEntries(MATERIAL_GROUPS.map((g) => [g, []]));
  const media = [];   // draft_meta_info.json 的素材庫（剪映「媒體」面板）
  const addVideo = (f) => {
    const localId = crypto.randomUUID();
    const mat = videoMaterial({ ...f, durUs: f.fileDurUs ?? f.durUs }, localId);
    m.videos.push(mat);
    media.push({ create_time: Math.floor(now / 1000), duration: mat.duration, extra_info: mat.material_name, file_Path: platform?.os === 'windows' ? fwd(f.path) : f.path, height: f.height, id: localId,
      import_time: Math.floor(now / 1000), import_time_ms: now * 1000, item_source: 1, md5: '', metetype: 'video', roughcut_time_range: { duration: mat.duration, start: 0 },
      sub_time_range: { duration: -1, start: -1 }, type: 0, width: f.width });
    return mat;
  };
  const tracks = [];
  // 1. 主軌（含人聲）
  const mm = addVideo(main);
  tracks.push(track('video', 0, [segment({ materialId: mm.id, extras: videoExtras(m), start: 0, dur: main.durUs, renderIndex: 0, trackIndex: 0 })]));
  // 2. 每段 .mov：主軌上面的疊加影片軌，時間重疊就分軌
  const lane = laneOf(overlays.map((o) => ({ start: o.startUs, end: o.startUs + o.durUs })));
  const nLanes = overlays.length ? Math.max(...lane) + 1 : 0;
  for (let k = 0; k < nLanes; k++) {
    const ti = tracks.length;
    const segs = overlays.map((o, i) => [o, i]).filter(([, i]) => lane[i] === k).sort(([a], [b]) => a.startUs - b.startUs).map(([o]) => {
      const mat = addVideo(o);
      return segment({ materialId: mat.id, extras: videoExtras(m), start: o.startUs, dur: o.durUs, renderIndex: k + 1, trackIndex: ti });
    });
    tracks.push(track('video', 2, segs));
  }
  // 3. 字幕軌（白字黑邊、置中偏下；同一個 group_id＝剪映裡改一則可以套用到全部）
  const style = SUB[height > width ? 'portrait' : 'landscape'];
  const groupId = `import_${now}`;
  const total = Math.max(main.durUs, ...overlays.map((o) => o.startUs + o.durUs));
  const subs = [];
  cues.forEach((c, i) => {
    const start = us(c.start);
    const end = Math.min(us(c.end), total);
    if (!c.text || end <= start) return;
    const mat = subtitleMaterial(c.text, { size: style.size, groupId, font: font ?? FONT });
    m.texts.push(mat);
    const anim = { animations: [], id: UID(), multi_language_current: 'none', type: 'sticker_animation' };
    m.material_animations.push(anim);
    subs.push(segment({ materialId: mat.id, extras: [anim.id], start, dur: end - start, renderIndex: 14000 + i, trackIndex: tracks.length, text: true, y: style.y }));
  });
  if (subs.length) tracks.push(track('text', 1, subs));

  const id = UID();
  const info = {
    canvas_config: { height, ratio: 'original', width }, color_space: 0,
    config: { adjust_max_index: 1, attachment_info: [], combination_max_index: 1, export_range: null, extract_audio_last_index: 1, lyrics_recognition_id: '', lyrics_sync: true,
      lyrics_taskinfo: [], maintrack_adsorb: true, material_save_mode: 0, multi_language_current: 'none', multi_language_list: [], multi_language_main: 'none', multi_language_mode: 'none',
      original_sound_last_index: 1, record_audio_last_index: 1, sticker_max_index: 1, subtitle_recognition_id: '', subtitle_sync: true, subtitle_taskinfo: [], system_font_list: [],
      video_mute: false, zoom_info_params: null },
    cover: null, create_time: 0, duration: total, extra_info: null, fps, free_render_index_mode_on: false, group_container: null, id, keyframe_graph_list: [],
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
    last_modified_platform: { ...(platform || PLATFORM) }, materials: m, mutable_config: null, name, new_version: '107.0.0', platform: { ...(platform || PLATFORM) }, relationships: [],
    render_index_track_mode_on: false, retouch_cover: null, source: 'default', static_cover_image_path: '', time_marks: null, tracks, update_time: 0, version: 360000,
  };
  return { info, media, summary: { lanes: nLanes, overlays: overlays.length, subs: subs.length, total } };
}

function metaInfo({ info, media, paths: P, name, nowUs }) {
  return {
    cloud_package_completed_time: '', draft_cloud_capcut_purchase_info: '', draft_cloud_last_action_download: false, draft_cloud_materials: [], draft_cloud_purchase_info: '',
    draft_cloud_template_id: '', draft_cloud_tutorial_info: '', draft_cloud_videocut_purchase_info: '', draft_cover: 'draft_cover.jpg', draft_deeplink_url: '',
    draft_enterprise_info: { draft_enterprise_extra: '', draft_enterprise_id: '', draft_enterprise_name: '', enterprise_material: [] }, draft_fold_path: P.fold, draft_id: info.id,
    draft_is_ai_packaging_used: false, draft_is_ai_shorts: false, draft_is_ai_translate: false, draft_is_article_video_draft: false, draft_is_from_deeplink: 'false', draft_is_invisible: false,
    draft_materials: [{ type: 0, value: media }, ...[1, 2, 3, 6, 7].map((type) => ({ type, value: [] }))], draft_materials_copied_info: [], draft_name: name, draft_new_version: '',
    draft_removable_storage_device: '', draft_root_path: P.metaRoot, draft_segment_extra_info: [], draft_timeline_materials_size_: 0, draft_type: '', tm_draft_cloud_completed: '',
    tm_draft_cloud_modified: 0, tm_draft_create: nowUs, tm_draft_modified: nowUs, tm_draft_removed: 0, tm_duration: info.duration,
  };
}

// root_meta_info.json 的一筆（欄位照剪映 11.x 寫的 esim_ep2 那筆）
function rootEntry({ info, paths: P, name, nowUs }) {
  return {
    cloud_draft_cover: false, cloud_draft_sync: false, draft_cloud_last_action_download: false, draft_cloud_purchase_info: '', draft_cloud_template_id: '', draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '', draft_cover: P.cover, draft_fold_path: P.fold, draft_id: info.id, draft_is_ai_shorts: false,
    draft_is_cloud_temp_draft: false, draft_is_infinite_canvas_draft: false, draft_is_invisible: false, draft_is_pippit_draft: false, draft_is_web_article_video: false,
    draft_json_file: P.json, draft_name: name, draft_new_version: '', draft_root_path: P.listRoot, draft_timeline_materials_size: 0, draft_type: '',
    draft_web_article_video_enter_from: '', pippit_avatar_url: '', pippit_extra_info: '', pippit_id: '', pippit_user_name: '', streaming_edit_draft_ready: true,
    tm_draft_cloud_completed: '', tm_draft_cloud_entry_id: -1, tm_draft_cloud_modified: 0, tm_draft_cloud_parent_entry_id: -1, tm_draft_cloud_space_id: -1, tm_draft_cloud_user_id: -1,
    tm_draft_create: nowUs, tm_draft_modified: nowUs, tm_draft_removed: 0, tm_duration: info.duration,
  };
}

// ffprobe：長度（微秒）、寬高、有沒有聲音
export function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const v = (j.streams || []).find((s) => s.codec_type === 'video');
    const dur = Number(j.format?.duration);
    if (!v || !(dur > 0)) return null;
    return { durUs: us(dur), width: v.width, height: v.height, hasAudio: (j.streams || []).some((s) => s.codec_type === 'audio') };
  } catch { return null; }
}

// 草稿封面：主軌 1 秒那格（失敗就算了，剪映會自己補）
export function ffCover(src, out) {
  return spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', 'scale=-2:360', out], { stdio: 'ignore' }).status === 0;
}

const isPlainDraft = (dst, app = MAC_APP) => { try { JSON.parse(fs.readFileSync(path.join(dst, app.files[0]), 'utf8')); return true; } catch { return false; } };

export function makeDraft({ dir, name, force = false, root = null, target = null, running = null, probe = ffprobe, cover = ffCover, log = console.log, cmd = '' }) {
  const say = (s) => log(s);
  // 091 目標程式：給了 target 就用它；只給 root（測試、舊的呼叫）＝剪映 Mac 的格式；都沒給就看這台電腦（draftTarget）
  const app = target ?? (root ? { ...MAC_APP, root } : draftTarget());
  if (!app) { say(process.platform === 'win32' ? '✖ 找不到 CapCut 或剪映的草稿資料夾 → 先打開一次 CapCut（或剪映）、建一個空白草稿再關掉（它會建好草稿資料夾），再跑一次' : '✖ 找不到剪映的草稿資料夾（Mac 版剪映專業版）→ 設環境變數 JIANYING_DRAFT_ROOT 指到 com.lveditor.draft 資料夾再跑一次'); return 1; }
  root = app.root;
  const isRunning = running ?? (() => appRunning(app));
  const L = app.label;
  const bad = checkName(name);
  if (bad) { say(`✖ ${bad} → 用 --name 換一個名字`); return 1; }
  const listFile = path.join(dir, '清單.json');
  let list;
  try { list = JSON.parse(fs.readFileSync(listFile, 'utf8')); } catch {
    say(`✖ 還沒有 ${path.basename(dir)}/清單.json（舊版剪映素材沒有它）→ 先做剪映素材（會略過沒變的）：${cmd}`);
    return 1;
  }
  const files = list.檔案 || [];
  const mainItem = files.find((f) => f.軌道建議 === '主軌');
  const movItems = files.filter((f) => String(f.軌道建議 || '').startsWith('疊加'));
  const srtItem = files.find((f) => f.軌道建議 === '字幕');
  const missing = [mainItem, ...movItems, srtItem].filter(Boolean).map((f) => f.檔名).filter((f) => !fs.existsSync(path.join(dir, f)));
  if (!mainItem) missing.unshift('主軌.mp4');
  if (missing.length) { say(`✖ 剪映素材還沒做完，缺 ${missing.length} 個檔：${missing.slice(0, 3).join('、')}${missing.length > 3 ? ' …' : ''} → 先做剪映素材：${cmd}`); return 1; }

  // 安全：剪映開著不寫（它關掉時會把記憶體裡的草稿清單寫回去，蓋掉這次的註冊）
  if (isRunning()) { say(`✖ ${L}開著，現在寫草稿會被它蓋掉 → ${app.quit}，再跑同一條指令`); return 1; }
  const P = draftPaths(app, root, name), dst = P.dst;
  if (fs.existsSync(dst)) {
    if (!force) { say(`✖ ${L}已經有叫「${name}」的草稿 → 要換掉舊的加 --force（舊的會先整個備份），或用 --name 取別的名字`); return 1; }
    if (!isPlainDraft(dst, app)) { say(`✖ 「${name}」是${L}存過的草稿（加密），--force 也不換，免得蓋掉你在${L}裡的修改 → 用 --name 取別的名字`); return 1; }
  }

  // 量素材
  const probed = {};
  for (const f of [mainItem, ...movItems]) {
    const p = probe(path.join(dir, f.檔名));
    if (!p) { say(`✖ 讀不到 ${f.檔名} 的長度（ffprobe）→ 這支可能沒 render 完，重做剪映素材：${cmd}`); return 1; }
    probed[f.檔名] = p;
  }
  const warns = [];
  const main = { path: path.resolve(dir, mainItem.檔名), ...probed[mainItem.檔名] };
  const overlays = movItems.map((f) => {
    const p = probed[f.檔名];
    let durUs = us(f.長度);
    if (durUs > p.durUs) { warns.push(`${f.檔名} 檔案比清單短 ${((durUs - p.durUs) / US).toFixed(2)} 秒，照檔案長度放`); durUs = p.durUs; }
    return { path: path.resolve(dir, f.檔名), startUs: us(f.開始秒), durUs, fileDurUs: p.durUs, width: p.width, height: p.height, hasAudio: p.hasAudio };
  });
  for (const o of overlays) if (o.startUs + o.durUs > main.durUs + US / 10) warns.push(`${path.basename(o.path)} 超過主軌結尾 ${((o.startUs + o.durUs - main.durUs) / US).toFixed(2)} 秒`);
  const cues = parseSrt(fs.readFileSync(path.join(dir, srtItem ? srtItem.檔名 : '字幕.srt'), 'utf8'));
  const width = Number(list.寬) || main.width;
  const height = Number(list.高) || main.height;
  const now = Date.now();
  const nowUs = now * 1000;
  const { info, media, summary } = buildDraft({ name, width, height, fps: Number(list.fps) || 30, main, overlays, cues, now, platform: app.platform, font: app.font });

  // 寫檔：舊的先整個備份（--force）→ 新草稿資料夾 → 再確認一次剪映沒開 → 備份並更新 root_meta_info.json
  const bdir = backupDir(root);
  const tag = stamp();
  if (fs.existsSync(dst)) {
    fs.mkdirSync(bdir, { recursive: true });
    const bk = path.join(bdir, `${name}-${tag}`);
    fs.cpSync(dst, bk, { recursive: true });
    fs.rmSync(dst, { recursive: true });
    say(`✓ 舊草稿備份 → ${bk}`);
  }
  for (const d of ['Resources/audioAlg', 'Resources/videoAlg', 'common_attachment', 'matting', 'smart_crop']) fs.mkdirSync(path.join(dst, d), { recursive: true });
  for (const f of app.files) fs.writeFileSync(path.join(dst, f), JSON.stringify(info));   // Mac：draft_info.json；Windows：draft_content.json（CapCut 讀這個）＋ draft_info.json
  fs.writeFileSync(path.join(dst, 'draft_meta_info.json'), JSON.stringify(metaInfo({ info, media, paths: P, name, nowUs })));
  fs.writeFileSync(path.join(dst, 'draft_virtual_store.json'), JSON.stringify({ draft_materials: [], draft_virtual_store: [
    { type: 0, value: [{ creation_time: 0, display_name: '', filter_type: 0, id: '', import_time: 0, import_time_us: 0, sort_sub_type: 0, sort_type: 0 }] },
    { type: 1, value: media.map((x) => ({ child_id: x.id, parent_id: '' })) }, { type: 2, value: [] }] }));
  fs.writeFileSync(path.join(dst, 'draft_agency_config.json'), JSON.stringify({ marterials: null, use_converter: false, video_resolution: 720 }));
  fs.writeFileSync(path.join(dst, 'attachment_pc_common.json'), JSON.stringify({ ai_packaging_infos: [], ai_packaging_report_info: { caption_id_list: [], task_id: '', text_style: '', tos_id: '', video_category: '' },
    commercial_music_category_ids: [], pc_feature_flag: 0, recognize_tasks: [], template_item_infos: [], unlock_template_ids: [] }));
  fs.writeFileSync(path.join(dst, 'key_value.json'), '{}');
  const sec = Math.floor(now / 1000);
  fs.writeFileSync(path.join(dst, 'draft_settings'), `[General]\ndraft_create_time=${sec}\ndraft_last_edit_time=${sec}\nreal_edit_keys=0\nreal_edit_seconds=0\n`);
  cover(main.path, path.join(dst, 'draft_cover.jpg'));

  if (isRunning()) { say(`✖ ${L}在寫草稿的時候被打開了，草稿資料夾寫好了但還沒註冊 → ${app.quit}，加 --force 再跑一次：${cmd}`); return 1; }
  const rp = path.join(root, 'root_meta_info.json');
  let rootMeta = { all_draft_store: [], draft_ids: 0, root_path: P.listRoot };
  if (fs.existsSync(rp)) {
    try { rootMeta = JSON.parse(fs.readFileSync(rp, 'utf8')); } catch { say(`✖ 讀不懂 ${rp}（${L}的草稿清單），沒有改它；草稿資料夾寫好了 → 回報這一行`); return 1; }
    fs.mkdirSync(bdir, { recursive: true });
    const bk = path.join(bdir, `root_meta_info-${tag}.json`);
    fs.copyFileSync(rp, bk);
    say(`✓ root_meta_info.json 備份 → ${bk}`);
  }
  if (!Array.isArray(rootMeta.all_draft_store)) rootMeta.all_draft_store = [];
  const same = (a, b) => (app.win ? fwd(a).toLowerCase() === fwd(b).toLowerCase() : a === b);
  rootMeta.all_draft_store = rootMeta.all_draft_store.filter((e) => !same(e.draft_fold_path ?? '', P.fold));
  rootMeta.all_draft_store.unshift(rootEntry({ info, paths: P, name, nowUs }));
  writeAtomic(rp, JSON.stringify(rootMeta));

  say(`✓ ${L}草稿：${dst}（明文，${L}存檔時才會加密）`);
  say(`✓ ${width}×${height}、30fps、長度 ${(summary.total / US).toFixed(2)} 秒：主軌 1 段＋疊加 ${summary.overlays} 支（${summary.lanes} 條軌）＋字幕 ${summary.subs} 則`);
  for (const w of warns) say(`⚠ ${w} → 打開${L}後看一下那支的尾巴`);
  say(`→ 打開${L}，首頁找『${name}』`);
  return 0;
}
