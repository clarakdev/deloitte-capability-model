"""
Generate synthetic test employee data with random SFIA 9 skills.

Usage:
    python scripts/generate_test_data.py

Output:
    data/employees.json
"""

import json
import random
from pathlib import Path

FIRST_NAMES = [
    "Alice", "Bob", "Carol", "David", "Emma", "Frank", "Grace", "Henry",
    "Isla", "James", "Karen", "Liam", "Mia", "Noah", "Olivia", "Peter",
    "Quinn", "Rachel", "Sam", "Tara", "Uma", "Victor", "Wendy", "Xander",
    "Yara", "Zoe", "Alex", "Blake", "Cameron", "Dana",
]

LAST_NAMES = [
    "Smith", "Jones", "Williams", "Brown", "Taylor", "Davies", "Evans",
    "Wilson", "Thomas", "Roberts", "Johnson", "Walker", "Wright", "Thompson",
    "White", "Hughes", "Edwards", "Green", "Hall", "Lewis", "Harris", "Clarke",
    "Patel", "Jackson", "Wood", "Turner", "Martin", "Cooper", "Hill", "Ward",
]

NUM_EMPLOYEES = 30
MIN_SKILLS = 3
MAX_SKILLS = 8
# SFIA proficiency levels: 1 (Follow) to 7 (Set strategy)
MIN_LEVEL = 1
MAX_LEVEL = 7

random.seed(42)


def load_skills(skills_path: Path) -> list[dict]:
    with open(skills_path, encoding="utf-8") as f:
        return json.load(f)


def generate_employees(skills: list[dict], n: int) -> list[dict]:
    used_names: set[str] = set()
    employees = []

    for i in range(1, n + 1):
        # Produce a unique full name
        while True:
            name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            if name not in used_names:
                used_names.add(name)
                break

        num_skills = random.randint(MIN_SKILLS, MAX_SKILLS)
        chosen_skills = random.sample(skills, num_skills)

        employee_skills = [
            {
                "code": skill["code"],
                "name": skill["name"],
                "level": random.randint(MIN_LEVEL, MAX_LEVEL),
            }
            for skill in chosen_skills
        ]

        employees.append(
            {
                "id": f"EMP{i:03d}",
                "name": name,
                "skills": employee_skills,
            }
        )

    return employees


def main() -> None:
    repo_root = Path(__file__).parent.parent
    skills_path = repo_root / "data" / "sfia_skills.json"
    output_path = repo_root / "data" / "employees.json"

    skills = load_skills(skills_path)
    employees = generate_employees(skills, NUM_EMPLOYEES)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(employees, f, indent=2, ensure_ascii=False)

    print(f"Generated {len(employees)} employees → {output_path}")


if __name__ == "__main__":
    main()
