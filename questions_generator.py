#!/usr/bin/env python3
"""
questions_generator.py — Ekspor bank soal matematika ke JSON.

Contoh:
    python questions_generator.py                 # 25 soal per topik -> questions_bank.json
    python questions_generator.py -n 50 -o bank.json --seed 42

Format tiap soal:
    {"id", "topic", "question", "options": [4 angka], "answer": angka}
"""
import argparse
import json
import random


def make_options(answer):
    """1 jawaban benar + 3 pengecoh unik di sekitar jawaban, lalu diacak."""
    opts = {answer}
    while len(opts) < 4:
        c = answer + random.randint(-10, 10)
        if c != answer and (answer < 0 or c >= 0):
            opts.add(c)
    opts = list(opts)
    random.shuffle(opts)
    return opts


def gen_aritmetika():
    t = random.randint(1, 3)
    if t == 1:
        a, b, c = random.randint(2, 12), random.randint(2, 12), random.randint(1, 30)
        return f"{a} × {b} + {c} = ?", a * b + c
    if t == 2:
        a, b, c = random.randint(5, 40), random.randint(2, 9), random.randint(2, 9)
        return f"({a} + {b}) × {c} = ?", (a + b) * c
    a, b, c = random.randint(50, 150), random.randint(10, 49), random.randint(2, 9)
    return f"{a} − {b} + {c} = ?", a - b + c


def gen_modulo():
    if random.randint(1, 2) == 1:
        b, a = random.randint(3, 9), random.randint(10, 99)
        return f"{a} mod {b} = ?", a % b
    a, b, m = random.randint(5, 40), random.randint(5, 40), random.randint(3, 9)
    return f"({a} + {b}) mod {m} = ?", (a + b) % m


def gen_aljabar():
    x, a, b = random.randint(1, 12), random.randint(2, 9), random.randint(1, 20)
    if random.random() < 0.5:
        return f"Jika {a}x + {b} = {a * x + b}, maka x = ?", x
    return f"Jika {a}x − {b} = {a * x - b}, maka x = ?", x


def gen_eksponen():
    t = random.randint(1, 3)
    if t == 1:
        b, n = random.randint(2, 9), random.randint(2, 3)
        return f"{b}^{n} = ?", b ** n
    if t == 2:
        b, n = random.randint(2, 5), random.randint(2, 5)
        return f"Jika {b}^n = {b ** n}, maka n = ?", n
    b, m, n = random.randint(2, 9), random.randint(1, 6), random.randint(1, 6)
    return f"{b}^{m} × {b}^{n} = {b}^?", m + n


GENERATORS = {
    "Aritmetika": gen_aritmetika,
    "Modulo": gen_modulo,
    "Aljabar Sederhana": gen_aljabar,
    "Eksponen": gen_eksponen,
}


def build_bank(per_topic):
    """Membangun bank soal unik (tanpa pertanyaan duplikat) untuk semua topik."""
    bank, seen, next_id = [], set(), 1
    for topic, gen in GENERATORS.items():
        count, attempts = 0, 0
        while count < per_topic and attempts < per_topic * 50:
            attempts += 1
            question, answer = gen()
            if question in seen:
                continue
            seen.add(question)
            bank.append({
                "id": next_id,
                "topic": topic,
                "question": question,
                "options": make_options(answer),
                "answer": answer,
            })
            next_id += 1
            count += 1
    return bank


def main():
    parser = argparse.ArgumentParser(description="Generator bank soal matematika (JSON).")
    parser.add_argument("-n", "--per-topic", type=int, default=25, help="jumlah soal per topik")
    parser.add_argument("-o", "--output", default="questions_bank.json", help="nama berkas keluaran")
    parser.add_argument("--seed", type=int, default=None, help="seed acak (agar hasil dapat diulang)")
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    bank = build_bank(args.per_topic)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(bank, f, ensure_ascii=False, indent=2)
    print(f"Berhasil membuat {len(bank)} soal -> {args.output}")


if __name__ == "__main__":
    main()