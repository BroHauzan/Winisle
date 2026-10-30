/**
 * Direct Google Gemini API Client for WinIsle Dynamic Island.
 * Supports Multimodal Vision (screenshots/images), Chat History, and Action Intent Detection.
 */

export interface GeminiAssistantParams {
  prompt: string;
  apiKey?: string;
  model?: string;
  image?: {
    data: string; // base64 without prefix
    mimeType: string;
  };
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  currentState?: Record<string, any>;
  signal?: AbortSignal;
}

export interface GeminiAssistantResult {
  reply: string;
  action?: string;
  actionParam?: any;
  trackData?: any;
  searchSources?: Array<{ title: string; url: string }>;
  error?: string;
}

const SYSTEM_INSTRUCTION = `Anda adalah Isle Assistant, AI asisten Dynamic Island untuk sistem operasi Windows.
Karakteristik Anda:
1. Menjawab dengan ringkas, ramah, to-the-point, dan sangat membantu.
2. Selalu gunakan bahasa yang sama dengan pengguna (prioritaskan Bahasa Indonesia yang natural).
3. Jika pengguna melampirkan screenshot atau gambar, analisis isinya secara mendalam namun sampaikan poin-poin intinya dengan jelas.
4. Jangan bertele-tele karena tampilan Dynamic Island mengutamakan efisiensi ruang layar.`;

export async function askGeminiAssistant(
  params: GeminiAssistantParams
): Promise<GeminiAssistantResult> {
  const apiKey = (params.apiKey || '').trim();

  if (!apiKey) {
    return {
      reply:
        'Halo! API Key Gemini belum diatur. Silakan buka menu Pengaturan (ikon gerigi) untuk memasukkan Google Gemini API Key gratis Anda agar saya bisa merespons pertanyaan Anda.',
      error: 'NO_API_KEY',
    };
  }

  const promptText = params.prompt.trim();
  if (!promptText && !params.image) {
    return {
      reply: 'Silakan ketik pertanyaan atau lampirkan gambar/screenshot untuk dianalisis.',
      error: 'EMPTY_PROMPT',
    };
  }

  // Build Gemini contents array with history
  const contents: any[] = [];

  if (Array.isArray(params.history)) {
    for (const h of params.history.slice(-6)) {
      if (!h.text) continue;
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text }],
      });
    }
  }

  // Current user turn
  const userParts: any[] = [];
  if (promptText) {
    userParts.push({ text: promptText });
  }

  if (params.image && params.image.data) {
    userParts.push({
      inlineData: {
        mimeType: params.image.mimeType || 'image/png',
        data: params.image.data,
      },
    });
  }

  contents.push({
    role: 'user',
    parts: userParts,
  });

  // Candidate models sequence starting with gemini-3.1-flash-lite as requested by user
  const candidateModels = params.model
    ? [
        params.model,
        'gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite-preview',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-2.5-flash',
      ]
    : [
        'gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite-preview',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-2.5-flash',
      ];
  const models = Array.from(new Set(candidateModels));
  let lastError = '';

  for (const model of models) {
    if (params.signal?.aborted) {
      return {
        reply: 'Permintaan dibatalkan.',
        error: 'ABORTED',
      };
    }

    // Strict 5-second per-model timeout to eliminate any freezing or hanging
    const modelController = new AbortController();
    const timeoutId = setTimeout(() => {
      modelController.abort();
    }, 5000);

    const abortHandler = () => modelController.abort();
    if (params.signal) {
      params.signal.addEventListener('abort', abortHandler, { once: true });
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: modelController.signal,
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      });

      clearTimeout(timeoutId);
      if (params.signal) {
        params.signal.removeEventListener('abort', abortHandler);
      }

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        const errMsg = errorJson?.error?.message || `HTTP ${res.status}`;
        lastError = errMsg;

        // If rate limit reached, return immediately
        if (res.status === 429) {
          return {
            reply: 'Batas kuota Gemini API tercapai (Rate Limit). Mohon tunggu beberapa detik sebelum mencoba lagi.',
            error: 'RATE_LIMIT',
          };
        }

        // If API key is invalid
        if (res.status === 400 && errMsg.toLowerCase().includes('api key')) {
          return {
            reply: 'API Key Gemini Anda tidak valid. Silakan periksa kembali API Key yang Anda masukkan di menu Pengaturan.',
            error: 'INVALID_API_KEY',
          };
        }

        if (res.status === 403) {
          return {
            reply: `Akses Gemini API ditolak (${errMsg}). Pastikan API Key aktif dan memiliki izin yang sesuai di Google AI Studio.`,
            error: errMsg,
          };
        }

        // If model not found (404) or unsupported in this region/version, try next model
        continue;
      }

      const data = await res.json();
      clearTimeout(timeoutId);

      const candidate = data?.candidates?.[0];
      const replyText =
        candidate?.content?.parts?.map((p: any) => p.text || '').join('') ||
        'Tidak ada respon dari model.';

      // Extract search grounding sources if present
      const sources: Array<{ title: string; url: string }> = [];
      const metadata = candidate?.groundingMetadata;
      if (Array.isArray(metadata?.groundingChunks)) {
        for (const chunk of metadata.groundingChunks) {
          if (chunk?.web?.uri) {
            sources.push({
              title: chunk.web.title || chunk.web.uri,
              url: chunk.web.uri,
            });
          }
        }
      }

      return {
        reply: replyText.trim(),
        searchSources: sources.length > 0 ? sources : undefined,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (params.signal) {
        params.signal.removeEventListener('abort', abortHandler);
      }

      if (params.signal?.aborted) {
        return {
          reply: 'Permintaan dibatalkan.',
          error: 'ABORTED',
        };
      }

      lastError = err?.message || String(err);
      // Timeout or network drop for this specific model, attempt next candidate
      continue;
    }
  }

  return {
    reply: `Maaf, gagal memproses respon AI (${lastError || 'Batas waktu terlampaui'}). Silakan periksa API Key dan koneksi internet Anda.`,
    error: lastError || 'TIMEOUT',
  };
}
