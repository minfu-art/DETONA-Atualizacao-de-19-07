"""Prepare read-only PRF USB correction and coverage manifests.

Only IDs and audit metadata are exported. Source questions and third-party
explanations stay in the original workbooks until rights and editorial review.
"""

import argparse
import collections
import json
import pathlib
import re
from datetime import date

import openpyxl


ROOT = pathlib.Path(__file__).resolve().parents[1]
COURSE = ROOT / "course-drafts" / "prf-pre-edital" / "course-bundle"
DISCIPLINE_CANDIDATES = {
    "Carreira PRF": ("Direito Administrativo", "candidate_only_mixed_career_content"),
    "Código de Trânsito Brasileiro": ("Legislação de Trânsito", "by_source_discipline"),
    "Direito Administrativo": ("Direito Administrativo", "by_source_discipline"),
    "Direito Constitucional": ("Direito Constitucional", "by_source_discipline"),
    "Direito Penal": ("Direito Penal", "by_source_discipline"),
    "Direito Processual Penal": ("Direito Processual Penal", "by_source_discipline"),
    "Direitos Humanos": ("Direitos Humanos", "by_source_discipline"),
    "Estatuto da Criança e do Adolescente": ("Legislação Especial", "by_source_discipline"),
    "Ética e Cidadania": ("Ética e Cidadania", "by_source_discipline"),
    "Física": ("Física", "by_source_discipline"),
    "Geopolítica": ("Geopolítica", "by_source_discipline"),
    "Informática": ("Informática", "by_source_discipline"),
    "Legislação Penal Especial": ("Legislação Especial", "by_source_discipline"),
    "Legislação de Trânsito e CONTRAN": ("Legislação de Trânsito", "by_source_discipline"),
    "Língua Portuguesa": ("Língua Portuguesa", "by_source_discipline"),
    "Raciocínio Lógico-Matemático": ("Raciocínio Lógico-Matemático", "by_source_discipline"),
}


def sheet_rows(sheet):
    iterator = sheet.values
    headers = next(iterator)
    for values in iterator:
        if values[0] is not None:
            yield dict(zip(headers, values))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    files = sorted(source.glob("DETONA_BANCO_PRF_*.xlsx"))
    if len(files) != 16:
        raise SystemExit(f"Expected 16 source workbooks, found {len(files)}")

    queue = []
    corrections = []
    for file in files:
        book = openpyxl.load_workbook(file, read_only=True, data_only=True)
        comments = {str(row["id_questao"]): str(row.get("comentario_integral_apostila") or "")
                    for row in sheet_rows(book["COMENTARIOS"])}
        for row in sheet_rows(book["QUESTOES"]):
            qid = str(row["id_questao"])
            answer = str(row.get("gabarito_normalizado") or "").strip().upper()
            comment = comments.get(qid, "")
            match = re.search(
                r"(?:alternativa|letra)\s+([A-E])\s+(?:é|e)\s+(?:o\s+)?gabarito\s+da\s+quest[aã]o",
                comment[:700], flags=re.IGNORECASE)
            effective = answer
            if row.get("tipo") == "multipla_escolha" and match and match.group(1).upper() != answer:
                proposed = match.group(1).upper()
                if not str(row.get("alternativa_" + proposed) or "").strip():
                    raise SystemExit(f"Comment points to a missing alternative: {qid}")
                corrections.append({
                    "id": qid, "source_file": file.name, "field": "correct_answer",
                    "original": answer, "corrected": proposed,
                    "evidence": "The linked source comment explicitly identifies the corrected option as the answer.",
                    "legal_check": "CTB art. 47 verified on Planalto" if qid == "PRF-LTC-A01-8460-0039" else "pending_current_official_source_check",
                    "status": "correlation_corrected_not_publication_approved",
                })
                effective = proposed
            queue.append({
                "id": qid, "source_file": file.name, "source_discipline": str(row.get("disciplina") or ""),
                "canonical_discipline_candidate": DISCIPLINE_CANDIDATES[str(row.get("disciplina") or "")][0],
                "discipline_mapping_basis": DISCIPLINE_CANDIDATES[str(row.get("disciplina") or "")][1],
                "source_answer": answer, "effective_answer": effective,
                "source_pdf": str(row.get("arquivo_origem") or ""),
                "microknowledge_id": None,
                "review_status": "requires_mapping_rights_and_editorial_review",
            })
        book.close()
    if len(queue) != 6674 or len({row["id"] for row in queue}) != len(queue):
        raise SystemExit("Source totals or IDs changed; review before preparing batches")
    if len(corrections) != 11:
        raise SystemExit("Expected 11 comment/answer conflicts; review before preparing batches")

    # Keep disciplines separate; no batch is considered importable yet.
    grouped = collections.defaultdict(list)
    for item in queue:
        grouped[item["source_discipline"]].append(item)
    batches = []
    for discipline, items in sorted(grouped.items()):
        for start in range(0, len(items), 20):
            segment = items[start:start + 20]
            batches.append({
                "id": f"usb-{len(batches) + 1:03d}", "discipline": discipline,
                "canonical_discipline_candidate": segment[0]["canonical_discipline_candidate"],
                "discipline_mapping_basis": segment[0]["discipline_mapping_basis"],
                "item_count": len(segment), "question_ids": [item["id"] for item in segment],
                "status": "review_queue", "importable": False, "publishable": False,
                "blocking_checks": ["microknowledge_mapping", "copyright_license_or_authorial_rewrite",
                                    "editorial_and_current_source_review"],
            })

    curriculum = json.loads((COURSE / "curriculum.json").read_text(encoding="utf-8"))
    canonical_disciplines = {discipline["name"] for discipline in curriculum["roles"][0]["disciplines"]}
    if any(item["canonical_discipline_candidate"] not in canonical_disciplines for item in queue):
        raise SystemExit("Source discipline could not be reconciled with the PRF curriculum")
    authorial_files = sorted((COURSE / "questions").glob("*.json"))
    authored_batches = []
    authored = []
    defined_micro = set()
    for file in sorted((COURSE.parent / "production").glob("portuguese-editorial-batch-*.v1.json")):
        package = json.loads(file.read_text(encoding="utf-8"))
        defined_micro.update(micro["id"] for micro in package.get("microknowledges", []))
    for file in authorial_files:
        questions = json.loads(file.read_text(encoding="utf-8"))["questions"]
        if len(questions) != 20:
            raise SystemExit(f"Authorial batch does not contain 20 questions: {file.name}")
        problems = []
        for question in questions:
            if len(question.get("microknowledge_ids", [])) != 1 or question["microknowledge_ids"][0] not in defined_micro:
                problems.append({"id": question["id"], "issue": "missing_or_noncanonical_microknowledge"})
            if question.get("format") != "certo_errado" or question.get("correct_answer") not in ("C", "E"):
                problems.append({"id": question["id"], "issue": "invalid_format_or_answer"})
            if not str(question.get("statement") or "").strip() or not str(question.get("explanation") or "").strip():
                problems.append({"id": question["id"], "issue": "missing_statement_or_explanation"})
        number = int(file.name[:3])
        authored_batches.append({
            "batch": number, "file": file.name, "question_count": len(questions),
            "microknowledge_count": len({m for q in questions for m in q["microknowledge_ids"]}),
            "technical_issues": problems,
            "known_staging_state": "published" if number == 1 else "draft" if number <= 37 else "local_only",
            "next_gate": "already_published" if number == 1 else "human_editorial_review",
        })
        authored.extend(questions)
    if len(authored_batches) != 38 or len(authored) != 760:
        raise SystemExit("Authorial batch totals changed; review before publishing")
    if len({q["id"] for q in authored}) != len(authored):
        raise SystemExit("Duplicate authorial question IDs")
    authored_by_subtopic = collections.Counter(q["subtopic_id"] for q in authored)
    authored_by_micro = collections.Counter(m for q in authored for m in q["microknowledge_ids"])
    coverage = []
    for discipline in curriculum["roles"][0]["disciplines"]:
        for topic in discipline["topics"]:
            for subtopic in topic["subtopics"]:
                coverage.append({
                    "discipline": discipline["name"], "topic": topic["name"],
                    "subtopic_id": subtopic["id"], "subtopic": subtopic["name"],
                    "authored_questions": authored_by_subtopic[subtopic["id"]],
                    "source_question_microknowledge_mapping": "not_available",
                })
    if len(coverage) != 246:
        raise SystemExit("Canonical curriculum changed; review coverage")
    for item in corrections:
        if next(row for row in queue if row["id"] == item["id"])["effective_answer"] != item["corrected"]:
            raise SystemExit(f"Correction was not applied to the review queue: {item['id']}")

    dump(output / "usb-answer-corrections.json", {
        "contest_id": "prf_2026", "generated_on": date.today().isoformat(),
        "note": "Use corrected answer only in a future reviewed import; original source is unchanged.",
        "corrections": corrections,
    })
    dump(output / "usb-review-batches.json", {
        "contest_id": "prf_2026", "source_question_count": len(queue),
        "batch_size_max": 20, "batch_count": len(batches), "batches": batches,
    })
    dump(output / "canonical-subtopic-coverage.json", {
        "contest_id": "prf_2026", "canonical_subtopics": len(coverage),
        "subtopics_with_authored_questions": sum(bool(x["authored_questions"]) for x in coverage),
        "authorial_questions": len(authored), "distinct_authored_microknowledges": len(authored_by_micro),
        "microknowledges_with_3_or_more_questions": sum(count >= 3 for count in authored_by_micro.values()),
        "microknowledges_with_fewer_than_3_questions": sum(count < 3 for count in authored_by_micro.values()),
        "coverage": coverage,
    })
    dump(output / "authorial-batch-readiness.json", {
        "contest_id": "prf_2026", "batch_size": 20,
        "note": "Known staging states are from the 2026-10-13 verification; recheck before import or publication.",
        "batches": authored_batches,
    })
    print(json.dumps({"source_questions": len(queue), "corrections": len(corrections),
                      "review_batches": len(batches), "canonical_subtopics": len(coverage),
                      "subtopics_with_authored_questions": sum(bool(x["authored_questions"]) for x in coverage),
                      "authored_microknowledges": len(authored_by_micro)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
