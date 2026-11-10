/* =====================================================================
 * questions.js — Bank soal & generator persamaan matematika otomatis
 * Topik: Aritmetika, Modulo, Aljabar Sederhana, Eksponen
 * API: MathQuestions.getQuestion(topic?) -> {topic, question, answer, options[]}
 * ===================================================================== */
const MathQuestions = (() => {
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[rnd(0, arr.length - 1)];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rnd(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Membuat 4 pilihan unik: 1 jawaban benar + 3 pengecoh di sekitar jawaban. */
  function makeOptions(answer) {
    const set = new Set([answer]);
    while (set.size < 4) {
      const c = answer + rnd(-10, 10);
      if (c !== answer && (answer < 0 || c >= 0)) set.add(c);
    }
    return shuffle([...set]);
  }

  /* ---------- Generator per topik ---------- */
  const generators = {
    Aritmetika() {
      const t = rnd(1, 3);
      if (t === 1) { const a = rnd(2, 12), b = rnd(2, 12), c = rnd(1, 30); return { question: `${a} × ${b} + ${c} = ?`, answer: a * b + c }; }
      if (t === 2) { const a = rnd(5, 40), b = rnd(2, 9), c = rnd(2, 9); return { question: `(${a} + ${b}) × ${c} = ?`, answer: (a + b) * c }; }
      const a = rnd(50, 150), b = rnd(10, 49), c = rnd(2, 9);
      return { question: `${a} − ${b} + ${c} = ?`, answer: a - b + c };
    },

    Modulo() {
      const t = rnd(1, 2);
      if (t === 1) { const b = rnd(3, 9), a = rnd(10, 99); return { question: `${a} mod ${b} = ?`, answer: a % b }; }
      const a = rnd(5, 40), b = rnd(5, 40), m = rnd(3, 9);
      return { question: `(${a} + ${b}) mod ${m} = ?`, answer: (a + b) % m };
    },

    'Aljabar Sederhana'() {
      const x = rnd(1, 12), a = rnd(2, 9), b = rnd(1, 20);
      if (rnd(0, 1)) return { question: `Jika ${a}x + ${b} = ${a * x + b}, maka x = ?`, answer: x };
      return { question: `Jika ${a}x − ${b} = ${a * x - b}, maka x = ?`, answer: x };
    },

    Eksponen() {
      const t = rnd(1, 3);
      if (t === 1) { const b = rnd(2, 9), n = rnd(2, 3); return { question: `${b}^${n} = ?`, answer: Math.pow(b, n) }; }
      if (t === 2) { const b = rnd(2, 5), n = rnd(2, 5); return { question: `Jika ${b}^n = ${Math.pow(b, n)}, maka n = ?`, answer: n }; }
      const b = rnd(2, 9), m = rnd(1, 6), n = rnd(1, 6);
      return { question: `${b}^${m} × ${b}^${n} = ${b}^?`, answer: m + n };
    },
  };

  const topics = Object.keys(generators);
  let externalBank = [];   // bank soal opsional dari questions_generator.py
  let lastText = '';

  /** Membuat satu soal baru (topik acak jika tidak ditentukan), hindari soal sama berturut-turut. */
  function generate(topic) {
    let item, name;
    do {
      name = topic || pick(topics);
      item = generators[name]();
    } while (item.question === lastText);
    lastText = item.question;
    return { topic: name, question: item.question, answer: item.answer, options: makeOptions(item.answer) };
  }

  /** Mengambil soal: 50% dari bank JSON eksternal (jika ada), selebihnya dibangkitkan otomatis. */
  function getQuestion(topic) {
    if (externalBank.length && Math.random() < 0.5) {
      const pool = topic ? externalBank.filter((q) => q.topic === topic) : externalBank;
      if (pool.length) {
        const q = pick(pool);
        return { topic: q.topic, question: q.question, answer: q.answer, options: shuffle([...q.options]) };
      }
    }
    return generate(topic);
  }

  /** Memuat bank soal dari array (hasil questions_bank.json). */
  function loadBank(arr) {
    externalBank = Array.isArray(arr) ? arr : [];
    return externalBank.length;
  }

  /** Memuat bank dari URL (butuh server lokal, mis. `python -m http.server`). */
  async function loadBankFromUrl(url = 'questions_bank.json') {
    try {
      const res = await fetch(url);
      return loadBank(await res.json());
    } catch (e) {
      console.warn('Bank soal eksternal tidak dimuat, memakai generator otomatis.', e);
      return 0;
    }
  }

  return { getQuestion, generate, loadBank, loadBankFromUrl, topics };
})();