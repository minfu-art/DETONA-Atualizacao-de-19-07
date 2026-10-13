"""Snapshot official CONTRAN index rows referenced by the PRF 2021 curriculum."""

import json
import pathlib
import re
import urllib.request
from datetime import date
from urllib.parse import urljoin

import lxml.html


ROOT = pathlib.Path(__file__).resolve().parents[1]
COURSE = ROOT / "course-drafts" / "prf-pre-edital"
INDEX_URL = "https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/resolucoes-contran"
RETIFICATION_URL = "https://cdn.cebraspe.org.br/concursos/prf_21/arquivos/ED_2_PRF_2021_RETIFICACAO.PDF"
OUTPUT = COURSE / "sources" / "contran-2026-10-13-official-index.v1.json"
RETIFIED_RESOLUTIONS = {
    4: 1998, 14: 1998, 24: 1998, 36: 1998, 92: 1999, 110: 2000,
    160: 2004, 210: 2006, 211: 2006, 216: 2006, 227: 2007,
    253: 2007, 254: 2007, 290: 2008, 349: 2010, 360: 2010,
    432: 2013, 441: 2013, 471: 2013, 508: 2014, 520: 2015,
    525: 2015, 552: 2015, 561: 2015, 667: 2017, 735: 2018,
    740: 2018, 780: 2019, 789: 2020, 798: 2020, 803: 2020,
    806: 2020, 809: 2020, 810: 2020,
}


def main():
    curriculum = json.loads((COURSE / "course-bundle" / "curriculum.json").read_text(encoding="utf-8"))
    traffic = next(d for d in curriculum["roles"][0]["disciplines"] if d["name"] == "Legislação de Trânsito")
    target = {}
    for topic in traffic["topics"]:
        for subtopic in topic["subtopics"]:
            match = re.search(r"Resolução CONTRAN nº (\d+)/(\d{4})", subtopic["name"])
            if match:
                target[int(match.group(1))] = {"subtopic_id": subtopic["id"], "edital_label": subtopic["name"], "edital_year": int(match.group(2))}
    if len(target) != 39:
        raise ValueError(f"Expected 39 historic resolutions, got {len(target)}")
    if len(RETIFIED_RESOLUTIONS) != 34 or not set(RETIFIED_RESOLUTIONS).issubset(target):
        raise ValueError("Retified edital resolution list does not match local curriculum")
    request = urllib.request.Request(INDEX_URL, headers={"User-Agent": "Mozilla/5.0"})
    root = lxml.html.fromstring(urllib.request.urlopen(request, timeout=30).read())
    found = {}
    for row in root.xpath("//tr"):
        cells = row.xpath("./td")
        if len(cells) < 5:
            continue
        first = " ".join(cells[0].text_content().split())
        number_match = re.match(r"^(\d{1,4})\b", first)
        if not number_match:
            continue
        number = int(number_match.group(1))
        if number not in target or number in found:
            continue
        description = " ".join(cells[3].text_content().split())
        legal_note = " ".join(cells[4].text_content().split())
        index_year_text = " ".join(cells[1].text_content().split())
        date_match = re.search(r"\b\d{1,2}\.\d{1,2}\.(\d{2,4})\b", index_year_text)
        index_year = None
        if date_match:
            year_digits = int(date_match.group(1))
            index_year = year_digits + (2000 if year_digits < 100 and year_digits <= 26 else 1900 if year_digits < 100 else 0)
        links = [urljoin(INDEX_URL, href) for href in cells[0].xpath(".//a/@href") if href]
        status = "index_indicates_revoked" if re.search(r"\brevogad[ao]\b|\bextinta\b", legal_note, re.IGNORECASE) else "index_no_revocation_flag_found"
        found[number] = {
            **target[number], "number": number,
            "description": description, "index_note": legal_note,
            "index_year_text": index_year_text,
            "index_year": index_year,
            "edital_index_year_mismatch": index_year is not None and target[number]["edital_year"] != index_year,
            "retified_2021_scope": "included" if number in RETIFIED_RESOLUTIONS else "removed_from_retified_list",
            "retified_2021_year": RETIFIED_RESOLUTIONS.get(number),
            "index_status": status, "act_links": links,
            "normative_review_status": "full_act_and_successor_review_pending",
        }
    missing = sorted(set(target) - set(found))
    if missing:
        raise ValueError(f"Official index rows missing for: {missing}")
    result = {
        "schema_version": "prf_contran_official_index_snapshot_v1",
        "retrieved_on": date.today().isoformat(), "source_url": INDEX_URL,
        "notice": "Index summaries are evidence of stated revocation status, not a full consolidated legal opinion.",
        "resolution_count": len(found),
        "retification_source_url": RETIFICATION_URL,
        "retified_2021_resolution_count": len(RETIFIED_RESOLUTIONS),
        "removed_from_retified_2021_list": sorted(set(target) - set(RETIFIED_RESOLUTIONS)),
        "index_indicates_revoked": sum(item["index_status"] == "index_indicates_revoked" for item in found.values()),
        "edital_index_year_mismatches": [number for number, item in sorted(found.items()) if item["edital_index_year_mismatch"]],
        "resolutions": [found[number] for number in sorted(found)],
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(found), "revoked": result["index_indicates_revoked"], "missing": missing}, ensure_ascii=False))


if __name__ == "__main__":
    main()
