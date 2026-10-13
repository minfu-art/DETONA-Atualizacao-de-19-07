"""Generate review candidates for USB questions; never approves or publishes them."""

import argparse
import collections
import json
import math
import pathlib
import re
import unicodedata
from datetime import date

import openpyxl


ROOT = pathlib.Path(__file__).resolve().parents[1]
COURSE = ROOT / "course-drafts" / "prf-pre-edital"
MAP_FILE = COURSE / "master-microknowledge-map-v2.draft.json"
OUTPUT = COURSE / "usb-review" / "microknowledge-link-candidates.v1.json"
CORRECTIONS = COURSE / "usb-review" / "usb-answer-corrections.json"
DISCIPLINES = {
    "Carreira PRF": "Legislação Especial",
    "Código de Trânsito Brasileiro": "Legislação de Trânsito",
    "Direito Administrativo": "Direito Administrativo",
    "Direito Constitucional": "Direito Constitucional",
    "Direito Penal": "Direito Penal",
    "Direito Processual Penal": "Direito Processual Penal",
    "Direitos Humanos": "Direitos Humanos",
    "Estatuto da Criança e do Adolescente": "Legislação Especial",
    "Ética e Cidadania": "Ética e Cidadania",
    "Física": "Física",
    "Geopolítica": "Geopolítica",
    "Informática": "Informática",
    "Legislação Penal Especial": "Legislação Especial",
    "Legislação de Trânsito e CONTRAN": "Legislação de Trânsito",
    "Língua Portuguesa": "Língua Portuguesa",
    "Raciocínio Lógico-Matemático": "Raciocínio Lógico-Matemático",
}
STOP = set("a o as os de da do das dos e em na no nas nos para por com sem um uma uns umas que se ao aos como sobre entre sua seu suas seus ser ter ha sao nao mais menos qual quais quando onde caso item questao julgue considere afirmacao alternativa correta incorreta acordo seguinte seguintes respeito relacao hipotetica hipotetico direito lei artigo art capitulo norma normas texto".split())
VISUAL_REFERENCE = re.compile(
    r"\b(?:figuras?|imagens?|gr[aá]ficos?|tabelas?|diagramas?|mapas?|ilustra[cç][oõ]es|ilustra[cç][aã]o)\s+"
    r"(?:acima|abaixo|a seguir|seguinte|apresentad[ao]|representad[ao])", re.IGNORECASE)
ANSWER_LEAK = re.compile(
    r"\b(?:resposta|respostas|gabarito)\s*:\s*(?:item\s+)?"
    r"(?:correto|incorreto|certo|errado|[A-E]\b)", re.IGNORECASE)


def normalized(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(ch for ch in value if not unicodedata.combining(ch)).lower()


def terms(value):
    return {token for token in re.findall(r"[a-z0-9]{3,}", normalized(value)) if token not in STOP}


def rows(sheet):
    iterator = sheet.values
    headers = next(iterator)
    for values in iterator:
        if values[0] is not None:
            yield dict(zip(headers, values))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=pathlib.Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    files = sorted(source.glob("DETONA_BANCO_PRF_*.xlsx"))
    if len(files) != 16:
        raise SystemExit(f"Expected 16 USB workbooks; found {len(files)}")
    master = json.loads(MAP_FILE.read_text(encoding="utf-8"))
    corrected_answers = {item["id"]: item["corrected"] for item in
                         json.loads(CORRECTIONS.read_text(encoding="utf-8"))["corrections"]}
    catalog = []
    for subtopic in master["subtopics"]:
        for micro in subtopic["microknowledges"]:
            catalog.append({
                "id": micro["id"], "subtopic_id": subtopic["subtopic_id"],
                "discipline": subtopic["discipline"], "title": micro["title"],
                "title_terms": terms(micro["title"]),
                "subtopic_terms": terms(subtopic["subtopic"]),
                "status": micro["status"],
                "retified_scope": (subtopic.get("contran_index_evidence") or {}).get("retified_2021_scope"),
            })
    by_discipline = collections.defaultdict(list)
    for micro in catalog:
        by_discipline[micro["discipline"]].append(micro)
    idf = {}
    for discipline, micros in by_discipline.items():
        document_frequency = collections.Counter(token for micro in micros for token in micro["title_terms"])
        idf[discipline] = {token: math.log((len(micros) + 1) / (count + 1)) + 1
                           for token, count in document_frequency.items()}

    links = []
    for file in files:
        book = openpyxl.load_workbook(file, read_only=True, data_only=True)
        for row in rows(book["QUESTOES"]):
            source_discipline = str(row.get("disciplina") or "")
            discipline = DISCIPLINES.get(source_discipline)
            if not discipline:
                raise SystemExit(f"Unknown source discipline: {source_discipline}")
            qid = str(row["id_questao"])
            answer = corrected_answers.get(qid, str(row.get("gabarito_normalizado") or "").strip().upper())
            question_text = str(row.get("enunciado") or "")
            if row.get("tipo") == "multipla_escolha" and answer in "ABCDE":
                question_text += " " + str(row.get("alternativa_" + answer) or "")
            question_terms = terms(question_text)
            statement = str(row.get("enunciado") or "")
            flags = []
            if VISUAL_REFERENCE.search(statement) and not str(row.get("imagem_tabela_diagrama_referenciada") or "").strip():
                flags.append("visual_reference_without_attachment")
            if "Resposta: ." in statement:
                flags.append("truncated_answer_marker")
            if ANSWER_LEAK.search(statement):
                flags.append("answer_leaked_in_statement")
            if qid in corrected_answers:
                flags.append("answer_conflict_requires_independent_verification")
            scored = []
            for micro in by_discipline[discipline]:
                matched_title = question_terms & micro["title_terms"]
                matched_subtopic = question_terms & micro["subtopic_terms"]
                score = sum(idf[discipline][token] for token in matched_title)
                score += 0.35 * len(matched_subtopic)
                if score > 0:
                    scored.append((score, len(matched_title), micro))
            scored.sort(key=lambda item: (-item[0], -item[1], item[2]["id"]))
            candidates = [{
                "microknowledge_id": micro["id"], "subtopic_id": micro["subtopic_id"],
                "title": micro["title"], "microknowledge_status": micro["status"],
                "score": round(score, 3), "matched_title_terms": overlap,
                "retified_2021_scope": micro["retified_scope"],
            } for score, overlap, micro in scored[:3]]
            top = candidates[0] if candidates else None
            second = candidates[1] if len(candidates) > 1 else None
            # A score only prioritizes review. Even a strong lexical match is not approval.
            evidence_class = "high_lexical_overlap_only" if (top and top["matched_title_terms"] >= 3
                and top["score"] >= 6 and (not second or top["score"] - second["score"] >= 2)) else (
                "weak_or_ambiguous_candidate" if top else "no_lexical_candidate")
            links.append({
                "id": qid, "source_file": file.name,
                "source_discipline": source_discipline,
                "canonical_discipline_candidate": discipline,
                "source_pdf": str(row.get("arquivo_origem") or ""),
                "evidence_class": evidence_class, "candidates": candidates,
                "blocking_flags": flags,
                "assigned_microknowledge_id": None,
                "status": "requires_individual_editorial_mapping",
            })
        book.close()
    if len(links) != 6674 or len({item["id"] for item in links}) != len(links):
        raise SystemExit("USB question totals or IDs changed")
    summary = dict(collections.Counter(item["evidence_class"] for item in links))
    summary.update(collections.Counter(flag for item in links for flag in item["blocking_flags"]))
    result = {
        "schema_version": "prf_usb_microknowledge_link_candidates_v1",
        "generated_on": date.today().isoformat(), "contest_id": "prf_2026",
        "source_root": str(source), "question_count": len(links),
        "map_file": "../master-microknowledge-map-v2.draft.json",
        "note": "Lexical candidates only. No question is assigned, approved, imported, or published.",
        "summary": summary, "questions": links,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
