"""Inventaria o pacote local de PDFs da PRF sem copiar o material-fonte.

O relatório registra rastreabilidade, integridade, cobertura disciplinar e
marcadores de seções de questões. Contagens de questões são apenas sinais de
extração; nenhuma questão é publicada por este script.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pypdfium2 as pdfium


FOLDER_TO_CANONICAL = {
    "portugues": "Língua Portuguesa",
    "raciocinio logico": "Raciocínio Lógico-Matemático",
    "informatica": "Informática",
    "fisica": "Física",
    "etica e cidadania": "Ética e Cidadania",
    "geopolitica": "Geopolítica",
    "codigo de transito": "Legislação de Trânsito",
    "legislacao de transito e contran": "Legislação de Trânsito",
    "direito administrativo": "Direito Administrativo",
    "direito constitucional": "Direito Constitucional",
    "direito penal": "Direito Penal",
    "direito processual penal": "Direito Processual Penal",
    "legislacao penal especial": "Legislação Especial",
    "estatudo da crianca e do adolescente": "Legislação Especial",
    "carreira prf": "Legislação Especial",
    "direitos humanos": "Direitos Humanos",
}

CANONICAL_DISCIPLINES = [
    "Língua Portuguesa",
    "Raciocínio Lógico-Matemático",
    "Informática",
    "Física",
    "Ética e Cidadania",
    "Geopolítica",
    "Língua Estrangeira",
    "Legislação de Trânsito",
    "Direito Administrativo",
    "Direito Constitucional",
    "Direito Penal",
    "Direito Processual Penal",
    "Legislação Especial",
    "Direitos Humanos",
]

SECTION_PATTERNS = {
    "questoes_comentadas": re.compile(r"quest(?:ao|oes)\s+comentad", re.I),
    "lista_de_questoes": re.compile(r"(?:lista|caderno)\s+de\s+quest(?:ao|oes)", re.I),
    "questoes_para_praticar": re.compile(r"quest(?:ao|oes)\s+para\s+(?:praticar|treinar)", re.I),
    "gabarito": re.compile(r"\bgabarito\b", re.I),
    "resumo": re.compile(r"\bresumo\b", re.I),
}

QUESTION_MARKER = re.compile(
    r"(?m)^\s*(?:quest(?:ao|ão)\s*)?(\d{1,4})\s*[.)-]\s+(?:\([^\n]{2,80}\)|[A-ZÁÉÍÓÚ])",
    re.I,
)


def fold(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value))
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn").lower().strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def flatten_outline(items, depth: int = 0, result=None):
    if result is None:
        result = []
    for item in items or []:
        if isinstance(item, list):
            flatten_outline(item, depth + 1, result)
        else:
            title = getattr(item, "title", None)
            if title:
                result.append({"depth": depth, "title": str(title).strip()})
    return result


def title_candidates(text: str) -> list[str]:
    lines = []
    seen = set()
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not 8 <= len(line) <= 180:
            continue
        lowered = fold(line)
        if lowered in seen or re.fullmatch(r"\d+", line):
            continue
        if any(token in lowered for token in ("aula", "sumario", "cronograma", "conteudo", "curso")):
            seen.add(lowered)
            lines.append(line)
        if len(lines) >= 12:
            break
    return lines


def inspect_pdf(path: Path, root: Path) -> dict:
    relative = path.relative_to(root)
    folder = relative.parts[0] if len(relative.parts) > 1 else ""
    canonical = FOLDER_TO_CANONICAL.get(fold(folder))
    record = {
        "source_id": "prf_pdf_" + hashlib.sha1(str(relative).encode("utf-8")).hexdigest()[:12],
        "relative_path": relative.as_posix(),
        "file_name": path.name,
        "source_folder": folder,
        "canonical_discipline": canonical,
        "size_bytes": path.stat().st_size,
        "sha256": sha256(path),
        "status": "pending_editorial_mapping",
        "authority": "secondary_commercial_material",
    }
    try:
        document = pdfium.PdfDocument(str(path))
        total_pages = len(document)
        marker_pages = defaultdict(list)
        marker_counts = Counter()
        characters = 0
        textless_pages = 0
        first_text = []
        question_signals = 0
        extraction_warnings = []

        for index in range(1, total_pages + 1):
            try:
                page = document[index - 1]
                text_page = page.get_textpage()
                text = text_page.get_text_range() or ""
                text_page.close()
                page.close()
            except Exception as error:
                extraction_warnings.append({"page": index, "error": str(error)[:240]})
                text = ""
            compact = re.sub(r"\s+", " ", text).strip()
            characters += len(compact)
            if len(compact) < 40:
                textless_pages += 1
            if index <= 15 and compact:
                first_text.append(text)
            normalized = fold(text)
            for name, pattern in SECTION_PATTERNS.items():
                hits = len(pattern.findall(normalized))
                if hits:
                    marker_counts[name] += hits
                    marker_pages[name].append(index)
            question_signals += len(QUESTION_MARKER.findall(text))

        try:
            outline = [
                {"depth": int(getattr(item, "level", 0)), "title": str(getattr(item, "title", "")).strip()}
                for item in document.get_toc(max_depth=10)
                if str(getattr(item, "title", "")).strip()
            ][:120]
        except Exception:
            outline = []
        metadata = document.get_metadata_dict() or {}
        document.close()
        avg_chars = round(characters / total_pages) if total_pages else 0
        record.update({
            "page_count": total_pages,
            "text_character_count": characters,
            "average_characters_per_page": avg_chars,
            "textless_page_count": textless_pages,
            "likely_scanned": bool(total_pages and textless_pages / total_pages >= 0.7),
            "title": str(metadata.get("Title") or "").strip() or None,
            "author": str(metadata.get("Author") or "").strip() or None,
            "outline": outline,
            "title_candidates": title_candidates("\n".join(first_text)),
            "section_marker_counts": dict(marker_counts),
            "section_marker_pages": {key: pages[:50] for key, pages in marker_pages.items()},
            "question_marker_signal_count": question_signals,
            "extraction_warnings": extraction_warnings[:20],
        })
        if not canonical:
            record["status"] = "blocked_unmapped_discipline"
        elif record["likely_scanned"]:
            record["status"] = "blocked_ocr_required"
        elif path.name in {",.pdf", ".pdf"}:
            record["status"] = "blocked_invalid_filename"
        return record
    except Exception as error:
        record.update({"status": "blocked_unreadable", "error": str(error)[:500]})
        return record


def build_report(root: Path, workers: int = 4) -> dict:
    pdfs = sorted(root.rglob("*.pdf"), key=lambda item: fold(str(item.relative_to(root))))
    sources_by_path = {}
    completed = 0
    with concurrent.futures.ProcessPoolExecutor(max_workers=max(1, workers)) as executor:
        pending = {executor.submit(inspect_pdf, pdf, root): pdf for pdf in pdfs}
        for future in concurrent.futures.as_completed(pending):
            pdf = pending[future]
            completed += 1
            try:
                sources_by_path[pdf] = future.result()
            except Exception as error:
                sources_by_path[pdf] = {
                    "relative_path": pdf.relative_to(root).as_posix(),
                    "file_name": pdf.name,
                    "source_folder": pdf.relative_to(root).parts[0],
                    "canonical_discipline": FOLDER_TO_CANONICAL.get(fold(pdf.relative_to(root).parts[0])),
                    "size_bytes": pdf.stat().st_size,
                    "sha256": sha256(pdf),
                    "status": "blocked_worker_error",
                    "authority": "secondary_commercial_material",
                    "error": str(error)[:500],
                }
            print(f"[{completed:03d}/{len(pdfs):03d}] {pdf.relative_to(root)}", flush=True)
    sources = [sources_by_path[pdf] for pdf in pdfs]

    hashes = defaultdict(list)
    for source in sources:
        hashes[source["sha256"]].append(source["relative_path"])
    duplicate_groups = [paths for paths in hashes.values() if len(paths) > 1]

    per_folder = []
    for folder in sorted({source["source_folder"] for source in sources}, key=fold):
        items = [source for source in sources if source["source_folder"] == folder]
        per_folder.append({
            "source_folder": folder,
            "canonical_discipline": FOLDER_TO_CANONICAL.get(fold(folder)),
            "pdf_count": len(items),
            "page_count": sum(item.get("page_count", 0) for item in items),
            "question_marker_signal_count": sum(item.get("question_marker_signal_count", 0) for item in items),
            "blocked_count": sum(item["status"].startswith("blocked_") for item in items),
        })

    represented = sorted({item["canonical_discipline"] for item in sources if item["canonical_discipline"]}, key=fold)
    return {
        "schema_version": "prf_source_ingestion_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "contest_id": "prf_2026",
        "source_root": str(root),
        "purpose": "Inventário e rastreabilidade para decomposição do Mapa Mestre e ensino por questões",
        "publication_authorized": False,
        "question_generation_authorized": True,
        "summary": {
            "pdf_count": len(sources),
            "size_bytes": sum(item["size_bytes"] for item in sources),
            "page_count": sum(item.get("page_count", 0) for item in sources),
            "question_marker_signal_count": sum(item.get("question_marker_signal_count", 0) for item in sources),
            "blocked_count": sum(item["status"].startswith("blocked_") for item in sources),
            "duplicate_file_groups": len(duplicate_groups),
            "canonical_disciplines_represented": len(represented),
            "canonical_disciplines_total": len(CANONICAL_DISCIPLINES),
            "missing_canonical_disciplines": [name for name in CANONICAL_DISCIPLINES if name not in represented],
        },
        "duplicate_file_groups": duplicate_groups,
        "coverage_by_source_folder": per_folder,
        "sources": sources,
    }


def markdown_summary(report: dict) -> str:
    summary = report["summary"]
    rows = [
        "# Ingestão do acervo PRF - diagnóstico inicial",
        "",
        f"Gerado em `{report['generated_at']}` a partir de `{report['source_root']}`.",
        "",
        "## Resultado",
        "",
        f"- PDFs: {summary['pdf_count']}",
        f"- páginas: {summary['page_count']}",
        f"- disciplinas canônicas representadas: {summary['canonical_disciplines_represented']}/{summary['canonical_disciplines_total']}",
        f"- arquivos bloqueados para tratamento: {summary['blocked_count']}",
        f"- grupos de arquivos duplicados: {summary['duplicate_file_groups']}",
        f"- sinais automáticos de questões: {summary['question_marker_signal_count']} (não equivalem a questões validadas)",
        "",
        "## Cobertura por pasta",
        "",
        "| Pasta-fonte | Disciplina canônica | PDFs | Páginas | Sinais de questões | Bloqueados |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for item in report["coverage_by_source_folder"]:
        rows.append(
            f"| {item['source_folder']} | {item['canonical_discipline'] or 'NÃO MAPEADA'} | "
            f"{item['pdf_count']} | {item['page_count']} | {item['question_marker_signal_count']} | {item['blocked_count']} |"
        )
    rows.extend([
        "",
        "## Lacunas",
        "",
        *[f"- {name}: sem pasta-fonte no pacote." for name in summary["missing_canonical_disciplines"]],
        "",
        "## Regra editorial",
        "",
        "Este diagnóstico autoriza a ingestão e o planejamento de questões, mas não autoriza importação ou publicação. "
        "Materiais comerciais são fontes secundárias; legislação e conteúdo dinâmico exigem reconciliação oficial.",
        "",
    ])
    return "\n".join(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--summary", required=True, type=Path)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        raise SystemExit(f"Pasta não encontrada: {root}")
    report = build_report(root, args.workers)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.summary.write_text(markdown_summary(report), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
