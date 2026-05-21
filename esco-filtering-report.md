# ESCO Skill Filtering Strategy
## Design Decisions, Limitations, and Proposed Sprint 2 Approach

**Project:** Deloitte Capability Model — PM Role-Capability Matching System  
**Sprint:** 1 (implemented) → Sprint 2 (proposed extensions)  
**Date:** May 2026  

---

## 1. Background

The system uses the **ESCO v1.2.1** (European Skills, Competences, Qualifications and Occupations) classification as its canonical skill vocabulary. ESCO is published by the European Commission and provides a structured, multilingual taxonomy of approximately 13,960 skills and competences, linked to around 3,000 occupations and 640 qualifications.

The system uses ESCO for two distinct purposes:

1. **Capability inference** — automatically mapping a role description to a ranked list of relevant ESCO skills, which become the role's required capabilities.
2. **Capability search** — allowing project managers to manually search for and add ESCO skills to a role's capability list (User Story US003).

These two purposes have different requirements for the breadth of the skill pool, a distinction that is central to the filtering decisions described in this report.

---

## 2. Sprint 1 Filtering Approach

### 2.1 Filters Applied

The Sprint 1 implementation applies two filters to `ESCO/skills_en.csv` to produce `data/esco_skills.csv`:

| Filter | Value | Rationale |
|---|---|---|
| `status` | `released` | Excludes deprecated entries |
| `reuseLevel` | `cross-sector` OR `transversal` | Excludes sector/occupation-specific skills |

The result is a curated pool of **4,241 skills** from the original 13,960 (≈30%).

### 2.2 The `status` Filter

This filter is non-negotiable. ESCO also contains `deprecated` entries — concepts that have been merged, renamed, or retired in later versions of the taxonomy. Including them risks:

- Exposing stale skill labels to users
- Using concept URIs that may not resolve correctly if ESCO data is updated
- Introducing semantic duplicates that degrade cosine similarity rankings

All Sprint 1 operations use `status = released` only.

### 2.3 The `reuseLevel` Filter

The `reuseLevel` attribute describes how broadly applicable a skill is across different occupations and sectors. ESCO defines four levels:

| Level | Description | Example |
|---|---|---|
| `transversal` | Foundational human capabilities, universally applicable | "communicate effectively", "critical thinking", "manage time" |
| `cross-sector` | Applicable across multiple industries and roles | "project management", "data analysis", "risk assessment", "stakeholder engagement" |
| `sector-specific` | Relevant to a broad industry domain | "apply food safety standards", "operate CNC machinery", "apply nursing care techniques" |
| `occupation-specific` | Tied to a single occupation | "fill dental cavities", "shear sheep", "operate a combine harvester" |

The Sprint 1 decision to retain only `cross-sector` and `transversal` skills was made for the following reasons.

**Noise reduction in the embedding space.** The sentence-transformer model (`all-MiniLM-L6-v2`) embeds all skills into the same 384-dimensional semantic space. When a role description such as "defines cloud infrastructure and API strategy" is compared against all 13,960 ESCO skills, sector-specific skills from unrelated domains (agriculture, performing arts, maritime operations) occupy regions of the embedding space that are semantically adjacent to genuinely relevant IT skills. For example, "design irrigation systems" and "design network architectures" share structural language ("design", technical systems) and produce non-trivial cosine similarities. Including irrelevant skills in the candidate pool increases the probability that the top-N inference step surfaces false positives.

**Alignment with the Deloitte consulting employment model.** Deloitte operates across government, banking, insurance, healthcare, energy, and technology sectors. An employee working on a government digital transformation project this year may be deployed to a financial services programme next year. The capability model is therefore primarily concerned with *transferable* skills — precisely the skills that ESCO classifies as `cross-sector` and `transversal`. Sector-specific capabilities are secondary to this use case.

**Computational efficiency.** Reducing the skill pool from 13,960 to 4,241 entries directly reduces the size of the pre-computed embedding matrix from approximately 20 MB to 6 MB, and halves the time required to run the precompute script. At inference time, the cosine similarity search scales linearly with pool size, so a smaller pool produces faster responses.

### 2.4 Resulting Breakdown

| reuseLevel | Count | Share |
|---|---|---|
| `cross-sector` | 3,788 | 89.3% |
| `transversal` | 453 | 10.7% |
| **Total retained** | **4,241** | **30.4% of full set** |

| skillType | Count |
|---|---|
| `skill/competence` (things you *do*) | 3,116 |
| `knowledge` (things you *know*) | 1,125 |

Both skill types are retained. Knowledge-type entries (e.g., "project management principles", "cloud computing concepts") are relevant to gap analysis — understanding that an employee lacks theoretical knowledge of a domain is a meaningful signal alongside the absence of active competence.

---

## 3. Limitations of the Sprint 1 Approach

### 3.1 Exclusion of Relevant Domain-Specific Skills

The primary limitation of the Sprint 1 filter is that many skills relevant to technology consulting are classified at `sector-specific` or `occupation-specific` reuseLevel. ESCO's classification reflects how broadly a skill is used *across the full economy*, not how relevant it is to a particular industry. As a result, skills such as:

- "design cloud infrastructure" (`sector-specific` — information technology)
- "apply enterprise architecture frameworks" (`occupation-specific` — ICT architect)
- "perform penetration testing" (`occupation-specific` — information security analyst)
- "develop ETL pipelines" (`occupation-specific` — database developer)

...may be absent from the Sprint 1 skill pool, despite being directly relevant to the demo project's roles. The automatic inference step therefore draws from a vocabulary that, while broadly applicable, is less precise for deeply technical roles.

This has a measurable impact: when the system infers capabilities for the "Solution Architect" role, it is constrained to generic skills like "manage technical documentation" and "apply systems thinking" rather than specific architectural competences. The inferred list is still semantically coherent, but lacks the domain specificity that a human reviewer would expect.

### 3.2 US003: Manual Capability Selection Must Not Be Constrained

**This is the most important limitation to address in Sprint 2.**

The Sprint 1 filtering strategy is appropriate for the *automatic inference step* (US002), where the system must surface a short, relevant list without human guidance. However, it is not appropriate as a constraint on *manual capability management* (US003 — add, remove, and modify capabilities).

When a project manager manually searches for and adds capabilities to a role, they may legitimately want to specify sector-specific or occupation-specific skills. For example:

- A PM building a team for a cloud migration project may want to add "design cloud infrastructure" specifically.
- A PM for a security assessment engagement may want to add "perform penetration testing".
- A PM staffing a data migration may want "develop ETL processes".

In the current Sprint 1 implementation, `GET /esco/search` searches only within the 4,241-skill curated pool. If the PM searches for "penetration testing" and that skill is classified as `occupation-specific`, it will not appear in search results. The PM has no way to know the skill exists in ESCO and cannot add it.

**The `/esco/search` endpoint and the POST `/roles/{id}/capabilities` endpoint should draw from the full set of released ESCO skills (all ~13,960), not the filtered subset.** The filtered subset is an optimisation for *inference quality*, not a business rule about what capabilities a PM may specify.

---

## 4. Alternative Filtering Strategies

The following strategies are presented as candidates for Sprint 2 evaluation. They are ordered roughly by implementation complexity.

### 4.1 `skillType` Filter (Low Complexity)

Retaining only `skill/competence` entries and dropping `knowledge` entries would reduce the pool from 4,241 to 3,116. This is appropriate if the system's objective is strictly to match active competences rather than theoretical knowledge. The trade-off is that gap analysis loses the ability to flag knowledge gaps (e.g., an employee lacking awareness of "project management principles" would not be flagged). Given that the system also evaluates narrative text (summaries, prior roles), knowledge gaps may already be captured indirectly through the secondary embedding component. This filter is simple to add to `filter_esco_skills.py` and is worth evaluating empirically.

### 4.2 Description Completeness Filter (Low Complexity)

Skills without descriptions are embedded using the preferred label alone, producing lower-quality embeddings with less semantic context. In the Sprint 1 implementation, the precompute script falls back gracefully to label-only embedding, so these skills are included but with reduced signal quality. Dropping or downweighting skills with empty descriptions is a low-cost quality improvement. In the current dataset, this primarily affects older or less-used ESCO entries.

### 4.3 Occupation-Anchored Dynamic Expansion (Medium Complexity)

This is the most architecturally significant and academically interesting approach, and is the recommended direction for Sprint 2.

**Principle.** Rather than using a single static skill pool for all roles, the system computes a *role-specific* skill pool at inference time by:

1. Identifying the ESCO occupations most semantically similar to the role description (using the same sentence-transformer model and `occupations_en.csv`)
2. Looking up the skills associated with those occupations in `occupationSkillRelations_en.csv` (both `essential` and `optional` relations)
3. Merging these occupation-linked skills with the cross-sector + transversal baseline

The combined pool for a role is:

```
role_skill_pool(R) = {cross-sector} ∪ {transversal} ∪ {skills(occ) : occ ∈ top_N_occupations(R)}
```

**Example.** For a "Solution Architect" role, the top-3 most similar ESCO occupations might be *"ICT solution architect"*, *"enterprise architect"*, and *"software architect"*. Their associated skills include occupation-specific items such as "design cloud infrastructure" and "apply enterprise architecture frameworks" — precisely the domain-specific capabilities that the Sprint 1 filter currently excludes.

**Key properties of this approach:**

- *Fully automatic* — no manual curation required. Any role title automatically receives an appropriate domain expansion.
- *Generalises to novel roles* — the semantic search over occupations means the approach works for role titles that were not anticipated at development time.
- *No API contract changes* — the endpoint signatures remain identical. Only the quality of the inferred capabilities changes.
- *Scope-controlled* — because the expansion is anchored to the role description rather than a broad sector, irrelevant skills from adjacent domains are unlikely to rank highly in the subsequent cosine similarity step.

**Implementation requirements:**

| Component | Change Required |
|---|---|
| `data/esco_skills.csv` | Regenerate to include all released skills (not just cross-sector + transversal), or maintain as the baseline with a separate expanded set |
| `data/esco_embeddings.npy` | Regenerate against the full released skill set, or maintain separately |
| `scripts/precompute_embeddings.py` | Also pre-compute and save occupation embeddings: `data/esco_occupation_embeddings.npy` + `data/esco_occupation_codes.json` |
| `core/embedding_engine.py` | Add `get_esco_occupations()`, `get_occupation_embeddings()`, and an occupation-URI-to-skill-URIs lookup loaded from `occupationSkillRelations_en.csv` |
| `core/capability_inference.py` | Before the cosine similarity ranking step, build the role-specific expanded skill pool using the occupation lookup; pass the expanded pool's embedding submatrix to the similarity computation |
| `GET /esco/search` | Draw from the full released skill set (resolves the US003 limitation described in §3.2) |

**Performance consideration.** The most efficient implementation is to pre-compute embeddings for the full released skill set (≈13,960 rows, ≈20 MB matrix), then at inference time apply a boolean mask to restrict the cosine similarity computation to the role-specific pool. This avoids recomputing any embeddings at inference time and adds only a negligible masking operation. The precompute script would take approximately four times as long to run as in Sprint 1, but this is a one-time cost.

### 4.4 ESCO Skill Hierarchy / Pillar Filtering (Medium-High Complexity)

`skillsHierarchy_en.csv` and `broaderRelationsSkillPillar_en.csv` expose the full skill tree structure, mapping every skill to its ancestor nodes up to the top-level "pillars" (e.g., "S — Skills and Competences", "K — Knowledge Areas"). It is possible to retain only skills that descend from pillars relevant to technology consulting — for example, "Using computer and internet", "Management and organisation", "Communication and social skills" — regardless of their reuseLevel.

This approach provides finer control than the reuseLevel filter but requires traversing the hierarchy graph, which is more complex to implement. It may also be less semantically precise than the occupation-anchored approach, since pillars are broad thematic groupings rather than operationally defined skill sets. It is included for completeness but is not the recommended Sprint 2 direction.

### 4.5 Embedding-Based Semantic Filter (High Complexity, Experimental)

A data-driven alternative to categorical filters: compute a centroid embedding from a manually curated list of 20–30 "gold standard" consulting skills, then retain only ESCO skills whose cosine similarity to the centroid exceeds a threshold (e.g., 0.35). This filter is adaptive — it responds to the semantic content of the vocabulary rather than metadata classifications — and can discover relevant skills that categorical filters miss. However, it is sensitive to the choice of seed skills, the threshold, and the embedding model, making it harder to explain and audit in an academic or client-facing context. It is more appropriate as a refinement step than as a primary filter.

---

## 5. Summary of Recommendations for Sprint 2

| Priority | Recommendation |
|---|---|
| **Must** | Expand `GET /esco/search` and `POST /roles/{id}/capabilities` to draw from the full released ESCO skill set (resolves US003 limitation) |
| **Should** | Implement occupation-anchored dynamic expansion for the capability inference step, replacing the static reuseLevel filter as the mechanism for controlling pool scope |
| **Could** | Evaluate dropping `knowledge`-type skills from the inference pool to improve precision; measure empirically whether gap analysis quality is affected |
| **Consider** | Confirm the DPN proficiency scale with the client — if a 1–5 scale is available, employee vectors should weight skill embeddings by proficiency level rather than treating all skills as binary |

---

## 6. Conclusion

The Sprint 1 `reuseLevel` filter is a pragmatic and defensible choice for a first implementation. It eliminates a large volume of irrelevant noise from the embedding space, aligns with the cross-sector nature of consulting work, and produces a computationally efficient skill pool. The resulting inference quality is adequate for a demo context.

The principal limitation is that the same filter, when applied to the manual capability search (US003), inappropriately restricts the PM's ability to specify domain-specific requirements. This is a correctness issue rather than a quality issue and should be addressed as the first Sprint 2 change.

The occupation-anchored dynamic expansion approach offers a principled path to improving inference quality for technical and domain-specific roles while preserving the noise-reduction benefits of the current filter. It is the recommended direction for Sprint 2 and is fully compatible with the existing API contract.

---

*ESCO attribution: This service uses the ESCO classification of the European Commission. The skill dataset has been filtered as described in this document. Required by Commission Decision 2011/833/EU.*
