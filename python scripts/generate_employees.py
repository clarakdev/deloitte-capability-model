"""
Generate 30 synthetic DPN-format employees for the sprint 1 demo.

Employees are organised into 5 archetypes matching the 5 demo project roles
(Architecture, Data, Change, Security, PM) with 6 employees each.

Within each archetype:
  - Positions 0-2 have the exact demo role title in their prior_roles list,
    enabling US005 (prior-experience filter) testing.
  - One position per archetype is marked unavailable, enabling US006 testing.
  - Seniority varies across the 6 positions to produce a realistic spread.

Output is fully deterministic: random.seed(42) is set at module level.

Usage:
    python scripts/generate_employees.py

Output:
    data/employees.json
"""

from __future__ import annotations

import json
import random
from pathlib import Path

random.seed(42)

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "data" / "employees.json"

# ── Name pools ────────────────────────────────────────────────────────────────

FIRST_NAMES = [
    "Alice", "Ben", "Clara", "David", "Emma", "Fiona", "George", "Hannah",
    "Ian", "Julia", "Kevin", "Laura", "Marcus", "Natalie", "Oliver", "Priya",
    "Quinn", "Rachel", "Simon", "Tara", "Uma", "Victor", "Wendy", "Xavier",
    "Yasmin", "Zara", "Adam", "Bella", "Connor", "Diana",
]

LAST_NAMES = [
    "Smith", "Jones", "Williams", "Brown", "Taylor", "Davies", "Evans",
    "Wilson", "Thomas", "Roberts", "Johnson", "Walker", "Wright", "Thompson",
    "White", "Hughes", "Edwards", "Green", "Hall", "Lewis", "Harris", "Clarke",
    "Patel", "Jackson", "Wood", "Turner", "Martin", "Cooper", "Hill", "Ward",
]

LOCATIONS = ["London", "Manchester", "Birmingham", "Edinburgh", "Leeds", "Bristol"]

BUSINESS_UNITS = [
    "Technology",
    "Human Capital",
    "Strategy & Operations",
    "Financial Advisory",
    "Risk Advisory",
]

# ── Seniority tiers (applied to positions 0-5 within each archetype) ──────────
#
# title_rank is the index into the archetype's titles list.
# Positions 0-2 receive the demo role title in prior_roles (has_prior=True).
# One position per archetype is marked unavailable (see archetype["unavailable_position"]).

SENIORITY_TIERS = [
    {"level": "Manager",           "years_range": (12, 18), "title_rank": 3},
    {"level": "Senior Consultant", "years_range": (6, 11),  "title_rank": 2},
    {"level": "Consultant",        "years_range": (3, 6),   "title_rank": 1},
    {"level": "Senior Consultant", "years_range": (8, 15),  "title_rank": 3},
    {"level": "Consultant",        "years_range": (4, 8),   "title_rank": 2},
    {"level": "Analyst",           "years_range": (1, 4),   "title_rank": 0},
]

PRIOR_EXP_POSITIONS = {0, 1, 2}

# ── Archetype definitions ─────────────────────────────────────────────────────

ARCHETYPES = [
    # ── Architecture (maps to "Solution Architect") ───────────────────────────
    {
        "demo_role_title": "Solution Architect",
        "titles": [
            "Cloud Architect",
            "Technical Architect",
            "Solution Architect",
            "Enterprise Architect",
        ],
        "specialisation": "enterprise architecture and cloud design",
        "other_prior_roles": [
            "Technical Lead",
            "Integration Architect",
            "Cloud Engineer",
        ],
        "project_experience": [
            "Cloud migration",
            "Platform modernisation",
            "API design and integration",
            "Microservices architecture",
            "Legacy system replacement",
        ],
        "industries": [
            "Technology Services",
            "Government",
            "Financial Services",
            "Banking",
            "Telecommunications",
        ],
        "business_skills": [
            "Business Analysis",
            "Stakeholder Engagement",
            "Requirements Gathering",
            "Quality Assessment",
        ],
        "tech_skills": [
            "Cloud Architecture",
            "API Design",
            "Microsoft Azure",
            "AWS",
            "Terraform",
            "Python",
            "DevOps",
        ],
        "tools": ["Microsoft Azure", "AWS", "Terraform", "JIRA", "Confluence"],
        "certifications": ["TOGAF", "AWS Solutions Architect", "Azure Administrator", "ITIL"],
        "outcomes": [
            "cloud migration programmes",
            "platform modernisation projects",
            "enterprise architecture transformations",
            "digital platform builds",
        ],
        "strengths": [
            "translating business requirements into scalable technical solutions",
            "driving architectural governance across complex programmes",
            "stakeholder engagement at executive level",
            "bridging technical and business teams",
        ],
        "unavailable_position": 1,
    },
    # ── Data (maps to "Data Engineer") ───────────────────────────────────────
    {
        "demo_role_title": "Data Engineer",
        "titles": [
            "Data Analyst",
            "Data Engineer",
            "Senior Data Engineer",
            "Data Architect",
        ],
        "specialisation": "data engineering and analytics",
        "other_prior_roles": [
            "Data Analyst",
            "Business Intelligence Developer",
            "Database Administrator",
        ],
        "project_experience": [
            "Data migration",
            "ETL pipeline development",
            "Data warehouse design",
            "Analytics platform build",
            "Data quality improvement",
        ],
        "industries": [
            "Banking",
            "Financial Services",
            "Government",
            "Retail",
            "Health",
        ],
        "business_skills": [
            "Business Analysis",
            "Requirements Gathering",
            "Quality Assessment",
            "Delivery Reviews",
        ],
        "tech_skills": [
            "SQL",
            "Data Modelling",
            "ETL Development",
            "Python",
            "Power BI",
            "Microsoft Azure",
        ],
        "tools": ["Python", "SQL Server", "Power BI", "Microsoft Azure", "AWS"],
        "certifications": [
            "Certified Data Management Professional",
            "AWS Solutions Architect",
            "Azure Administrator",
            "ITIL",
        ],
        "outcomes": [
            "large-scale data migration projects",
            "analytics platform builds",
            "data governance programmes",
            "data warehouse modernisation projects",
        ],
        "strengths": [
            "designing scalable and resilient data pipelines",
            "ensuring data quality and consistency across systems",
            "bridging technical and business requirements",
            "managing complex data dependencies and lineage",
        ],
        "unavailable_position": 4,
    },
    # ── Change (maps to "Change & Adoption Lead") ─────────────────────────────
    {
        "demo_role_title": "Change & Adoption Lead",
        "titles": [
            "Change Analyst",
            "Change Manager",
            "Senior Change Manager",
            "Change Lead",
        ],
        "specialisation": "change management and organisational transformation",
        "other_prior_roles": [
            "Organisational Development Consultant",
            "Training Manager",
            "Communications Manager",
        ],
        "project_experience": [
            "Change management programme",
            "ERP system rollout",
            "Digital transformation",
            "Culture change initiative",
            "Workforce transition",
        ],
        "industries": [
            "Government",
            "Health",
            "Banking",
            "Technology Services",
            "Energy",
        ],
        "business_skills": [
            "Change Management",
            "Stakeholder Engagement",
            "Workshop Facilitation",
            "Benefits Realisation",
            "Business Analysis",
        ],
        "tech_skills": [
            "Microsoft Project",
            "JIRA",
            "Planview",
        ],
        "tools": ["Microsoft Project", "JIRA", "Microsoft Teams", "Mentimeter", "Planview"],
        "certifications": ["Prince2", "Prosci ADKAR", "ITIL", "CAPM"],
        "outcomes": [
            "large-scale digital transformation programmes",
            "ERP system change and adoption programmes",
            "organisational restructuring projects",
            "government digital adoption initiatives",
        ],
        "strengths": [
            "engaging resistant stakeholders and building buy-in",
            "designing and facilitating adoption workshops",
            "measuring and reporting on behavioural change",
            "aligning HR and leadership on change readiness",
        ],
        "unavailable_position": 0,
    },
    # ── Security (maps to "Cybersecurity Analyst") ────────────────────────────
    {
        "demo_role_title": "Cybersecurity Analyst",
        "titles": [
            "Security Analyst",
            "Information Security Consultant",
            "Senior Security Analyst",
            "Security Architect",
        ],
        "specialisation": "information security and risk management",
        "other_prior_roles": [
            "Security Operations Analyst",
            "IT Auditor",
            "Network Engineer",
        ],
        "project_experience": [
            "Security assessment",
            "Penetration testing programme",
            "Compliance audit",
            "Security architecture review",
            "Incident response planning",
        ],
        "industries": [
            "Government",
            "Banking",
            "Financial Services",
            "Insurance",
            "Technology Services",
        ],
        "business_skills": [
            "Risk Management",
            "Quality Assessment",
            "Delivery Reviews",
            "Stakeholder Engagement",
        ],
        "tech_skills": [
            "Network Security",
            "Penetration Testing",
            "Vulnerability Assessment",
            "Python",
            "ServiceNow",
        ],
        "tools": ["Nessus", "Qualys", "Splunk", "ServiceNow", "JIRA"],
        "certifications": ["CISSP", "CISM", "CompTIA Security+", "ITIL"],
        "outcomes": [
            "security assessments for government and financial sector clients",
            "cyber resilience programmes",
            "compliance and audit engagements",
            "security architecture reviews",
        ],
        "strengths": [
            "threat modelling and risk prioritisation",
            "embedding security controls into delivery from the outset",
            "communicating risk clearly to non-technical stakeholders",
            "ensuring compliance with government security standards",
        ],
        "unavailable_position": 5,
    },
    # ── PM (maps to "Project Manager") ───────────────────────────────────────
    {
        "demo_role_title": "Project Manager",
        "titles": [
            "Project Coordinator",
            "Project Manager",
            "Senior Project Manager",
            "Programme Manager",
        ],
        "specialisation": "project and programme management",
        "other_prior_roles": [
            "Delivery Lead",
            "Scrum Master",
            "Business Analyst",
        ],
        "project_experience": [
            "Multi-workstream technology programme",
            "Agile delivery",
            "ERP implementation",
            "Cloud migration programme",
            "Government digital transformation",
        ],
        "industries": [
            "Government",
            "Technology Services",
            "Financial Services",
            "Health",
            "Supply Chain",
        ],
        "business_skills": [
            "Project Management",
            "Agile Delivery",
            "Programme Management",
            "Risk Management",
            "Stakeholder Engagement",
            "Benefits Realisation",
        ],
        "tech_skills": [
            "JIRA",
            "Planview",
            "Microsoft Project",
            "ServiceNow",
        ],
        "tools": ["JIRA", "Planview", "Microsoft Project", "Confluence", "Power BI"],
        "certifications": ["Prince2", "PMP", "CAPM", "Scrum Master", "MSP"],
        "outcomes": [
            "multi-workstream technology programmes",
            "government digital transformation projects",
            "ERP and cloud migration programmes",
            "agile delivery engagements",
        ],
        "strengths": [
            "managing scope and budget under pressure",
            "coordinating dependencies across technical and change workstreams",
            "steering group and executive stakeholder engagement",
            "driving delivery in complex public-sector environments",
        ],
        "unavailable_position": 2,
    },
]


# ── Helper functions ──────────────────────────────────────────────────────────

def build_summary(
    first_name: str,
    years: int,
    specialisation: str,
    strength: str,
    outcome: str,
    tools: list[str],
    certifications: list[str],
) -> str:
    tool = tools[0] if tools else "key delivery tools"
    cert = certifications[0] if certifications else None

    if years >= 12:
        options = [
            (
                f"{first_name} is a highly experienced {specialisation} professional with over "
                f"{years} years in the field. They have directed {outcome} at scale and are "
                f"recognised for {strength}."
            ),
            (
                f"Bringing more than {years} years of {specialisation} experience, {first_name} "
                f"has built a strong reputation for {strength}. They have overseen {outcome} "
                f"for major clients across multiple sectors."
            ),
        ]
    elif years >= 6:
        cert_clause = f" They hold {cert}." if cert else ""
        options = [
            (
                f"{first_name} is a seasoned {specialisation} professional with {years} years "
                f"of experience. Known for {strength}, they have led {outcome} for clients "
                f"across complex enterprise environments.{cert_clause}"
            ),
            (
                f"With {years} years in {specialisation}, {first_name} combines deep expertise "
                f"with strong client-facing skills. They have delivered {outcome} and bring a "
                f"reputation for {strength}."
            ),
        ]
    else:
        options = [
            (
                f"{first_name} is a {specialisation} professional with {years} years of "
                f"experience. They have supported {outcome} and bring hands-on proficiency "
                f"in {tool}."
            ),
            (
                f"With {years} years in {specialisation}, {first_name} has contributed to "
                f"{outcome} at Deloitte and is building expertise in {tool}."
            ),
        ]

    return random.choice(options)


def get_prior_roles(archetype: dict, has_prior: bool) -> list[str]:
    if has_prior:
        extras = random.sample(
            archetype["other_prior_roles"],
            k=random.randint(0, min(1, len(archetype["other_prior_roles"]))),
        )
        return [archetype["demo_role_title"]] + extras
    return random.sample(
        archetype["other_prior_roles"],
        k=random.randint(1, min(2, len(archetype["other_prior_roles"]))),
    )


def generate_all_employees() -> list[dict]:
    used_names: set[str] = set()
    employees = []
    emp_id = 1

    for archetype in ARCHETYPES:
        for pos, tier in enumerate(SENIORITY_TIERS):
            # Unique full name
            while True:
                name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
                if name not in used_names:
                    used_names.add(name)
                    break
            first_name = name.split()[0]

            years = random.randint(*tier["years_range"])
            title_idx = min(tier["title_rank"], len(archetype["titles"]) - 1)
            title = archetype["titles"][title_idx]
            has_prior = pos in PRIOR_EXP_POSITIONS
            available = pos != archetype["unavailable_position"]

            # Skills
            n_biz = min(3, len(archetype["business_skills"]))
            n_tech = min(4, len(archetype["tech_skills"]))
            biz_skills = [
                {"name": s, "category": "Business Skills"}
                for s in random.sample(archetype["business_skills"], k=n_biz)
            ]
            tech_skills = [
                {"name": s, "category": "Technology Skills"}
                for s in random.sample(archetype["tech_skills"], k=n_tech)
            ]
            skills = biz_skills + tech_skills
            random.shuffle(skills)

            tools = random.sample(archetype["tools"], k=random.randint(2, min(4, len(archetype["tools"]))))
            certs = random.sample(
                archetype["certifications"],
                k=random.randint(0, min(2, len(archetype["certifications"]))),
            )
            industries = random.sample(
                archetype["industries"],
                k=random.randint(1, min(3, len(archetype["industries"]))),
            )
            projects = random.sample(
                archetype["project_experience"],
                k=random.randint(2, min(4, len(archetype["project_experience"]))),
            )
            prior_roles = get_prior_roles(archetype, has_prior)
            summary = build_summary(
                first_name=first_name,
                years=years,
                specialisation=archetype["specialisation"],
                strength=random.choice(archetype["strengths"]),
                outcome=random.choice(archetype["outcomes"]),
                tools=tools,
                certifications=certs,
            )

            employees.append({
                "id": f"EMP{emp_id:03d}",
                "name": name,
                "title": title,
                "role_level": tier["level"],
                "business_unit": random.choice(BUSINESS_UNITS),
                "location": random.choice(LOCATIONS),
                "summary": summary,
                "years_experience": years,
                "current_role": title,
                "prior_roles": prior_roles,
                "project_experience": projects,
                "industry_experience": industries,
                "skills": skills,
                "tools": tools,
                "certifications": certs,
                "available": available,
            })
            emp_id += 1

    return employees


def main() -> None:
    employees = generate_all_employees()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(employees, f, indent=2, ensure_ascii=False)

    available_count = sum(1 for e in employees if e["available"])
    demo_titles = {a["demo_role_title"] for a in ARCHETYPES}
    with_prior = sum(
        1 for e in employees
        if any(r in demo_titles for r in e["prior_roles"])
    )

    print(f"Generated {len(employees)} employees → {OUTPUT_PATH}")
    print(f"  Available:                      {available_count} / {len(employees)}")
    print(f"  With a demo role as prior exp:  {with_prior} / {len(employees)}")
    print()
    for a in ARCHETYPES:
        count = sum(1 for e in employees if a["demo_role_title"] in e["prior_roles"])
        print(f"  Prior '{a['demo_role_title']}': {count} employees")


if __name__ == "__main__":
    main()
