import { Client, handle_file } from "@gradio/client";

const HF_SPACE = "openbmb/VoxCPM-Demo";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function boolFrom(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function dataUrlFromBytes(bytes, mime = "audio/wav") {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function fetchAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`拉取远端音频失败：${res.status}`);
  }
  const mime = res.headers.get("content-type") || "audio/wav";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return dataUrlFromBytes(bytes, detectAudioMime(bytes, mime));
}

function detectAudioMime(bytes, fallback = "application/octet-stream") {
  const header = String.fromCharCode(...bytes.subarray(0, 12));
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WAVE") return "audio/wav";
  if (header.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (header.startsWith("OggS")) return "audio/ogg";
  if (header.startsWith("fLaC")) return "audio/flac";
  return fallback;
}

async function normalizeAudioResult(audio) {
  if (!audio) throw new Error("音频结果为空");

  if (typeof audio === "string") {
    if (audio.startsWith("data:")) {
      return {
        base64: audio,
        duration: 0,
        sample_rate: null
      };
    }
    if (audio.startsWith("http")) {
      return {
        base64: await fetchAsDataUrl(audio),
        duration: 0,
        sample_rate: null
      };
    }
  }

  if (Array.isArray(audio) && audio.length >= 2) {
    const maybeRate = Number(audio[0]) || null;
    const maybeAudio = audio[1];

    if (typeof maybeAudio === "string") {
      if (maybeAudio.startsWith("data:")) {
        return {
          base64: maybeAudio,
          duration: 0,
          sample_rate: maybeRate
        };
      }
      if (maybeAudio.startsWith("http")) {
        return {
          base64: await fetchAsDataUrl(maybeAudio),
          duration: 0,
          sample_rate: maybeRate
        };
      }
    }
  }

  if (audio.base64) {
    return {
      base64: audio.base64.startsWith("data:")
        ? audio.base64
        : `data:audio/wav;base64,${audio.base64}`,
      duration: audio.duration || 0,
      sample_rate: audio.sample_rate || null
    };
  }

  if (audio.url) {
    return {
      base64: await fetchAsDataUrl(audio.url),
      duration: audio.duration || 0,
      sample_rate: audio.sample_rate || null
    };
  }

  if (audio.path) {
    const remoteUrl = audio.path.startsWith("http")
      ? audio.path
      : `https://openbmb-voxcpm-demo.hf.space/gradio_api/file=${audio.path}`;
    return {
      base64: await fetchAsDataUrl(remoteUrl),
      duration: audio.duration || 0,
      sample_rate: audio.sample_rate || null
    };
  }

  throw new Error(`无法解析音频结果: ${JSON.stringify(audio)}`);
}

let cachedClient = null;

async function getClient() {
  if (!cachedClient) {
    cachedClient = await Client.connect("https://openbmb-voxcpm-demo.hf.space");
  }
  return cachedClient;
}

async function buildReferenceInput(referenceAudio) {
  if (!referenceAudio) return null;
  if (!(referenceAudio instanceof Blob) || !referenceAudio.size) throw new Error("请上传有效的参考音频");
  if (referenceAudio.size > 10 * 1024 * 1024) throw new Error("参考音频不能超过 10MB");
  return handle_file(referenceAudio);
}

async function runGenerate(formData) {
  const client = await getClient();

  const text = String(formData.get("text") || "");
  const controlInstruction = String(formData.get("controlInstruction") || "");
  const cfgValue = Number(formData.get("cfgValue") || 2);
  const doNormalize = boolFrom(formData.get("doNormalize"), true);
  const denoise = boolFrom(formData.get("denoise"), false);
  const referenceAudio = formData.get("referenceAudio");
  const usePromptText = boolFrom(formData.get("usePromptText"));
  const promptText = String(formData.get("promptText") || "").trim();
  if (!text.trim()) throw new Error("请输入要合成的文本");
  if (!Number.isFinite(cfgValue) || cfgValue < 1 || cfgValue > 3) throw new Error("CFG 必须在 1.0–3.0 之间");
  if (usePromptText && (!referenceAudio || !promptText)) throw new Error("极致克隆需要参考音频和对应文本");

  const payload = {
    text_input: text,
    control_instruction: usePromptText ? "" : controlInstruction,
    reference_wav_path_input: await buildReferenceInput(referenceAudio),
    use_prompt_text: usePromptText,
    prompt_text_input: usePromptText ? promptText : "",
    cfg_value_input: cfgValue,
    do_normalize: doNormalize,
    denoise: denoise
  };

  const result = await client.predict("/generate", payload);

  const audio = result?.data?.[0];
  if (!audio) {
    throw new Error(`generate 未返回音频: ${JSON.stringify(result)}`);
  }

  return normalizeAudioResult(audio);
}

async function runTranscribe(formData) {
  const referenceAudio = formData.get("referenceAudio");
  if (!referenceAudio) throw new Error("请先上传参考音频");
  const client = await getClient();
  const result = await client.predict("/_run_asr_if_needed", {
    checked: true,
    audio_path: await buildReferenceInput(referenceAudio)
  });
  const output = result?.data?.[0];
  const transcript = typeof output === "string" ? output : output?.value;
  if (!transcript?.trim()) throw new Error("未识别到参考文本，请手动填写");
  return transcript.trim();
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (url.pathname === "/api/status") {
      try {
        await getClient();
        return json({
          ok: true,
          relay: "cloudflare-worker",
          space: HF_SPACE,
          capabilities: { hifi: true, transcribe: true }
        });
      } catch (error) {
        return json(
          {
            ok: false,
            relay: "cloudflare-worker",
            space: HF_SPACE,
            error: error?.message || "Client 初始化失败"
          },
          502
        );
      }
    }

    if (["/api/generate", "/api/transcribe"].includes(url.pathname) && request.method === "POST") {
      try {
        const formData = await request.formData();
        if (url.pathname === "/api/transcribe") {
          return json({ ok: true, transcript: await runTranscribe(formData) });
        }
        const normalized = await runGenerate(formData);

        return json({
          ok: true,
          source: "relay",
          ...normalized
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error?.message || "中转生成失败"
          },
          502
        );
      }
    }

    return json(
      {
        ok: false,
        error: "Not Found"
      },
      404
    );
  }
};
