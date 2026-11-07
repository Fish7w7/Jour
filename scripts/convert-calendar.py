"""Convert the three-page 13461/2026.6 calendar with pdfplumber."""
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
import hashlib
import json
import re
import sys

import pdfplumber

DATE = re.compile(r"\d{2}/\d{2}/\d{4}")
COLUMNS = [58.9, 130.0, 201.5, 273.0, 345.5, 417.5, 486.3, 554]
START = date(2026, 9, 28)
END = date(2027, 12, 10)
UNITS = {
    "UC1": "Desenvolvimento socioemocional",
    "UC2": "Bem-estar",
    "UC3": "Recurso tecnológico",
    "UC4": "Leitura e compreensão",
    "UC5": "Letramento matemático",
    "UC6": "Laboratório Juventude",
    "UC7": "Organizar e executar atividade de apoio",
    "UC8": "Elaborar, organizar e controlar",
    "UC9": "PI – Assistente administrativo",
    "UC10": "Compras e estoque",
    "UC11": "Administração de contas a pagar",
}
HOLIDAYS = {
    "N.SRA.APARECIDA": "Nossa Senhora Aparecida",
    "FINADOS": "Finados",
    "PROCLAMAÇÃO DA REPUBLICA": "Proclamação da República",
    "CONSCIÊNCIA NEGRA": "Consciência Negra",
    "NATAL": "Natal",
    "CONFRATERNIZAÇÃO UNIVERSAL": "Ano Novo",
    "CARNAVAL": "Carnaval",
    "SEXTA-FEIRA SANTA": "Sexta-feira Santa",
    "PÁSCOA": "Páscoa",
    "TIRADENTES": "Tiradentes",
    "SÃO JORGE": "São Jorge",
    "CORPUS CHRISTI": "Corpus Christi",
    "SÃO JOÃO BATISTA": "São João Batista",
    "INDEPENDÊNCIA DO BRASIL": "Independência do Brasil",
}


def extract(pdf):
    columns = [[] for _ in range(7)]
    for page in pdf.pages:
        words = page.extract_words(x_tolerance=1)
        footer = next((w["top"] for w in words if w["text"] == "Carga"), page.height)
        for word in words:
            if word["top"] >= footer:
                break
            x = (word["x0"] + word["x1"]) / 2
            for i, (left, right) in enumerate(zip(COLUMNS, COLUMNS[1:])):
                if left <= x < right:
                    columns[i].append(word["text"])
                    break

    days = {}
    for weekday, tokens in enumerate(columns):
        current = None
        for token in tokens:
            if DATE.fullmatch(token):
                current = datetime.strptime(token, "%d/%m/%Y").date()
                assert current.weekday() == weekday and current not in days, current
                days[current] = []
            elif current is not None:
                days[current].append(token)

    # The printed final week includes two days after the contract.
    assert sorted(days) == [START + timedelta(days=n) for n in range((END - START).days + 3)]
    return {day: " ".join(days[day]) for day in sorted(days)}


def normalize(day, original):
    event = {"date": day.isoformat(), "original": original}
    practice = re.fullmatch(r"ATIVIDADE PRÁTICA (\d+)", original)
    unit = re.match(r"^(UC\d+)\s*-", original)
    if practice:
        number = int(practice[1])
        event.update(kind="hospital", title=f"Atividade prática {number}", activityNumber=number)
    elif unit:
        code = unit[1]
        event.update(kind="senac", title=f"{code} · {UNITS[code]}", ucCode=code)
    elif original == "NÃO HÁ ATIVIDADES":
        event.update(kind="free", title="Sem atividades")
    else:
        holiday = re.sub(r"^FERIADO\s*:\s*", "", original)
        event.update(kind="holiday", title=HOLIDAYS[holiday])
    if practice or unit:
        event.update(startTime="13:00", endTime="17:00")
    return event


def main(source, output):
    with pdfplumber.open(source) as pdf:
        events = [normalize(day, label) for day, label in extract(pdf).items()]
    practices = [event["activityNumber"] for event in events if event["kind"] == "hospital"]
    assert practices == list(range(1, 201)), practices
    by_date = {event["date"]: event for event in events}
    reference = {
        "2026-11-02": "Finados",
        "2026-11-03": "Atividade prática 7",
        "2026-11-04": "Atividade prática 8",
        "2026-11-05": "Atividade prática 9",
        "2026-11-06": "UC2 · Bem-estar",
        "2026-11-16": "UC6 · Laboratório Juventude",
        "2026-11-20": "Consciência Negra",
        "2026-12-25": "Natal",
        "2027-03-28": "Páscoa",
        "2027-12-10": "Atividade prática 200",
    }
    for day, title in reference.items():
        assert by_date[day]["title"] == title, by_date[day]
    counts = Counter(event["kind"] for event in events)
    assert counts["senac"] == 100, counts
    data = {
        "version": "1.0.0",
        "updatedAt": "2026-11-05",
        "source": "Calendário oficial · Turma 13461/2026.6",
        "sourceSha256": hashlib.sha256(Path(source).read_bytes()).hexdigest(),
        "contract": {"start": START.isoformat(), "end": END.isoformat()},
        "days": events,
    }
    Path(output).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(events)} datas validadas: {dict(counts)}. Dez referências conferidas.")


if __name__ == "__main__":
    main(*sys.argv[1:])
