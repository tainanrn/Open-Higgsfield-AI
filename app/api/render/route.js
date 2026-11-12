import { InferenceClient } from '@huggingface/inference';
import { buildRenderPrompt, ASPECT_RATIOS, RESOLUTIONS } from '@/lib/renderPresets';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Free path: image-edit models served through Hugging Face Inference Providers.
// Uses the account's free monthly inference credits; tried in order.
const HF_EDIT_MODELS = [
  'black-forest-labs/FLUX.1-Kontext-dev',
  'Qwen/Qwen-Image-Edit-2509',
  'Qwen/Qwen-Image-Edit',
];

// Paid path: Muapi edit model with good geometry preservation and 4K output.
const MUAPI_ENDPOINT = 'nano-banana-pro-edit';

function providerStatus() {
  return {
    huggingface: Boolean(process.env.HUGGINGFACE_API_KEY),
    muapi: Boolean(process.env.MUAPI_API_KEY),
  };
}

export async function GET() {
  return Response.json({ providers: providerStatus() });
}

async function renderWithHuggingFace(file, prompt) {
  const client = new InferenceClient(process.env.HUGGINGFACE_API_KEY);
  const attempts = [];

  for (const model of HF_EDIT_MODELS) {
    try {
      const blob = await client.imageToImage({
        provider: 'auto',
        model,
        inputs: file,
        parameters: { prompt },
      });
      const buffer = Buffer.from(await blob.arrayBuffer());
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': blob.type || 'image/png',
          'X-Render-Model': model,
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      attempts.push({ model, error: String(err?.message || err).slice(0, 200) });
    }
  }

  console.error('[render] Hugging Face attempts failed', JSON.stringify(attempts));
  const lastError = attempts.at(-1)?.error || 'unknown error';
  const outOfCredits = attempts.every((a) => /\b402\b|credits|quota|payment required/i.test(a.error));
  return Response.json(
    {
      error: outOfCredits
        ? 'O Hugging Face recusou por falta de créditos. Veja os detalhes abaixo.'
        : `Nenhum modelo gratuito do Hugging Face conseguiu renderizar agora: ${lastError}`,
      details: attempts.map((a) => `${a.model}: ${a.error}`),
      attempts,
    },
    { status: 502 },
  );
}

async function renderWithMuapi(file, prompt, aspectRatio, resolution) {
  const apiKey = process.env.MUAPI_API_KEY;

  const uploadForm = new FormData();
  uploadForm.append('file', file);
  const uploadRes = await fetch('https://api.muapi.ai/api/v1/upload_file', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: uploadForm,
    cache: 'no-store',
  });
  const uploadData = await uploadRes.json().catch(() => ({}));
  const imageUrl = uploadData.url || uploadData.file_url || uploadData.data?.url;
  if (!uploadRes.ok || !imageUrl) {
    return Response.json(
      { error: uploadData.error || uploadData.detail || `Falha no upload para o Muapi (${uploadRes.status})` },
      { status: uploadRes.ok ? 502 : uploadRes.status },
    );
  }

  const submitRes = await fetch(`https://api.muapi.ai/api/v1/${MUAPI_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      prompt,
      images_list: [imageUrl],
      aspect_ratio: aspectRatio,
      resolution,
    }),
    cache: 'no-store',
  });
  const submitData = await submitRes.json().catch(() => ({}));
  if (!submitRes.ok) {
    return Response.json(
      { error: submitData.error || submitData.detail || `Muapi recusou o pedido (${submitRes.status})` },
      { status: submitRes.status },
    );
  }

  const requestId = submitData.request_id || submitData.id;
  const url = submitData.outputs?.[0] || submitData.url || null;
  // The client polls /api/jobs/{request_id} when no URL is returned yet.
  return Response.json({ request_id: requestId, url, model: MUAPI_ENDPOINT });
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const provider = String(form.get('provider') || 'huggingface');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'Envie uma imagem do seu modelo 3D.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: 'Formato não suportado. Use PNG, JPG ou WEBP.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: 'Imagem muito grande (máximo 10 MB).' }, { status: 413 });
    }

    const prompt = buildRenderPrompt({
      scene: form.get('scene'),
      style: form.get('style'),
      time: form.get('time'),
      ambience: form.get('ambience'),
      notes: form.get('notes'),
    });

    const aspectRatio = ASPECT_RATIOS.includes(form.get('aspectRatio')) ? form.get('aspectRatio') : '16:9';
    const resolution = RESOLUTIONS.some((r) => r.id === form.get('resolution')) ? form.get('resolution') : '1k';

    const available = providerStatus();
    if (provider === 'muapi') {
      if (!available.muapi) {
        return Response.json({ error: 'MUAPI_API_KEY não está configurada no servidor.' }, { status: 503 });
      }
      return await renderWithMuapi(file, prompt, aspectRatio, resolution);
    }

    if (!available.huggingface) {
      return Response.json({ error: 'HUGGINGFACE_API_KEY não está configurada no servidor.' }, { status: 503 });
    }
    return await renderWithHuggingFace(file, prompt);
  } catch (err) {
    return Response.json({ error: err?.message || 'Erro inesperado ao renderizar.' }, { status: 500 });
  }
}
