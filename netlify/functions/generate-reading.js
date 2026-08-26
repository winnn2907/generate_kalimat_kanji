// netlify/functions/generate-reading.js
//
// Menerima daftar kata (kanji+yomi) & mode bab dari frontend, meneruskan
// permintaan ke Gemini API menggunakan API key milik pengguna (BYOK — key
// dikirim dari browser, TIDAK disimpan di server / environment variable).

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = event.headers["x-gemini-key"];
  if (!apiKey) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "API key Gemini tidak ditemukan di header." }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Body request tidak valid." }) };
  }

  const { requiredWords, knownVocabulary, mode, bookLabel, chapterLabel } = payload;
  if (!Array.isArray(requiredWords) || requiredWords.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Daftar kata wajib kosong." }) };
  }
  const known = Array.isArray(knownVocabulary) ? knownVocabulary : [];

  const isShort = mode === "short";
  const lengthInstruction = isShort
    ? "Buat HANYA 1-2 kalimat pendek dan natural."
    : "Buat 1-2 paragraf pendek yang natural dan mengalir (bukan sekadar kumpulan kalimat lepas).";

  const requiredList = requiredWords.map((w) => `${w.kata}(${w.yomi})`).join("、");
  const knownList = known.map((w) => `${w.kata}(${w.yomi})`).join("、");

  const prompt = `Kamu adalah penulis materi bacaan Bahasa Jepang level pemula (JLPT N5-N4), mengikuti gaya buku ajar "Irodori".

DAFTAR KATA WAJIB DIPAKAI SEMUA (kanji beserta cara baca aslinya; boleh dikonjugasikan sesuai konteks kalimat — bentuk masu/te/ta/kamus/nai dsb — asalkan kanjinya tetap kanji yang sama). SETIAP kata di daftar ini HARUS muncul minimal sekali di bacaan:
${requiredList}
${known.length > 0 ? `
KOSAKATA YANG SUDAH DIPELAJARI SEBELUMNYA (opsional — pakai HANYA jika natural dibutuhkan untuk merangkai kalimat yang mengalir; TIDAK wajib semuanya muncul. TAPI, jika salah satu kata berikut atau bentuk konjugasinya memang kamu pakai dalam kalimat, WAJIB ditulis dengan kanji yang sesuai, JANGAN ditulis hiragana biasa, karena pelajar sudah pernah mempelajarinya):
${knownList}
` : ''}
ATURAN PENTING:
1. ${lengthInstruction}
2. Kanji HANYA boleh dari dua daftar di atas (wajib + sudah dipelajari). Kata lain (partikel, kata bantu, kata ganti umum di luar kedua daftar) pakai hiragana/katakana biasa TANPA kanji tambahan.
3. Konteksnya untuk pelajar level "${bookLabel} ${chapterLabel}" — jaga agar tata bahasa & kosakata di luar kedua daftar tetap level pemula.
4. Keluarkan HASIL dalam format JSON PERSIS seperti skema berikut, tanpa teks lain di luar JSON:

{
  "readingHtml": "kalimat Jepang dalam HTML, SETIAP kemunculan kanji dari kedua daftar di atas dibungkus <ruby>KANJI<rt>BACAAN</rt></ruby> (hanya bagian kanji-nya, bukan okurigana/akhiran), sisanya teks biasa",
  "translationKey": "terjemahan Bahasa Indonesia yang natural dan akurat dari seluruh bacaan tersebut"
}`;

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: "application/json",
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || "Gagal menghubungi Gemini API.";
      return { statusCode: res.status, body: JSON.stringify({ error: msg }) };
    }

    const rawText =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!rawText) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Respons Gemini kosong atau tidak sesuai format." }),
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Gagal mem-parsing JSON dari Gemini.", raw: rawText }),
      };
    }

    if (!parsed.readingHtml || !parsed.translationKey) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Format JSON dari Gemini tidak lengkap.", raw: parsed }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        readingHtml: parsed.readingHtml,
        translationKey: parsed.translationKey,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Kesalahan server: " + err.message }),
    };
  }
};
