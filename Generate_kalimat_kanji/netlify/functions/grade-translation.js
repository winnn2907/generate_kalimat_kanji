// netlify/functions/grade-translation.js
//
// Menerima bacaan asli + kunci terjemahan + terjemahan pengguna, minta Gemini
// menilai akurasinya. Key Gemini dikirim dari browser (BYOK), sama seperti
// generate-reading.js — tidak disimpan di server.

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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

  const { readingPlainText, translationKey, userTranslation } = payload;
  if (!readingPlainText || !translationKey || !userTranslation) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Data tidak lengkap (bacaan/kunci/terjemahan pengguna)." }),
    };
  }

  const prompt = `Kamu adalah pengajar Bahasa Jepang yang menilai terjemahan pelajar dari Jepang ke Indonesia.

TEKS JEPANG ASLI:
${readingPlainText}

KUNCI TERJEMAHAN ACUAN (Bahasa Indonesia):
${translationKey}

TERJEMAHAN PELAJAR (Bahasa Indonesia):
${userTranslation}

Nilai seberapa akurat terjemahan pelajar dibanding makna teks asli (bukan dibanding kata-per-kata kunci acuan — fokus pada ketepatan makna). Beri skor 0-100. Beri ulasan singkat (2-3 kalimat) yang membangun: apresiasi bagian yang sudah benar, lalu sebutkan bagian yang kurang tepat dan kenapa (jika ada).

Keluarkan HASIL dalam format JSON PERSIS seperti skema berikut, tanpa teks lain di luar JSON:
{
  "score": <angka 0-100>,
  "review": "ulasan singkat dalam Bahasa Indonesia"
}`;

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
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

    if (typeof parsed.score !== "number" || !parsed.review) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Format JSON dari Gemini tidak lengkap.", raw: parsed }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ score: parsed.score, review: parsed.review }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Kesalahan server: " + err.message }),
    };
  }
};
