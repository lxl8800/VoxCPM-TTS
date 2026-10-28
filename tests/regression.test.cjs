const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'VoxCPM-TTS.html'), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
function pageFunctions(names, extra = {}) {
  const context = vm.createContext({ Blob, File, Uint8Array, ArrayBuffer, DataView, ...extra });
  for (const name of names) {
    const match = script.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`));
    assert.ok(match, `${name} exists`);
    vm.runInContext(match[0], context);
  }
  return context;
}
function wav(seconds = 1, rate = 48000) {
  const context = pageFunctions(['audioBufferToWavBlob']);
  return context.audioBufferToWavBlob({ numberOfChannels: 1, sampleRate: rate, length: rate * seconds, getChannelData: () => new Float32Array(rate * seconds) });
}
function workerContext(predict, extra = {}) {
  let source = fs.readFileSync(path.join(root, 'voxcpm-worker-relay/src/worker.js'), 'utf8');
  source = source.replace(/^import .*;$/m, '').replace('export default {', 'globalThis.worker = {');
  const context = vm.createContext({ Blob, File, FormData, Response, URL, Uint8Array, btoa, Client: { connect: async () => ({ predict }) }, handle_file: file => file, ...extra });
  vm.runInContext(source, context);
  return context;
}

test('page JavaScript parses and deployed copy matches', () => {
  new vm.Script(script.replace(/^import .*;$/m, ''));
  assert.equal(html, fs.readFileSync(path.join(root, 'voxcpm-worker-relay/public/index.html'), 'utf8'));
});
test('long text preserves text, Unicode and non-verbal tags within segments', () => {
  const context = pageFunctions(['splitSpeechText']);
  const text = ('你好，世界！😀[laughing]这是一句完整的台词。[sigh]\n').repeat(30);
  const parts = context.splitSpeechText(text);
  assert.ok(parts.length > 1);
  assert.equal(parts.join(''), text);
  assert.ok(parts.every(part => Array.from(part).length <= 200));
  assert.ok(parts.every(part => (part.match(/\[/g) || []).length === (part.match(/\]/g) || []).length));
  assert.equal(context.splitSpeechText('短句。').length, 1);
});
test('PCM WAV encoding retains rate, channels, duration and clips samples', async () => {
  const context = pageFunctions(['audioBufferToWavBlob', 'readAudioHeader']);
  const blob = context.audioBufferToWavBlob({ numberOfChannels: 2, sampleRate: 48000, length: 2, getChannelData: () => new Float32Array([-2, 2]) });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(context.readAudioHeader(bytes).sampleRate, 48000);
  assert.equal(context.readAudioHeader(bytes).extension, 'wav');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(48, true), 32767);
});
test('MP3 frame headers and ID3 identify real encoded sample rate', () => {
  const context = pageFunctions(['readAudioHeader']);
  for (const [frame, rate] of [[[255, 251, 148, 0], 48000], [[255, 251, 144, 0], 44100], [[255, 243, 128, 0], 22050]]) {
    assert.equal(context.readAudioHeader(Uint8Array.from(frame)).sampleRate, rate);
    assert.equal(context.readAudioHeader(Uint8Array.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0, ...frame])).extension, 'mp3');
  }
  assert.equal(context.readAudioHeader(new Uint8Array(20)).sampleRate, null);
});
test('reference validation rejects oversize, empty and over-50-second audio', async () => {
  const context = pageFunctions(['validateReferenceAudio'], { decodeAudioBlob: async blob => ({ buffer: { duration: blob.seconds } }) });
  await assert.rejects(context.validateReferenceAudio(null), /参考音频/);
  await assert.rejects(context.validateReferenceAudio({ size: 11 * 1024 * 1024 }), /10MB/);
  await assert.rejects(context.validateReferenceAudio({ size: 100, seconds: 51 }), /50 秒/);
  assert.equal(await context.validateReferenceAudio({ size: 100, seconds: 50 }), 50);
});
test('WAV downloads transcode encoded MP3 bytes instead of renaming', async () => {
  let downloaded;
  const context = pageFunctions(['audioBufferToWavBlob', 'triggerNamedDownload'], {
    decodeAudioBlob: async () => ({ buffer: { numberOfChannels: 1, sampleRate: 48000, length: 10, getChannelData: () => new Float32Array(10) } }),
    URL: { createObjectURL: blob => { downloaded = blob; return 'blob:test'; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } }, setTimeout() {}
  });
  const original = new Blob([Uint8Array.from([255, 251, 148, 0])], { type: 'audio/mpeg' });
  await context.triggerNamedDownload({ blob: original, filename: 'voice.wav' });
  assert.equal(downloaded.type, 'audio/wav');
  assert.equal(Buffer.from(await downloaded.arrayBuffer()).subarray(0, 4).toString(), 'RIFF');
  await context.triggerNamedDownload({ blob: original, filename: 'voice.mp3' });
  assert.equal(downloaded, original);
});
test('relay forwards Hi-Fi mode, transcript, normalization and denoise', async () => {
  let payload;
  const context = workerContext(async (endpoint, data) => { payload = data; assert.equal(endpoint, '/generate'); return { data: [{ base64: 'data:audio/mpeg;base64,//uUAA==' }] }; });
  const form = new FormData();
  form.set('text', '测试台词'); form.set('controlInstruction', '开心');
  form.set('usePromptText', 'true'); form.set('promptText', '参考原文');
  form.set('referenceAudio', await wav(), 'reference.wav'); form.set('doNormalize', 'false');
  await context.runGenerate(form);
  assert.equal(payload.use_prompt_text, true);
  assert.equal(payload.prompt_text_input, '参考原文');
  assert.equal(payload.control_instruction, '');
  assert.equal(payload.denoise, false);
  assert.equal(payload.do_normalize, false);
});
test('relay rejects invalid CFG and incomplete Hi-Fi requests', async () => {
  const context = workerContext(async () => { throw new Error('must not generate'); });
  const form = new FormData(); form.set('text', '测试'); form.set('cfgValue', '0.5');
  await assert.rejects(context.runGenerate(form), /CFG/);
  form.set('cfgValue', '2'); form.set('usePromptText', 'true');
  await assert.rejects(context.runGenerate(form), /极致克隆/);
});
test('relay ASR accepts Gradio textbox update result and exposes HTTP route', async () => {
  const context = workerContext(async (endpoint, payload) => {
    assert.equal(endpoint, '/_run_asr_if_needed'); assert.equal(payload.checked, true);
    return { data: [{ value: ' 参考音频原文 ' }] };
  });
  const form = new FormData(); form.set('referenceAudio', await wav(), 'reference.wav');
  const response = await context.worker.fetch({ url: 'https://relay.example/api/transcribe', method: 'POST', formData: async () => form });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).transcript, '参考音频原文');
});
test('relay detects MP3 bytes even with incorrect remote MIME and avoids fake rate', async () => {
  const context = workerContext(async () => {}, { fetch: async () => new Response(Uint8Array.from([255, 251, 148, 0]), { headers: { 'content-type': 'audio/wav' } }) });
  const result = await context.normalizeAudioResult({ url: 'https://example.com/audio.mp3' });
  assert.match(result.base64, /^data:audio\/mpeg;base64,/);
  assert.equal(result.sample_rate, null);
});
test('long synthesis runs sequentially, anchors designed voice, and merges output', async () => {
  const requests = [];
  let active = 0;
  const buffer = { length: 48000, sampleRate: 48000, numberOfChannels: 1, duration: 1, getChannelData: () => new Float32Array(48000) };
  const context = pageFunctions(['splitSpeechText', 'synthesizeAudio'], {
    S: { useRelay: false },
    log() {},
    synthesizeSegment: async payload => {
      assert.equal(active++, 0);
      await Promise.resolve(); active--;
      requests.push(payload);
      return { buffer, blob: new Blob(['encoded']), extension: 'mp3', audio: { sample_rate: 48000, duration: 1 } };
    },
    AudioBuffer: class { constructor() {} copyToChannel() {} },
    audioBufferToWavBlob: () => new Blob(['wav'], { type: 'audio/wav' }),
    mergeAudioBuffers: async parts => ({ sampleRate: 48000, duration: parts.length }),
    URL: { createObjectURL: () => 'blob:merged' }
  });
  const text = '保持同一人物的声音。'.repeat(50);
  const result = await context.synthesizeAudio({ text, options: { usePromptText: false, splitLongText: true } });
  assert.ok(requests.length > 1);
  assert.equal(requests[0].referenceBlob, null);
  assert.ok(requests[1].referenceBlob instanceof Blob);
  assert.ok(requests.slice(1).every(request => request.referenceBlob === requests[1].referenceBlob));
  assert.equal(result.extension, 'wav');
  assert.equal(result.audio.duration, requests.length);
  assert.equal(result.audio.sample_rate, 48000);
});
test('Hi-Fi requires accurate transcript before generating and suppresses style', async () => {
  let payload;
  const context = pageFunctions(['synthesizeAudio'], {
    S: { useRelay: false },
    validateReferenceAudio: async () => 6,
    synthesizeSegment: async input => { payload = input; return { blob: new Blob(['audio']), audio: { sample_rate: 48000, duration: 1 }, extension: 'mp3' }; },
    URL: { createObjectURL: () => 'blob:audio' }
  });
  const options = { usePromptText: true, promptText: '', splitLongText: false };
  const referenceBlob = new Blob(['reference']);
  await assert.rejects(context.synthesizeAudio({ text: '测试', referenceBlob, options }), /准确文本/);
  assert.equal(payload, undefined);
  await context.synthesizeAudio({ text: '测试', controlInstruction: '开心', referenceBlob, options: { ...options, promptText: '准确原文' } });
  assert.equal(payload.controlInstruction, '');
});
test('old relay cannot silently downgrade Hi-Fi cloning', async () => {
  const context = pageFunctions(['synthesizeAudio'], { S: { useRelay: true, relayCapabilities: {} } });
  await assert.rejects(context.synthesizeAudio({ text: '测试', options: { usePromptText: true } }), /部署新版 Worker/);
});
test('relay status advertises Hi-Fi and transcription support', async () => {
  const context = workerContext(async () => {});
  const response = await context.worker.fetch({ url: 'https://relay.example/api/status', method: 'GET' });
  assert.deepEqual((await response.json()).capabilities, { hifi: true, transcribe: true });
});
