# -*- coding: utf-8 -*-
"""Extrai texto de PDF página a página (JSON no stdout)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print(json.dumps({"error": "Instale pypdf: py -3.12 -m pip install pypdf"}), file=sys.stderr)
    sys.exit(2)


def extract(pdf_path: str, start: int | None = None, end: int | None = None) -> dict:
    path = Path(pdf_path)
    if not path.exists():
        return {"error": f"PDF não encontrado: {pdf_path}"}
    reader = PdfReader(str(path))
    total = len(reader.pages)
    # páginas 1-indexadas
    s = max(1, start or 1)
    e = min(total, end or total)
    if s > e:
        return {"error": f"Intervalo inválido: {s}-{e} (total {total})"}

    pages = []
    for i in range(s - 1, e):
        try:
            text = reader.pages[i].extract_text() or ""
        except Exception as exc:  # noqa: BLE001
            text = f"[erro ao extrair página {i + 1}: {exc}]"
        pages.append({"page": i + 1, "text": text})

    return {
        "file": str(path),
        "name": path.name,
        "totalPages": total,
        "fromPage": s,
        "toPage": e,
        "pages": pages,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: pdfExtract.py <arquivo.pdf> [inicio] [fim]"}), file=sys.stderr)
        return 1
    pdf = sys.argv[1]
    start = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else None
    end = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else None
    result = extract(pdf, start, end)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if "error" not in result else 1


if __name__ == "__main__":
    raise SystemExit(main())
