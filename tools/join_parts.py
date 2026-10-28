"""AZ MUSIC admin katta fayllarni bo'laklab yuboradi: <fayl>.part-001-of-004 ...
Bu skript to'liq yig'ilgan bo'laklar to'plamini asl faylga birlashtiradi va bo'laklarni o'chiradi.
(AZ-Beats tools/build_catalog.py dagi assemble_parts bilan bir xil mantiq.)"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ["music", "media"]
PART = re.compile(r"^(.*)\.part-(\d+)-of-(\d+)$")


def main():
    sets = {}
    for d in DIRS:
        base_dir = os.path.join(ROOT, d)
        if not os.path.isdir(base_dir):
            continue
        for dirpath, _, names in os.walk(base_dir):
            for name in names:
                m = PART.match(name)
                if m:
                    key = (dirpath, m.group(1), int(m.group(3)))
                    sets.setdefault(key, {})[int(m.group(2))] = os.path.join(dirpath, name)
    joined = 0
    for (dirpath, base, total), parts in sets.items():
        if set(parts) != set(range(1, total + 1)):
            print(f"Bo'laklar hali to'liq emas: {base} {len(parts)}/{total}")
            continue
        target = os.path.join(dirpath, base)
        with open(target, "wb") as out:
            for i in range(1, total + 1):
                with open(parts[i], "rb") as f:
                    out.write(f.read())
        for p in parts.values():
            os.remove(p)
        for (d2, b2, t2), p2 in sets.items():
            if d2 == dirpath and b2 == base and t2 != total:
                for q in p2.values():
                    if os.path.exists(q):
                        os.remove(q)
        size = os.path.getsize(target) / 1048576
        print(f"Yig'ildi: {os.path.relpath(target, ROOT)} ({total} bo'lak, {size:.2f} MB)")
        joined += 1
    print(f"Jami yig'ilgan fayl: {joined}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
