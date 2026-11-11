'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SCENE_TYPES,
  STYLES,
  TIMES_OF_DAY,
  AMBIENCE,
  ASPECT_RATIOS,
  RESOLUTIONS,
} from '@/lib/renderPresets';

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 120;

async function pollMuapiJob(requestId) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const res = await fetch(`/api/jobs/${encodeURIComponent(requestId)}/`, { cache: 'no-store' });
    if (res.status >= 500) continue;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Falha ao consultar o render (${res.status})`);
    const status = String(data.status || '').toLowerCase();
    if (['completed', 'succeeded', 'success'].includes(status)) {
      const url = data.outputs?.[0] || data.url || data.output?.url;
      if (!url) throw new Error('O render terminou, mas nenhuma imagem foi retornada.');
      return url;
    }
    if (['failed', 'error'].includes(status)) {
      throw new Error(data.error || 'O provedor informou falha no render.');
    }
  }
  throw new Error('O render demorou demais. Tente novamente.');
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-white/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-lime-300/60"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} className="bg-neutral-900">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompareSlider({ before, after }) {
  const [position, setPosition] = useState(50);
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black select-none">
      <img src={after} alt="Render gerado" className="block w-full" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img src={before} alt="Modelo original" className="h-full w-full object-cover" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-lime-300" style={{ left: `${position}%` }} />
      <span className="absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-xs">Modelo</span>
      <span className="absolute right-3 top-3 rounded bg-black/70 px-2 py-1 text-xs">Render</span>
      <input
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-label="Comparar modelo e render"
        className="absolute inset-x-0 bottom-3 mx-auto w-2/3 accent-lime-300"
      />
    </div>
  );
}

export default function RenderStudio() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [scene, setScene] = useState(SCENE_TYPES[0].id);
  const [style, setStyle] = useState(STYLES[0].id);
  const [time, setTime] = useState(TIMES_OF_DAY[0].id);
  const [ambience, setAmbience] = useState(AMBIENCE[0].id);
  const [notes, setNotes] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('2k');
  const [providers, setProviders] = useState({ huggingface: false, muapi: false });
  const [provider, setProvider] = useState('huggingface');
  const [status, setStatus] = useState('idle'); // idle | rendering | done | error
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]); // { url, before, model, settings }
  const [selected, setSelected] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch('/api/render/', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const p = data?.providers || {};
        setProviders(p);
        if (!p.huggingface && p.muapi) setProvider('muapi');
      })
      .catch(() => {});
  }, []);

  const pickFile = useCallback((picked) => {
    if (!picked) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(picked.type)) {
      setError('Use uma captura em PNG, JPG ou WEBP.');
      return;
    }
    if (picked.size > 10 * 1024 * 1024) {
      setError('Imagem muito grande (máximo 10 MB).');
      return;
    }
    setError(null);
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }, []);

  const handleRender = async () => {
    if (!file) {
      setError('Envie primeiro uma captura do seu modelo 3D.');
      return;
    }
    setStatus('rendering');
    setError(null);

    const form = new FormData();
    form.append('file', file);
    form.append('provider', provider);
    form.append('scene', scene);
    form.append('style', style);
    form.append('time', time);
    form.append('ambience', ambience);
    form.append('notes', notes);
    form.append('aspectRatio', aspectRatio);
    form.append('resolution', resolution);

    try {
      const res = await fetch('/api/render/', { method: 'POST', body: form });
      const contentType = res.headers.get('content-type') || '';
      let url;
      let model;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Falha no render (${res.status})`);
      }

      if (contentType.startsWith('image/')) {
        url = URL.createObjectURL(await res.blob());
        model = res.headers.get('x-render-model') || 'Hugging Face';
      } else {
        const data = await res.json();
        model = data.model;
        url = data.url || (data.request_id ? await pollMuapiJob(data.request_id) : null);
        if (!url) throw new Error('Nenhuma imagem foi retornada.');
      }

      setResults((prev) => [{ url, before: preview, model, settings: { scene, style, time } }, ...prev]);
      setSelected(0);
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const current = results[selected];
  const noProvider = !providers.huggingface && !providers.muapi;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div>
          <h2 className="text-xl font-bold">Render Studio</h2>
          <p className="mt-1 text-sm text-white/60">
            Envie uma captura de tela do seu modelo (SketchUp, Revit, Archicad, Blender…) e gere um render realista
            mantendo a mesma geometria e ângulo de câmera.
          </p>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-40 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition ${
            dragOver ? 'border-lime-300 bg-lime-300/10' : 'border-white/15 hover:border-white/30'
          }`}
        >
          {preview ? (
            <img src={preview} alt="Captura do modelo" className="max-h-56 w-full object-contain" />
          ) : (
            <div className="p-6 text-center text-sm text-white/60">
              <div className="mb-1 font-medium text-white">Arraste a captura do modelo aqui</div>
              ou clique para escolher (PNG, JPG, WEBP até 10 MB)
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Tipo de cena" value={scene} onChange={setScene} options={SCENE_TYPES} />
          <Select label="Estilo" value={style} onChange={setStyle} options={STYLES} />
          <Select label="Iluminação" value={time} onChange={setTime} options={TIMES_OF_DAY} />
          <Select label="Ambientação" value={ambience} onChange={setAmbience} options={AMBIENCE} />
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-white/60">Materiais e detalhes (opcional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={800}
            rows={3}
            placeholder="Ex.: piso de porcelanato cinza claro, parede de concreto aparente, marcenaria em freijó, bancada de mármore branco"
            className="resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:border-lime-300/60"
          />
        </label>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1.5 text-white/60">Provedor</legend>
          <label className={`flex items-start gap-2 ${providers.huggingface ? '' : 'opacity-50'}`}>
            <input
              type="radio"
              name="provider"
              value="huggingface"
              checked={provider === 'huggingface'}
              disabled={!providers.huggingface}
              onChange={() => setProvider('huggingface')}
              className="mt-1 accent-lime-300"
            />
            <span>
              Hugging Face <span className="text-lime-300">(gratuito)</span>
              <span className="block text-xs text-white/50">
                Usa os créditos mensais grátis da sua conta. Poucos renders por mês.
              </span>
            </span>
          </label>
          <label className={`flex items-start gap-2 ${providers.muapi ? '' : 'opacity-50'}`}>
            <input
              type="radio"
              name="provider"
              value="muapi"
              checked={provider === 'muapi'}
              disabled={!providers.muapi}
              onChange={() => setProvider('muapi')}
              className="mt-1 accent-lime-300"
            />
            <span>
              Muapi · Nano Banana Pro <span className="text-white/50">(pago)</span>
              <span className="block text-xs text-white/50">Mais fiel ao projeto, até 4K.</span>
            </span>
          </label>
        </fieldset>

        {provider === 'muapi' && (
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Proporção"
              value={aspectRatio}
              onChange={setAspectRatio}
              options={ASPECT_RATIOS.map((r) => ({ id: r, label: r }))}
            />
            <Select label="Resolução" value={resolution} onChange={setResolution} options={RESOLUTIONS} />
          </div>
        )}

        {noProvider && (
          <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
            Nenhuma chave configurada no servidor. Defina HUGGINGFACE_API_KEY (grátis) ou MUAPI_API_KEY no
            .env.local ou nas variáveis de ambiente da Vercel.
          </p>
        )}

        <button
          type="button"
          onClick={handleRender}
          disabled={status === 'rendering' || !file || noProvider}
          className="rounded-xl bg-lime-300 px-4 py-3 font-semibold text-black transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'rendering' ? 'Renderizando…' : 'Renderizar'}
        </button>

        {error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}
      </aside>

      <section className="flex min-h-[420px] flex-col gap-4">
        {status === 'rendering' && !current && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 text-white/60">
            Renderizando… isso pode levar de 20 segundos a 2 minutos.
          </div>
        )}

        {!current && status !== 'rendering' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 p-8 text-center text-white/50">
            <div className="text-lg text-white/80">Seu render aparece aqui</div>
            <p className="max-w-md text-sm">
              Dica: exporte a vista com sombras ligadas, sem eixos ou grades na tela, e com a câmera já na
              posição final. Quanto mais limpa a captura, mais fiel fica o render.
            </p>
          </div>
        )}

        {current && (
          <>
            <CompareSlider before={current.before} after={current.url} />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-white/50">Modelo de IA: {current.model}</span>
              <a
                href={current.url}
                download={`render-${Date.now()}.png`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/15 px-3 py-1.5 hover:border-lime-300 hover:text-lime-300"
              >
                Baixar render
              </a>
            </div>
          </>
        )}

        {results.length > 1 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {results.map((r, i) => (
              <button
                key={r.url}
                type="button"
                onClick={() => setSelected(i)}
                className={`h-20 w-32 shrink-0 overflow-hidden rounded-lg border ${
                  i === selected ? 'border-lime-300' : 'border-white/10'
                }`}
              >
                <img src={r.url} alt={`Render ${results.length - i}`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
