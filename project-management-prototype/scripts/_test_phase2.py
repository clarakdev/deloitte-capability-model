import sys, json
sys.path.insert(0, '.')

from core.embedding_engine import get_skills, get_skill_embeddings
skills = get_skills()
print(f'Skills loaded: {len(skills)}')
embs = get_skill_embeddings()
print(f'Skill embeddings shape: {embs.shape}')

from core.role_mapper import map_role_to_skills
result = map_role_to_skills('Software Developer', 'Building backend APIs and microservices in Python')
print(f'Role mapper top skills: {[s["name"] for s in result["matched_skills"]]}')
print(f'Role vector shape: {result["role_vector"].shape}')

from core.matching import assign
employees = json.load(open('data/employees.json'))
roles = [
    {**map_role_to_skills('Software Developer', 'Backend API development'), 'title': 'Software Developer', 'description': 'Backend API development', 'project': 'Project Alpha'},
    {**map_role_to_skills('Data Analyst', 'Analysing business data and producing reports'), 'title': 'Data Analyst', 'description': 'Analysing business data', 'project': 'Project Alpha'},
]
assignments = assign(employees, roles)
print(f'Assignments: {len(assignments)}')
for a in assignments:
    print(f'  {a["role_title"]} -> {a["employee_name"]} (sim={a["similarity"]:.3f})')

from core.gap_analysis import analyse_gaps
gaps = analyse_gaps(assignments[0])
print(f'Gap analysis rows: {len(gaps)}')
for g in gaps:
    print(f'  Required: {g["required_name"]} | Best match: {g["best_match_name"]} | sim={g["similarity"]:.3f} | gap={g["is_gap"]}')

print('All checks passed.')
