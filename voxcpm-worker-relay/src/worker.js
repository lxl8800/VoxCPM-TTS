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
  return dataUrlFromBytes(bytes, mime);
}

async function normalizeAudioResult(audio) {
  if (!audio) throw new Error("音频结果为空");

  if (typeof audio === "string") {
    if (audio.startsWith("data:")) {
      return {
        base64: audio,
        duration: 0,
        sample_rate: 44100
      };
    }
    if (audio.startsWith("http")) {
      return {
        base64: await fetchAsDataUrl(audio),
        duration: 0,
        sample_rate: 44100
      };
    }
  }

  if (Array.isArray(audio) && audio.length >= 2) {
    const maybeRate = Number(audio[0]) || 44100;
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
      sample_rate: audio.sample_rate || 44100
    };
  }

  if (audio.url) {
    return {
      base64: await fetchAsDataUrl(audio.url),
      duration: audio.duration || 0,
      sample_rate: audio.sample_rate || 44100
    };
  }

  if (audio.path) {
    const remoteUrl = audio.path.startsWith("http")
      ? audio.path
      : `https://openbmb-voxcpm-demo.hf.space/gradio_api/file=${audio.path}`;
    return {
      base64: await fetchAsDataUrl(remoteUrl),
      duration: audio.duration || 0,
      sample_rate: audio.sample_rate || 44100
    };
  }

  throw new Error(`无法解析音频结果: ${JSON.stringify(audio)}`);
}

let cachedClient = null;

async function getClient() {
  if (!cachedClient) {
    cachedClient = await Client.connect(HF_SPACE);
  }
  return cachedClient;
}

async function buildReferenceInput(referenceAudio) {
  if (!referenceAudio) return null;
  return handle_file(referenceAudio);
}

async function runGenerate(formData) {
  const client = await getClient();

  const text = String(formData.get("text") || "");
  const controlInstruction = String(formData.get("controlInstruction") || "");
  const cfgValue = Number(formData.get("cfgValue") || 2);
  const doNormalize = boolFrom(formData.get("doNormalize"), true);
  const denoise = boolFrom(formData.get("denoise"), true);
  const referenceAudio = formData.get("referenceAudio");

  const payload = {
    text_input: text,
    control_instruction: controlInstruction,
    reference_wav_path_input: await buildReferenceInput(referenceAudio),
    use_prompt_text: false,
    prompt_text_input: "",
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
          space: HF_SPACE
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

    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const formData = await request.formData();
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
