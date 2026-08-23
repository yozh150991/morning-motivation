#!/usr/bin/env python3
"""
«Ранкова мотивація» — щоденна розсилка web-push о 8:00 (Europe/Warsaw).

Логіка:
  1. Обирає випадково 2–3 цитати за принципом shuffle bag
     (без повторів, поки не вичерпається весь пул; далі — новий цикл).
  2. Записує добірку дня в daily_selections (екран «Сьогодні» та «Історія»).
  3. Надсилає push на всі підписані пристрої; мертві підписки видаляє.

Запуск:
  python send_morning.py            # звичайна ранкова розсилка
  python send_morning.py --test     # тестовий push усім пристроям, без запису в базу
  python send_morning.py --dry-run  # показати, що було б надіслано, нічого не надсилати

Змінні середовища (див. .env.example): SUPABASE_URL, SUPABASE_SERVICE_KEY,
VAPID_PRIVATE_KEY, VAPID_SUBJECT.
"""

import argparse
import json
import os
import random
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
from pywebpush import webpush, WebPushException

TZ = ZoneInfo("Europe/Warsaw")
QUOTES_PER_MORNING = (2, 3)  # щоранку випадково 2 або 3
PUSH_TTL = 6 * 3600          # push актуальний 6 годин


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"Помилка: не задано змінну середовища {name} (див. .env.example)")
    return value


SUPABASE_URL = None
HEADERS = None
VAPID_PRIVATE_KEY = None
VAPID_SUBJECT = None


def init_env():
    global SUPABASE_URL, HEADERS, VAPID_PRIVATE_KEY, VAPID_SUBJECT
    SUPABASE_URL = env("SUPABASE_URL").rstrip("/")
    service_key = env("SUPABASE_SERVICE_KEY")
    VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY")
    VAPID_SUBJECT = env("VAPID_SUBJECT")
    HEADERS = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }


# ── Мінімальний REST-клієнт Supabase ────────────────────────

def rest(method: str, path: str, *, params=None, body=None, prefer=None):
    headers = dict(HEADERS)
    if prefer:
        headers["Prefer"] = prefer
    resp = requests.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers=headers,
        params=params,
        data=json.dumps(body) if body is not None else None,
        timeout=30,
    )
    if not resp.ok:
        sys.exit(f"Supabase {method} {path} → {resp.status_code}: {resp.text[:300]}")
    return resp.json() if resp.text else None


# ── Shuffle bag ─────────────────────────────────────────────

def pick_quotes():
    """Повертає список обраних цитат і оновлює прапорці used у базі."""
    quotes = rest("GET", "quotes", params={"select": "id,text,author,used"})
    if not quotes:
        return []

    n = min(random.choice(QUOTES_PER_MORNING), len(quotes))
    unused = [q for q in quotes if not q["used"]]

    if len(unused) >= n:
        picked = random.sample(unused, n)
    else:
        # Забираємо залишок циклу і починаємо новий
        picked = list(unused)
        rest("PATCH", "quotes", params={"used": "eq.true"}, body={"used": False},
             prefer="return=minimal")
        picked_ids = {q["id"] for q in picked}
        fresh_pool = [q for q in quotes if q["id"] not in picked_ids]
        need = n - len(picked)
        if fresh_pool and need > 0:
            picked += random.sample(fresh_pool, min(need, len(fresh_pool)))
        print(f"Цикл завершено — пул перемішано заново ({len(quotes)} цитат).")

    ids = ",".join(f'"{q["id"]}"' for q in picked)
    rest("PATCH", "quotes", params={"id": f"in.({ids})"}, body={"used": True},
         prefer="return=minimal")

    random.shuffle(picked)
    return [{"text": q["text"], "author": q["author"]} for q in picked]


# ── Push ────────────────────────────────────────────────────

def get_subscriptions():
    return rest("GET", "push_subscriptions", params={"select": "endpoint,p256dh,auth"}) or []


def delete_subscription(endpoint: str):
    rest("DELETE", "push_subscriptions", params={"endpoint": f"eq.{endpoint}"},
         prefer="return=minimal")


def send_to_all(payload: dict) -> tuple[int, int]:
    subs = get_subscriptions()
    if not subs:
        print("Увага: жодного підписаного пристрою. Увімкни сповіщення в застосунку.")
        return 0, 0

    ok = failed = 0
    data = json.dumps(payload, ensure_ascii=False)
    for sub in subs:
        info = {
            "endpoint": sub["endpoint"],
            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
        }
        try:
            webpush(
                subscription_info=info,
                data=data,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
                ttl=PUSH_TTL,
            )
            ok += 1
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):
                print(f"Підписка недійсна ({status}) — видаляю: {sub['endpoint'][:60]}…")
                delete_subscription(sub["endpoint"])
            else:
                print(f"Не надіслано ({status}): {e}")
                failed += 1
    return ok, failed


# ── Сценарії ────────────────────────────────────────────────

def run_morning(dry_run: bool = False):
    today = datetime.now(TZ).date().isoformat()
    picked = pick_quotes() if not dry_run else preview_pick()

    if not picked:
        print("Пул цитат порожній — надсилаю нагадування.")
        payload = {
            "title": "Ранкова мотивація ☀️",
            "body": "Пул цитат порожній. Додай нові в застосунку — і завтра вони прийдуть.",
            "date": today,
        }
    else:
        for q in picked:
            author = f" — {q['author']}" if q.get("author") else ""
            print(f"  • {q['text'][:80]}{author}")
        if not dry_run:
            rest(
                "POST",
                "daily_selections",
                body={"day": today, "quotes": picked},
                prefer="resolution=merge-duplicates,return=minimal",
            )
        payload = {"title": "Ранкова мотивація ☀️", "date": today, "quotes": picked}

    if dry_run:
        print("(dry-run: push не надсилається, база не змінюється)")
        return

    ok, failed = send_to_all(payload)
    print(f"Готово: надіслано {ok}, помилок {failed}.")


def preview_pick():
    quotes = rest("GET", "quotes", params={"select": "id,text,author,used"}) or []
    if not quotes:
        return []
    n = min(random.choice(QUOTES_PER_MORNING), len(quotes))
    unused = [q for q in quotes if not q["used"]] or quotes
    picked = random.sample(unused, min(n, len(unused)))
    return [{"text": q["text"], "author": q["author"]} for q in picked]


def run_test():
    payload = {
        "title": "Тест ✅",
        "body": "Push із сервера працює. Ранкова добірка приходитиме о 8:00.",
    }
    ok, failed = send_to_all(payload)
    print(f"Тест: надіслано {ok}, помилок {failed}.")


def main():
    parser = argparse.ArgumentParser(description="Ранкова розсилка мотиваційних цитат")
    parser.add_argument("--test", action="store_true",
                        help="надіслати тестовий push, нічого не змінюючи в базі")
    parser.add_argument("--dry-run", action="store_true",
                        help="показати добірку без надсилання і без запису в базу")
    args = parser.parse_args()

    init_env()

    if args.test:
        run_test()
    else:
        run_morning(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
