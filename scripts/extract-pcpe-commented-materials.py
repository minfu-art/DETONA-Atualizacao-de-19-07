#!/usr/bin/env python3
"""Extrai questões comentadas dos PDFs fornecidos pelo usuário para rascunhos PC PE."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pdfplumber
from PIL import Image
from pypdf import PdfReader


QUESTION_START = re.compile(
    r"^\s*(?:(?:quest(?:ão|ao)\s*)?(\d{1,3})\s*[.):-]|q\s*[.: -]?\s*(\d{1,3})\s*)\s*"
    r"(?=(?:\(|\[|CESPE\b|CEBRASPE\b|FGV\b|FCC\b|IBFC\b|AOCP\b|VUNESP\b|"
    r"CESGRANRIO\b|QUADRIX\b|IADES\b|FUNDATEC\b|INSTITUTO\b|UPENET\b|IAUPE\b))",
    re.IGNORECASE,
)
WEAK_QUESTION_START = re.compile(
    r"^\s*(?:(\d{1,3})\s*[.)-]|q\s*[.: -]?\s*(\d{1,3})\s*)\s+\S",
    re.I,
)
COMMENT_MARKER = re.compile(r"^\s*coment(?:á|a)rios?\s*:?[ \t]*(.*)$", re.IGNORECASE)
ANSWER_MARKER = re.compile(
    r"gabarito\s*:\s*(?:alternativa\s*|letra\s*)?(certo|correto|errado|[A-E])",
    re.IGNORECASE,
)
OPTION_START = re.compile(r"^\s*(?:\(\s*)?([A-E])(?:\s*\)|[.)-])\s*(.*)$", re.IGNORECASE)
PERSONAL_ID = re.compile(
    r"\b09880248457\b(?:\s*-\s*thallysson\s+gabriel)?|"
    r"\b\d{11}\b\s*-\s*[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){1,3}",
    re.IGNORECASE,
)
CONTENT_NOISE = re.compile(
    r"\b(?:prof\.\s*)?(?:allan\s+maux\s+santana|t[uú]lio\s+lages|marcella\s+mendes|"
    r"diego\s+carvalho|lucas\s+rocha|gustavo\s+augusto|eduardo\s+alberi)\b(?:\s+\d{1,3})?|"
    r"\bformatado\s*:\s*portugu[eê]s\s*\(brasil\)",
    re.IGNORECASE,
)
VISUAL_CUE = re.compile(
    r"\b(?:figuras?|imagens?|gr[aá]ficos?|tabelas?|quadros?|diagramas?|planilhas?|ilustra[cç][õo]es?)\b"
    r"[^.;,\n]{0,25}\b(?:acima|abaixo|a seguir|seguinte|precedent[es]?|apresentad[oa]s?|mostrad[oa]s?)\b|"
    r"\b(?:com base|de acordo)\s+(?:na|no|com a|com o)\s+"
    r"(?:figura|imagem|gr[aá]fico|tabela|quadro|diagrama|planilha)",
    re.IGNORECASE,
)
SECTION_END = re.compile(r"question[aá]rio\s+de\s+revis[aã]o|perguntas\s+com\s+respostas", re.IGNORECASE)
BOILERPLATE = re.compile(
    r"nesta se[cç][aã]o, apresentamos|www\.estrategiaconcursos\.com\.br|"
    r"passo estrat[eé]gico|a ideia, aqui, n[aã]o [eé] que voc[eê] fixe",
    re.IGNORECASE,
)
QUESTION_BODY_START = re.compile(
    r"^(?:acerca\b|assinale\b|considerando\b|com\s+rela[cç][aã]o\b|de\s+acordo\b|"
    r"julgue\b|no\s+que\b|o\s+princ[ií]pio\b|a\s+respeito\b|[àa]\s+luz\b|"
    r"analise\b|avalie\b|em\s+rela[cç][aã]o\b|quanto\b)",
    re.IGNORECASE,
)
REFERENCE_REQUEST = re.compile(
    r"\b(?:com\s+base|de\s+acordo)\s+(?:no|na|nos|nas|com\s+o|com\s+a)\s+"
    r"(?:texto|trecho|figura|imagem|gr[aá]fico|tabela|quadro|diagrama|planilha)\b|"
    r"\b(?:texto|trecho|figura|imagem|gr[aá]fico|tabela|quadro|diagrama|planilha)\s+"
    r"(?:acima|abaixo|a\s+seguir|seguinte|apresentad[oa]|mostrad[oa])\b",
    re.IGNORECASE,
)


FOLDER_DISCIPLINE_HINTS = {
    "contabilidade geral": "contabilidade geral",
    "direito penal e legislacao penal especial": "nocoes de direito penal",
    "estatistica": "estatistica",
    "informatica": "informatica",
    "nocoes de direito administrativo": "nocoes de direito administrativo",
    "nocoes de direito": "nocoes de direito constitucional",
    "processual penal": "nocoes de direito processual penal",
    "raciocinio logico": "raciocinio logico",
}

STOPWORDS = {
    "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e", "em", "entre",
    "é", "foi", "na", "nas", "no", "nos", "o", "os", "ou", "para", "pela", "pelo", "por", "que",
    "se", "sem", "ser", "sobre", "sua", "seu", "um", "uma", "às", "dos", "das", "item", "julgue",
}


@dataclass
class PdfLine:
    text: str
    page: int
    y0: float
    y1: float
    page_height: float


def fold(value: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", str(value or ""))
        if unicodedata.category(ch) != "Mn"
    ).lower()


def normalize_space(value: str) -> str:
    value = str(value or "").replace("\u00ad", "").replace("\u200b", " ")
    value = PERSONAL_ID.sub("", value)
    value = CONTENT_NOISE.sub("", value)
    value = re.sub(r"==[a-z0-9]+==", "", value, flags=re.IGNORECASE)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    return value.strip()


def normalized_key(value: str) -> str:
    value = fold(normalize_space(value))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def segment_pdf_text(value: str) -> str:
    """Reintroduz limites editoriais quando o PDF entrega a página como uma única linha."""
    value = str(value or "")
    value = re.sub(
        r"(?i)\s*(QUEST[ÕO]ES\s+(?:ESTRAT[ÉE]GICAS|COMENTADAS))\s*",
        r"\n\1\n",
        value,
    )
    value = re.sub(
        r"(?i)\s*(QUESTION[ÁA]RIO\s+DE\s+REVIS[ÃA]O(?:\s+E\s+APERFEI[ÇC]OAMENTO)?)\s*",
        r"\n\1\n",
        value,
    )
    banca = r"(?:CESPE|CEBRASPE|FGV|FCC|IBFC|AOCP|VUNESP|CESGRANRIO|QUADRIX|IADES|FUNDATEC|INSTITUTO|UPENET|IAUPE)"
    value = re.sub(
        rf"(?i)(?<!\w)(?=(?:(?:Q\s*[.:]?\s*\d{{1,3}})|(?:\d{{1,3}}\s*[.)-]))\s*(?:\(|{banca}\b))",
        "\n",
        value,
    )
    value = re.sub(r"(?i)\s+(?=coment(?:á|a)rios?\s*:?)", "\n", value)
    value = re.sub(r"(?i)\s+(?=gabarito\s*:)", "\n", value)
    value = re.sub(r"\s+(?=(?:\(?[A-Ea-e]\)|[A-Ea-e][.)])\s+)", "\n", value)
    return value


def collapse_section_headings(lines: list[str]) -> list[str]:
    targets = {
        "questoesestrategicas": "QUESTÕES ESTRATÉGICAS",
        "questoescomentadas": "QUESTÕES COMENTADAS",
    }
    result: list[str] = []
    index = 0
    while index < len(lines):
        matched = False
        for width in range(min(4, len(lines) - index), 0, -1):
            compact = re.sub(r"[^a-z]", "", fold("".join(lines[index : index + width])))
            if compact in targets:
                result.append(targets[compact])
                index += width
                matched = True
                break
        if not matched:
            result.append(lines[index])
            index += 1
    return result


def tokens(value: str) -> set[str]:
    return {
        token for token in normalized_key(value).split()
        if len(token) > 2 and token not in STOPWORDS and not token.isdigit()
    }


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_header_or_footer(text: str, y0: float, y1: float, height: float) -> bool:
    key = fold(text)
    if key == "[identificador removido]":
        return True
    if "estrategiaconcursos.com.br" in key:
        return True
    if PERSONAL_ID.fullmatch(text.strip()):
        return True
    if y0 < 54 and ("aula " in key or len(text.split()) <= 6):
        return True
    if y1 > height - 48:
        return True
    if re.search(r"\bpc-?pe\b.*\b\d{1,4}\s*$", key):
        return True
    return False


def pdf_lines(pdf_path: Path) -> tuple[list[PdfLine], int]:
    result: list[PdfLine] = []
    reader = PdfReader(str(pdf_path))
    for page_index, page in enumerate(reader.pages):
        height = float(page.mediabox.height)
        # O modo padrão recupera também as camadas de texto dos materiais que usam
        # fontes incorporadas; o modo "layout" desses PDFs devolve apenas cabeçalhos.
        raw_text = segment_pdf_text(page.extract_text() or "")
        page_lines = [normalize_space(raw_line) for raw_line in raw_text.splitlines()]
        page_lines = collapse_section_headings([line for line in page_lines if line])
        footer_index = next((
            index for index, text in enumerate(page_lines)
            if "estrategiaconcursos.com.br" in fold(text)
            or ("pc-pe" in fold(text) and "passo estrategico" in fold(text))
        ), None)
        if footer_index is not None:
            page_lines = page_lines[:footer_index]
        discarded: set[int] = set()
        for index, text in enumerate(page_lines):
            if len(text) <= 120 and re.search(r"\baula\s+\d+\b", fold(text)):
                discarded.add(index)
                if index > 0 and len(page_lines[index - 1]) <= 100 and "," in page_lines[index - 1]:
                    discarded.add(index - 1)
        for index, text in enumerate(page_lines):
            if index in discarded:
                continue
            if not text:
                continue
            # A extração textual rápida não calcula coordenadas; elas são obtidas somente
            # nas páginas com mídia, no momento do recorte direcionado.
            y0, y1 = 72.0, 84.0
            if is_header_or_footer(text, y0, y1, height):
                continue
            result.append(PdfLine(text, page_index + 1, y0, y1, height))
    return result, len(reader.pages)


def is_question_heading(text: str) -> bool:
    key = re.sub(r"[^a-z]", "", fold(text))
    return "questoesestrategicas" in key or "questoescomentadas" in key


def likely_question_start(text: str, active: bool, current: dict | None) -> re.Match | None:
    strong = QUESTION_START.match(text)
    if strong:
        return strong
    if active and current is None:
        weak = WEAK_QUESTION_START.match(text)
        if weak and len(text) >= 35 and not BOILERPLATE.search(text):
            return weak
    return None


def matched_question_number(match: re.Match) -> int:
    return int(next(group for group in match.groups() if group is not None))


def join_lines(lines: list[PdfLine] | list[str]) -> str:
    raw = [line.text if isinstance(line, PdfLine) else line for line in lines]
    out = ""
    for item in raw:
        item = normalize_space(item)
        if not item:
            continue
        if out.endswith("-") and item[:1].islower():
            out = out[:-1] + item
        elif out:
            out += "\n" if OPTION_START.match(item) or item.startswith(("•", "➢")) else " "
            out += item
        else:
            out = item
    return normalize_space(out.replace("\n ", "\n"))


def split_source(statement: str) -> tuple[str, str]:
    prefix = QUESTION_START.match(statement)
    if prefix:
        statement = statement[prefix.end():]
    else:
        statement = re.sub(
            r"^\s*(?:(?:quest(?:ão|ao)\s*)?\d{1,3}\s*[.):-]|q\s*[.: -]?\s*\d{1,3})\s*",
            "",
            statement,
            flags=re.I,
        )
    if statement.startswith(("(", "[")):
        opening = statement[0]
        closing = ")" if opening == "(" else "]"
        depth = 0
        for index, char in enumerate(statement):
            if char == opening:
                depth += 1
            elif char == closing:
                depth -= 1
                if depth == 0:
                    source = statement[1:index].strip()
                    body = statement[index + 1 :].strip()
                    if 5 <= len(source) <= 260 and len(body) >= 25:
                        clean_statement = re.sub(r"^Julgue\s+(?=[A-ZÁÉÍÓÚ])", "", body).strip()
                        return normalize_space(clean_statement), normalize_space(source)
                    break
    match = re.match(
        r"^\s*((?:CESPE|CEBRASPE|FGV|FCC|IBFC|AOCP|VUNESP|CESGRANRIO|QUADRIX|IADES|FUNDATEC)"
        r"[^-–—]{0,220}(?:[-–—][^-–—]{1,120}){0,3})\s*[-–—]\s*(.*)$",
        statement,
        re.I | re.S,
    )
    if match and len(match.group(2)) > 30:
        return normalize_space(match.group(2)), normalize_space(match.group(1))
    return normalize_space(statement), ""


def parse_options(question_text: str) -> tuple[str, list[str]]:
    parts = re.split(r"\n", question_text)
    statement_parts: list[str] = []
    options: list[tuple[str, str]] = []
    current_label = ""
    current_text = ""
    for part in parts:
        match = OPTION_START.match(part)
        if match:
            if current_label:
                options.append((current_label, normalize_space(current_text)))
            current_label = match.group(1).upper()
            current_text = match.group(2)
        elif current_label:
            current_text += " " + part
        else:
            statement_parts.append(part)
    if current_label:
        options.append((current_label, normalize_space(current_text)))
    labels = [label for label, text in options if text]
    if len(options) >= 2 and labels == [chr(65 + index) for index in range(len(labels))]:
        return normalize_space(" ".join(statement_parts)), [text for _, text in options]
    return normalize_space(question_text.replace("\n", " ")), []


def answer_from_text(comment: str) -> str | bool | None:
    matches = list(ANSWER_MARKER.finditer(comment))
    raw = matches[-1].group(1).upper() if matches else ""
    if not raw:
        lead = re.match(r"^\s*(CERTO|CORRETO|ERRADO)\b", fold(comment).upper())
        raw = lead.group(1) if lead else ""
    if raw in {"CERTO", "CORRETO"}:
        return True
    if raw == "ERRADO":
        return False
    if not raw:
        option_hits = re.findall(r"(?i)(?:letra\s*)?([A-E])\s*[–—-]\s*corret[ao]\b", comment)
        if option_hits:
            return option_hits[-1].upper()
        conclusion = re.search(
            r"(?i)(?:correta|gabarito)\s+(?:é|e)\s+(?:a\s+)?[\"“']?(?:letra\s+|alternativa\s+)?([A-E])\b",
            comment,
        )
        if conclusion:
            return conclusion.group(1).upper()
    return raw if raw in set("ABCDE") else None


def clean_preamble(lines: list[PdfLine]) -> str:
    kept = []
    for line in lines:
        if BOILERPLATE.search(line.text) or is_question_heading(line.text):
            continue
        if len(line.text) < 3:
            continue
        kept.append(line)
    return join_lines(kept)


def useful_reference_text(value: str) -> bool:
    """Evita promover títulos, nomes de professores e rodapés a texto-base."""
    words = re.findall(r"[A-Za-zÀ-ÿ0-9]+", value or "")
    return len(value or "") >= 80 and len(words) >= 12


def parse_document(lines: list[PdfLine]) -> tuple[list[dict], dict]:
    questions: list[dict] = []
    active = False
    current: dict | None = None
    pending: list[PdfLine] = []
    current_reference = ""
    stats = Counter()

    def finalize() -> None:
        nonlocal current, pending, current_reference
        if not current:
            return
        q_text = join_lines(current["question_lines"])
        comment_lines = current["comment_lines"]
        answer_line_indexes = [
            index for index, item in enumerate(comment_lines)
            if ANSWER_MARKER.search(item.text if isinstance(item, PdfLine) else str(item))
        ]
        if answer_line_indexes:
            last_answer_index = answer_line_indexes[-1]
            trailing = comment_lines[last_answer_index + 1 :]
            if trailing:
                pending = trailing
            comment_lines = comment_lines[: last_answer_index + 1]
        comment = join_lines(comment_lines)
        statement, options = parse_options(q_text)
        statement, source_label = split_source(statement)
        answer = answer_from_text(comment)
        if isinstance(answer, bool):
            statement = re.sub(
                r"(?i)\s*(?:[o○•]\s*)?certo\s+(?:[o○•]\s*)?errado\s*$",
                "",
                statement,
            ).strip()
        preamble_lines = current.get("preamble", [])
        # A referência deve estar imediatamente antes da questão; introduções de capítulo,
        # sumários e teoria distante não podem contaminar o banco.
        preamble_lines = [
            line for line in preamble_lines
            if line.page >= max(1, int(current["start_page"]) - 1)
        ][-80:]
        preamble = clean_preamble(preamble_lines)
        reference_text = ""
        requests_reference = bool(REFERENCE_REQUEST.search(statement))
        if preamble and requests_reference and useful_reference_text(preamble):
            current_reference = preamble
            reference_text = preamble
        elif preamble and len(preamble) <= 320 and QUESTION_BODY_START.match(preamble):
            # Continuação curta que ficou após o gabarito anterior, não um texto-base.
            statement = normalize_space(f"{preamble} {statement}")
        if (
            not reference_text
            and current_reference
            and requests_reference
            and useful_reference_text(current_reference)
        ):
            reference_text = current_reference
        record = {
            "number": current["number"],
            "statement": statement,
            "options": options if options else (["Certo", "Errado"] if isinstance(answer, bool) else []),
            "correct_answer": answer,
            "explanation": comment,
            "source_label": source_label,
            "reference_text": reference_text,
            "start_page": current["start_page"],
            "end_page": current["end_page"],
            "start_y": current["start_y"],
            "comment_page": current.get("comment_page"),
            "comment_y": current.get("comment_y"),
        }
        if statement and comment:
            questions.append(record)
            stats["parsed"] += 1
        else:
            stats["discarded_incomplete_block"] += 1
        current = None

    for line in lines:
        if is_question_heading(line.text):
            active = True
            pending = []
            stats["question_sections"] += 1
            continue
        if active and SECTION_END.search(line.text):
            finalize()
            active = False
            pending = []
            continue
        if not active:
            continue
        start = likely_question_start(line.text, active, current)
        if start:
            if current:
                finalize()
            current = {
                "number": matched_question_number(start),
                "question_lines": [line],
                "comment_lines": [],
                "preamble": pending,
                "start_page": line.page,
                "end_page": line.page,
                "start_y": line.y0,
                "in_comment": False,
            }
            pending = []
            continue
        if current is None:
            pending.append(line)
            continue
        marker = COMMENT_MARKER.match(line.text)
        if marker and not current["in_comment"]:
            current["in_comment"] = True
            current["comment_page"] = line.page
            current["comment_y"] = line.y0
            if marker.group(1):
                current["comment_lines"].append(marker.group(1))
            continue
        if current["in_comment"]:
            current["comment_lines"].append(line)
        else:
            current["question_lines"].append(line)
        current["end_page"] = line.page
    finalize()
    return questions, dict(stats)


def flatten_curriculum(curriculum: dict) -> tuple[list[dict], dict[str, dict]]:
    disciplines: list[dict] = []
    subtopic_by_id: dict[str, dict] = {}
    for role in curriculum.get("roles", []):
        for discipline in role.get("disciplines", []):
            entry = {"id": discipline["id"], "name": discipline["name"], "subtopics": []}
            for topic in discipline.get("topics", []):
                for subtopic in topic.get("subtopics", []):
                    item = {
                        "id": subtopic["id"],
                        "name": subtopic["name"],
                        "topic_name": topic["name"],
                        "discipline_id": discipline["id"],
                        "discipline_name": discipline["name"],
                    }
                    item["label_tokens"] = tokens(f"{topic['name']} {subtopic['name']}")
                    entry["subtopics"].append(item)
                    subtopic_by_id[item["id"]] = item
            disciplines.append(entry)
    return disciplines, subtopic_by_id


def discipline_for_folder(folder: str, disciplines: list[dict]) -> dict | None:
    wanted = FOLDER_DISCIPLINE_HINTS.get(normalized_key(folder))
    if not wanted:
        return None
    for discipline in disciplines:
        if normalized_key(discipline["name"]) == wanted:
            return discipline
    return None


def load_training_questions(repo: Path) -> list[dict]:
    records: list[dict] = []
    draft_dir = repo / "course-drafts" / "pc-pe-2027-agente" / "course-bundle" / "questions"
    for path in draft_dir.glob("*.json"):
        payload = json.loads(path.read_text(encoding="utf-8"))
        records.extend(payload.get("questions", []))
    patch = repo / "app" / "data" / "course-factory" / "published" / "pc-pe-2026-agente-patch-001.json"
    if patch.exists():
        payload = json.loads(patch.read_text(encoding="utf-8"))
        for item in payload.get("questions", []):
            copy = dict(item)
            copy["subtopic_id"] = str(copy.get("subtopic_id", "")).replace("pc_pe_2026", "pc_pe_2027")
            records.append(copy)
    return records


def build_prototypes(training: list[dict], subtopic_by_id: dict[str, dict]) -> dict[str, Counter]:
    prototypes: dict[str, Counter] = defaultdict(Counter)
    for item in training:
        subtopic_id = str(item.get("subtopic_id", ""))
        if subtopic_id not in subtopic_by_id:
            continue
        prototypes[subtopic_id].update(tokens(f"{item.get('statement', '')} {item.get('explanation', '')}"))
    return prototypes


def map_subtopic(text: str, discipline: dict, prototypes: dict[str, Counter]) -> tuple[str | None, float, float]:
    query = tokens(text)
    if not query or not discipline:
        return None, 0.0, 0.0
    scores: list[tuple[float, str]] = []
    for subtopic in discipline["subtopics"]:
        label_overlap = len(query & subtopic["label_tokens"])
        prototype = prototypes.get(subtopic["id"], Counter())
        frequent = {token for token, count in prototype.most_common(45) if count >= 1}
        prototype_overlap = len(query & frequent)
        score = label_overlap * 5.0 + prototype_overlap * 0.65
        scores.append((score, subtopic["id"]))
    scores.sort(reverse=True)
    best_score, best_id = scores[0] if scores else (0.0, None)
    second = scores[1][0] if len(scores) > 1 else 0.0
    confidence = min(1.0, best_score / 12.0) if best_score else 0.0
    margin = best_score - second
    return best_id, round(confidence, 3), round(margin, 3)


def render_reference_asset(document, question: dict, output: Path) -> bool:
    if not VISUAL_CUE.search(f"{question['statement']} {question.get('reference_text', '')}"):
        return False
    images: list[Image.Image] = []
    start_page = max(1, int(question["start_page"]))
    end_page = max(start_page, int(question.get("comment_page") or question["end_page"]))
    for page_number in range(start_page, end_page + 1):
        page = document.pages[page_number - 1]
        top = 48.0
        bottom = page.height - 48.0
        page_lines = page.extract_text_lines(strip=True, return_chars=False) or []
        if page_number == start_page:
            number = int(question.get("number") or 0)
            start_pattern = re.compile(
                rf"^\s*(?:(?:quest(?:ão|ao)\s*)?{number}\s*[.):-]|q\s*[.: -]?\s*0*{number}\b)",
                re.I,
            )
            located = next((line for line in page_lines if start_pattern.match(line.get("text", ""))), None)
            if located:
                top = max(36.0, float(located.get("top", top)) - 8)
        if page_number == question.get("comment_page"):
            located = next((
                line for line in page_lines
                if float(line.get("top", 0)) > top + 10 and COMMENT_MARKER.match(line.get("text", ""))
            ), None)
            if located:
                bottom = min(bottom, float(located.get("top", bottom)) - 8)
        if bottom - top < 40:
            continue
        cropped = page.crop((28, top, page.width - 28, bottom), strict=False)
        images.append(cropped.to_image(resolution=122, antialias=True).original.convert("RGB"))
    if not images:
        return False
    width = max(image.width for image in images)
    height = sum(image.height for image in images)
    canvas = Image.new("RGB", (width, height), "white")
    y = 0
    for image in images:
        canvas.paste(image, (0, y))
        y += image.height
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="WEBP", quality=90, method=6)
    return True


def question_ready(question: dict) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if len(question.get("statement", "")) < 25:
        reasons.append("statement_incomplete")
    if len(question.get("explanation", "")) < 20:
        reasons.append("explanation_incomplete")
    answer = question.get("correct_answer")
    options = question.get("options", [])
    if answer is None:
        reasons.append("answer_missing")
    elif isinstance(answer, str) and not options:
        reasons.append("options_missing")
    elif options and options != ["Certo", "Errado"] and answer not in [chr(65 + i) for i in range(len(options))]:
        reasons.append("answer_not_in_options")
    if not question.get("subtopic_id"):
        reasons.append("subtopic_missing")
    if question.get("mapping_confidence", 0) < 0.55 or question.get("mapping_margin", 0) < 1.0:
        reasons.append("subtopic_mapping_review")
    if question.get("requires_visual") and not question.get("reference_image"):
        reasons.append("visual_missing")
    if question.get("page_span", 1) > 3:
        reasons.append("question_block_spans_too_many_pages")
    return not reasons, reasons


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=r"E:\PC PE")
    parser.add_argument("--repo", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--limit-files", type=int, default=0)
    parser.add_argument("--file-pattern", default="")
    args = parser.parse_args()

    source_root = Path(args.source).resolve()
    repo = Path(args.repo).resolve()
    draft_root = repo / "course-drafts" / "pc-pe-2027-agente"
    curriculum_path = draft_root / "course-bundle" / "curriculum.json"
    output_root = draft_root / "material-question-extraction"
    asset_root = draft_root / "course-bundle" / "assets" / "question-references"
    batch_dir = output_root / "publication-ready-batches"
    for generated in batch_dir.glob("*-pcpe-material-comentado.json"):
        generated.unlink()
    for generated in asset_root.glob("pc_pe_2027_material_*.webp"):
        generated.unlink()
    curriculum = json.loads(curriculum_path.read_text(encoding="utf-8"))
    disciplines, subtopic_by_id = flatten_curriculum(curriculum)
    training = load_training_questions(repo)
    prototypes = build_prototypes(training, subtopic_by_id)

    pdf_paths = sorted(source_root.rglob("*.pdf"))
    if args.file_pattern:
        pattern = fold(args.file_pattern)
        pdf_paths = [path for path in pdf_paths if pattern in fold(str(path.relative_to(source_root)))]
    if args.limit_files:
        pdf_paths = pdf_paths[: args.limit_files]
    extracted: list[dict] = []
    manifest_files: list[dict] = []
    counters = Counter()
    seen_statements: dict[str, str] = {}

    for file_index, pdf_path in enumerate(pdf_paths, 1):
        relative = pdf_path.relative_to(source_root)
        discipline = discipline_for_folder(relative.parts[0], disciplines)
        lines, page_count = pdf_lines(pdf_path)
        parsed, parser_stats = parse_document(lines)
        document = None
        file_id = f"pcpe_material_{hashlib.sha1(str(relative).encode('utf-8')).hexdigest()[:12]}"
        accepted_in_file = 0
        duplicates_in_file = 0
        for local_index, question in enumerate(parsed, 1):
            statement_key = normalized_key(question["statement"])
            if not statement_key or statement_key in seen_statements:
                duplicates_in_file += 1
                counters["duplicates"] += 1
                continue
            question_id = f"pc_pe_2027_material_{len(extracted) + 1:05d}"
            subtopic_id, confidence, margin = map_subtopic(
                f"{question['statement']} {question['explanation']}", discipline, prototypes
            )
            requires_visual = bool(VISUAL_CUE.search(f"{question['statement']} {question.get('reference_text', '')}"))
            page_span = int(question["end_page"]) - int(question["start_page"]) + 1
            asset_relative = ""
            if requires_visual and page_span <= 3:
                if document is None:
                    document = pdfplumber.open(pdf_path)
                asset_path = asset_root / f"{question_id}.webp"
                if render_reference_asset(document, question, asset_path):
                    asset_relative = "/data/course-factory/assets/pc-pe-2027/question-references/" + asset_path.name
                    counters["visual_assets"] += 1
            options = question["options"]
            answer = question["correct_answer"]
            fmt = "certo_errado" if isinstance(answer, bool) else "multipla_escolha"
            source_label = question.get("source_label") or "Questão extraída de material fornecido pelo usuário"
            record = {
                "id": question_id,
                "contest_id": "pc_pe_2027",
                "subtopic_id": subtopic_id,
                "statement": question["statement"],
                "options": options,
                "correct_answer": answer,
                "explanation": question["explanation"],
                "source": source_label,
                "format": fmt,
                "status": "draft",
                "editorial_review": "pending",
                "reference_text": question.get("reference_text") or "",
                "reference_image": asset_relative,
                "metadata": {
                    "source_file": str(relative).replace("\\", "/"),
                    "source_file_id": file_id,
                    "source_question_number": question["number"],
                    "source_pages": [question["start_page"], question["end_page"]],
                    "source_page_span": page_span,
                    "mapping_confidence": confidence,
                    "mapping_margin": margin,
                    "requires_visual": requires_visual,
                    "extraction_method": "pypdf_text_and_pdfplumber_targeted_visual_crop_v2",
                    "copyright_review_required": True,
                    "publication_authorized": False,
                    "personal_identifiers_sanitized": True,
                },
            }
            ready, reasons = question_ready({
                **record,
                "mapping_confidence": confidence,
                "mapping_margin": margin,
                "requires_visual": requires_visual,
                "page_span": page_span,
            })
            record["metadata"]["technical_ready"] = ready
            record["metadata"]["review_reasons"] = reasons
            seen_statements[statement_key] = question_id
            extracted.append(record)
            accepted_in_file += 1
            counters["technically_ready" if ready else "needs_review"] += 1
            counters[fmt] += 1
        manifest_files.append({
            "id": file_id,
            "path": str(relative).replace("\\", "/"),
            "discipline": discipline["name"] if discipline else None,
            "pages": page_count,
            "sha256": file_sha256(pdf_path),
            "question_sections": parser_stats.get("question_sections", 0),
            "parsed_candidates": len(parsed),
            "accepted_after_deduplication": accepted_in_file,
            "duplicates_discarded": duplicates_in_file,
        })
        counters["pdfs"] += 1
        counters["pages"] += page_count
        if document is not None:
            document.close()
        print(f"[{file_index}/{len(pdf_paths)}] {relative}: {accepted_in_file} questões", flush=True)

    ready_questions = [item for item in extracted if item["metadata"]["technical_ready"]]
    review_questions = [item for item in extracted if not item["metadata"]["technical_ready"]]
    for index in range(0, len(ready_questions), args.batch_size):
        number = index // args.batch_size + 1
        batch = ready_questions[index : index + args.batch_size]
        write_json(batch_dir / f"{number:03d}-pcpe-material-comentado.json", {
            "name": f"pcpe_material_comentado_{number:03d}",
            "status": "draft",
            "generated_at": date.today().isoformat(),
            "publication_authorized": False,
            "questions": batch,
        })
    write_json(output_root / "review" / "needs-review.json", {
        "name": "pcpe_material_comentado_needs_review",
        "status": "draft",
        "publication_authorized": False,
        "questions": review_questions,
    })
    write_json(output_root / "extraction-manifest.json", {
        "schema_version": 1,
        "generated_at": date.today().isoformat(),
        "source_root": str(source_root),
        "contest_id": "pc_pe_2027",
        "publication_authorized": False,
        "counts": dict(counters),
        "files": manifest_files,
    })
    coverage = Counter(item.get("subtopic_id") or "unmapped" for item in extracted)
    reference_texts = sum(bool(item.get("reference_text")) for item in extracted)
    write_json(output_root / "coverage.json", {
        "contest_id": "pc_pe_2027",
        "total_questions": len(extracted),
        "technically_ready": len(ready_questions),
        "needs_review": len(review_questions),
        "by_subtopic": dict(sorted(coverage.items())),
    })
    report = [
        "# Extração de questões comentadas - PC PE",
        "",
        f"- PDFs processados: {counters['pdfs']}",
        f"- Páginas processadas: {counters['pages']}",
        f"- Questões únicas extraídas: {len(extracted)}",
        f"- Lotes tecnicamente completos: {len(ready_questions)} questões",
        f"- Pendentes de revisão: {len(review_questions)} questões",
        f"- Duplicidades descartadas: {counters['duplicates']}",
        f"- Questões do tipo Certo/Errado: {counters['certo_errado']}",
        f"- Questões de múltipla escolha: {counters['multipla_escolha']}",
        f"- Textos-base preservados: {reference_texts}",
        f"- Questões com recurso visual preservado: {counters['visual_assets']}",
        "",
        "Todo o conteúdo permanece em rascunho. A publicação exige revisão editorial,",
        "validação normativa e confirmação de direitos de uso do material de origem.",
    ]
    (output_root / "EXTRACTION_REPORT.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(json.dumps({
        "pdfs": counters["pdfs"],
        "pages": counters["pages"],
        "questions": len(extracted),
        "technically_ready": len(ready_questions),
        "needs_review": len(review_questions),
        "duplicates": counters["duplicates"],
        "reference_texts": reference_texts,
        "visual_assets": counters["visual_assets"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
