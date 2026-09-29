"""
Word document generation for project Team Capability Reports.
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
import math
import textwrap

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

DELOITTE_GREEN = "86BC25"
DARK_GREY = "333333"
LIGHT_GREY = "F2F2F2"
MID_GREY = "666666"

CHART_GREEN = "#86BC25"
CHART_BLUE = "#5B9BD5"
CHART_RED = "#E05252"
CHART_ORANGE = "#D4922A"
CHART_PURPLE = "#8460AD"
CHART_GRID = "#D9D9D9"
CHART_TEXT = "#333333"


def _set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), fill)
    tc_pr.append(shading)


def _set_cell_text(
    cell,
    text,
    *,
    bold=False,
    color=DARK_GREY,
    size=9,
) -> None:
    cell.text = ""

    paragraph = cell.paragraphs[0]
    run = paragraph.add_run(str(text))

    run.bold = bold
    run.font.name = "Arial"
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)

    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def _add_section_heading(document: Document, text: str) -> None:
    paragraph = document.add_paragraph()

    paragraph.paragraph_format.space_before = Pt(12)
    paragraph.paragraph_format.space_after = Pt(6)

    run = paragraph.add_run(text.upper())
    run.bold = True
    run.font.name = "Arial"
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor.from_string(DELOITTE_GREEN)


def _add_small_label(document: Document, label: str, value: str) -> None:
    paragraph = document.add_paragraph()

    paragraph.paragraph_format.space_after = Pt(3)

    label_run = paragraph.add_run(f"{label}: ")
    label_run.bold = True
    label_run.font.name = "Arial"
    label_run.font.size = Pt(9)
    label_run.font.color.rgb = RGBColor.from_string(DARK_GREY)

    value_run = paragraph.add_run(value)
    value_run.font.name = "Arial"
    value_run.font.size = Pt(9)
    value_run.font.color.rgb = RGBColor.from_string(MID_GREY)


def _clean_join(values: list[str]) -> str:
    values = [str(value).strip() for value in values if str(value).strip()]
    return ", ".join(values) if values else "None recorded"


def _add_team_overview_table(
    document: Document,
    entries: list[dict],
) -> None:
    table = document.add_table(rows=1, cols=5)
    table.style = "Table Grid"

    headers = [
        "Project Role",
        "Assigned Employee",
        "Title",
        "Level",
        "Match",
    ]

    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        _set_cell_shading(cell, DARK_GREY)
        _set_cell_text(
            cell,
            header,
            bold=True,
            color="FFFFFF",
            size=9,
        )

    for entry in entries:
        employee = entry["employee"]

        cells = table.add_row().cells

        values = [
            entry["role_title"],
            employee.get("name", ""),
            employee.get("title", ""),
            employee.get("role_level", ""),
            f"{round(entry['match_score'] * 100)}%",
        ]

        for index, value in enumerate(values):
            _set_cell_text(cells[index], value)

    document.add_paragraph()


def _add_team_metrics(
    document: Document,
    average_team_match: int,
    roles_with_gaps: int,
    total_roles: int,
) -> None:
    table = document.add_table(rows=1, cols=2)
    table.style = "Table Grid"

    metric_values = [
        (
            f"{average_team_match}%",
            "Average Team Match",
        ),
        (
            f"{roles_with_gaps} of {total_roles}",
            "Roles With Gaps",
        ),
    ]

    for index, (value, label) in enumerate(metric_values):
        cell = table.rows[0].cells[index]
        _set_cell_shading(cell, LIGHT_GREY)

        cell.text = ""

        paragraph = cell.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

        value_run = paragraph.add_run(value)
        value_run.bold = True
        value_run.font.name = "Arial"
        value_run.font.size = Pt(18)
        value_run.font.color.rgb = RGBColor.from_string(DELOITTE_GREEN)

        label_paragraph = cell.add_paragraph()
        label_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

        label_run = label_paragraph.add_run(label)
        label_run.font.name = "Arial"
        label_run.font.size = Pt(8)
        label_run.font.color.rgb = RGBColor.from_string(MID_GREY)

    document.add_paragraph()


def _score_out_of_five(score: float) -> int:
    """Match the frontend scoreOutOfFive() behaviour."""
    value = max(0.0, min(1.0, float(score or 0)))
    return math.ceil(value * 5)


def _score_out_of_ten(score: float) -> int:
    """Match the team-report /10 display."""
    value = max(0.0, min(1.0, float(score or 0)))
    return math.ceil(value * 10)


def _add_chart_image(
    document: Document,
    image: BytesIO,
    width: float = 6.4,
) -> None:
    """Insert an in-memory chart image into the DOCX."""
    image.seek(0)

    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_after = Pt(6)

    run = paragraph.add_run()
    run.add_picture(image, width=Inches(width))


def _create_radar_chart(
    items: list[dict],
    *,
    threshold: float | None = None,
    threshold_label: str | None = None,
) -> BytesIO | None:
    """
    Generate a Word-friendly equivalent of the React RadarChart.

    Each item contains:
        {
            "label": str,
            "sublabel": str | None,
            "value": float 0..1,
            "display_value": str,
            "is_gap": bool,
        }

    The frontend uses numbered vertices because long role/capability
    names are displayed in a separate legend. This does the same.
    """

    if len(items) < 3:
        return None

    count = len(items)

    values = [
        max(
            0.0,
            min(
                1.0,
                float(item.get("value", 0) or 0),
            ),
        )
        for item in items
    ]

    angles = np.linspace(
        0,
        2 * np.pi,
        count,
        endpoint=False,
    ).tolist()

    closed_angles = angles + angles[:1]
    closed_values = values + values[:1]

    # ------------------------------------------------------------
    # Prepare legend text
    # ------------------------------------------------------------

    prepared_items = []

    for item in items:
        label = str(item.get("label") or "")

        wrapped_label = textwrap.wrap(
            label,
            width=34,
            break_long_words=False,
            break_on_hyphens=False,
        ) or [""]

        prepared_items.append(
            {
                **item,
                "_label_lines": wrapped_label,
            }
        )

    # Each legend item reserves enough vertical space for:
    # - all wrapped capability/role-name lines
    # - optional gap text
    row_units = []

    for item in prepared_items:
        units = len(item["_label_lines"])

        if item.get("sublabel"):
            units += 0.75

        row_units.append(max(1.25, units))

    total_units = sum(row_units)

    height = max(
        4.0,
        min(
            8.0,
            2.5 + total_units * 0.38,
        ),
    )

    fig = plt.figure(
        figsize=(7.2, height),
        dpi=180,
        facecolor="white",
    )

    # ------------------------------------------------------------
    # Radar
    # ------------------------------------------------------------

    ax = fig.add_axes(
        [0.04, 0.15, 0.47, 0.72],
        polar=True,
    )

    # First axis points upwards, matching RadarChart.jsx.
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)

    ax.set_ylim(0, 1)

    # Same five levels as frontend:
    # 20%, 40%, 60%, 80%, 100%.
    ax.set_yticks(
        [
            0.2,
            0.4,
            0.6,
            0.8,
            1.0,
        ]
    )

    ax.set_yticklabels([])

    ax.grid(
        color=CHART_GRID,
        linewidth=0.8,
    )

    ax.spines["polar"].set_color(CHART_GRID)

    # Numbered axes.
    ax.set_xticks(angles)

    ax.set_xticklabels(
        [str(index + 1) for index in range(count)],
        fontsize=8,
        fontweight="bold",
        color=CHART_TEXT,
    )

    # Main green fit polygon.
    ax.plot(
        closed_angles,
        closed_values,
        color=CHART_GREEN,
        linewidth=2,
        zorder=3,
    )

    ax.fill(
        closed_angles,
        closed_values,
        color=CHART_GREEN,
        alpha=0.16,
        zorder=2,
    )

    # Individual data points.
    for index, value in enumerate(values):
        item = items[index]

        point_color = CHART_RED if item.get("is_gap") else CHART_GREEN

        ax.scatter(
            [angles[index]],
            [value],
            s=24,
            color=point_color,
            edgecolors="white",
            linewidths=0.6,
            zorder=5,
        )

    # Optional gap threshold.
    if threshold is not None:
        threshold = max(
            0.0,
            min(
                1.0,
                float(threshold),
            ),
        )

        threshold_values = [threshold] * count
        threshold_values.append(threshold_values[0])

        ax.plot(
            closed_angles,
            threshold_values,
            color=CHART_RED,
            linewidth=1.2,
            linestyle=(0, (3, 3)),
            alpha=0.7,
            zorder=4,
        )

    # ------------------------------------------------------------
    # Legend
    # ------------------------------------------------------------

    legend_ax = fig.add_axes([0.53, 0.08, 0.45, 0.84])

    legend_ax.axis("off")

    # Normalised vertical spacing inside the legend.
    available_height = 0.84
    unit_height = available_height / max(total_units, 1)

    y = 0.96

    for index, item in enumerate(prepared_items):
        is_gap = bool(item.get("is_gap"))

        number_color = CHART_RED if is_gap else CHART_GREEN

        label_lines = item["_label_lines"]

        # Number column.
        legend_ax.text(
            0.00,
            y,
            str(index + 1),
            fontsize=8,
            fontweight="bold",
            color=number_color,
            va="top",
        )

        # Capability / role-name column.
        label_y = y

        for line in label_lines:
            legend_ax.text(
                0.09,
                label_y,
                line,
                fontsize=7.2,
                fontweight="bold",
                color=CHART_TEXT,
                va="top",
                ha="left",
            )

            label_y -= unit_height

        # Score has its own right-hand column.
        legend_ax.text(
            0.98,
            y,
            str(item.get("display_value") or ""),
            fontsize=8,
            fontweight="bold",
            color=number_color,
            va="top",
            ha="right",
        )

        # Optional gap text sits closely beneath the capability label.
        sublabel = item.get("sublabel")

        if sublabel:
            sublabel_y = label_y + (unit_height * 0.35)

            legend_ax.text(
                0.09,
                sublabel_y,
                str(sublabel),
                fontsize=6.4,
                color=(CHART_RED if is_gap else "#777777"),
                va="top",
                ha="left",
            )

        y -= row_units[index] * unit_height

    # Threshold key.
    if threshold is not None and threshold_label:
        legend_ax.text(
            0.00,
            0.015,
            f"- - -  {threshold_label}",
            fontsize=7,
            color=CHART_RED,
            va="bottom",
        )

    output = BytesIO()

    fig.savefig(
        output,
        format="png",
        dpi=180,
        bbox_inches="tight",
        facecolor="white",
    )

    plt.close(fig)

    output.seek(0)

    return output


def _add_team_capability_radar(
    document: Document,
    entries: list[dict],
) -> None:
    items = []

    for entry in entries:
        score = max(
            0.0,
            min(
                1.0,
                float(entry.get("match_score", 0) or 0),
            ),
        )

        employee = entry.get("employee", {}) or {}

        items.append(
            {
                "label": entry.get("role_title", "Role"),
                "sublabel": employee.get("name", ""),
                "value": score,
                "display_value": f"{_score_out_of_ten(score)}/10",
                "is_gap": False,
            }
        )

    radar = _create_radar_chart(items)

    if radar is None:
        return

    _add_chart_image(
        document,
        radar,
        width=6.4,
    )

    if entries:
        average = sum(
            float(entry.get("match_score", 0) or 0) for entry in entries
        ) / len(entries)

        paragraph = document.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(8)

        run = paragraph.add_run(
            f"Average role fit: {_score_out_of_ten(average):.1f}/10"
        )

        run.bold = True
        run.font.name = "Arial"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor.from_string(DELOITTE_GREEN)


def _get_business_chemistry_counts(
    entries: list[dict],
) -> dict[str, int]:
    counts = {
        "Pioneer": 0,
        "Guardian": 0,
        "Driver": 0,
        "Integrator": 0,
    }

    for entry in entries:
        employee = entry.get("employee", {}) or {}

        chemistry = employee.get("business_chemistry") or entry.get(
            "business_chemistry"
        )

        if chemistry in counts:
            counts[chemistry] += 1

    return counts


def _add_business_chemistry(
    document: Document,
    entries: list[dict],
) -> None:
    counts = _get_business_chemistry_counts(entries)

    total = sum(counts.values())

    if total == 0:
        paragraph = document.add_paragraph(
            "Business Chemistry information is not available for this team."
        )

        for run in paragraph.runs:
            run.font.name = "Arial"
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor.from_string(MID_GREY)

        return

    chemistry = [
        ("Pioneer", CHART_ORANGE),
        ("Guardian", CHART_BLUE),
        ("Driver", CHART_RED),
        ("Integrator", CHART_GREEN),
    ]

    fig, ax = plt.subplots(
        figsize=(7.2, 1.45),
        dpi=180,
        facecolor="white",
    )

    left = 0.0

    for label, color in chemistry:
        count = counts[label]

        if count == 0:
            continue

        percentage = count / total * 100

        ax.barh(
            [0],
            [percentage],
            left=left,
            color=color,
            height=0.35,
        )

        if percentage >= 12:
            ax.text(
                left + percentage / 2,
                0,
                f"{round(percentage)}%",
                ha="center",
                va="center",
                fontsize=8,
                fontweight="bold",
                color="white",
            )

        left += percentage

    ax.set_xlim(0, 100)
    ax.set_ylim(-0.65, 0.65)
    ax.axis("off")

    legend = "     ".join(f"{label}: {counts[label]}" for label, _ in chemistry)

    ax.text(
        50,
        -0.48,
        legend,
        ha="center",
        va="center",
        fontsize=7.5,
        color=CHART_TEXT,
    )

    output = BytesIO()

    fig.savefig(
        output,
        format="png",
        dpi=180,
        bbox_inches="tight",
        facecolor="white",
    )

    plt.close(fig)

    output.seek(0)

    _add_chart_image(
        document,
        output,
        width=6.4,
    )


def _add_individual_capability_radar(
    document: Document,
    fit_report: list[dict],
) -> None:
    items = []

    for index, fit in enumerate(fit_report or []):
        similarity = max(
            0.0,
            min(
                1.0,
                float(fit.get("similarity", 0) or 0),
            ),
        )

        is_gap = bool(fit.get("is_gap"))

        items.append(
            {
                "label": (
                    fit.get("cap_name") or fit.get("name") or f"Capability {index + 1}"
                ),
                "sublabel": ("Gap - upskilling needed" if is_gap else None),
                "value": similarity,
                "display_value": f"{_score_out_of_five(similarity)}/5",
                "is_gap": is_gap,
            }
        )

    radar = _create_radar_chart(
        items,
        threshold=0.6,
        threshold_label="Gap threshold (60%)",
    )

    if radar is None:
        return

    _add_chart_image(
        document,
        radar,
        width=6.2,
    )


def _add_role_level_distribution(
    document: Document,
    entries: list[dict],
) -> None:
    groups = [
        (
            "Senior Consultant & below",
            {"Analyst", "Consultant", "Senior Consultant"},
            CHART_GREEN,
        ),
        (
            "Manager–Director",
            {"Manager", "Senior Manager", "Director"},
            CHART_BLUE,
        ),
        (
            "Partner",
            {"Partner"},
            CHART_PURPLE,
        ),
    ]

    counts = {label: 0 for label, _, _ in groups}

    for entry in entries:
        employee = entry.get("employee", {}) or {}
        role_level = employee.get("role_level")

        for label, levels, _ in groups:
            if role_level in levels:
                counts[label] += 1
                break

    total = sum(counts.values())

    if total == 0:
        paragraph = document.add_paragraph(
            "Role level information is not available for this team."
        )

        for run in paragraph.runs:
            run.font.name = "Arial"
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor.from_string(MID_GREY)

        return

    fig, ax = plt.subplots(
        figsize=(7.2, 1.45),
        dpi=180,
        facecolor="white",
    )

    left = 0.0

    for label, _, color in groups:
        count = counts[label]

        if count == 0:
            continue

        percentage = count / total * 100

        ax.barh(
            [0],
            [percentage],
            left=left,
            color=color,
            height=0.35,
        )

        # Percentage ONLY, centred in its segment.
        if percentage >= 10:
            ax.text(
                left + percentage / 2,
                0,
                f"{round(percentage)}%",
                ha="center",
                va="center",
                fontsize=8,
                fontweight="bold",
                color="white",
            )

        left += percentage

    ax.set_xlim(0, 100)
    ax.set_ylim(-0.65, 0.65)
    ax.axis("off")

    # Counts remain down here, not inside the bar.
    legend = "     ".join(f"{label}: {counts[label]}" for label, _, _ in groups)

    ax.text(
        50,
        -0.48,
        legend,
        ha="center",
        va="center",
        fontsize=7.5,
        color=CHART_TEXT,
    )

    output = BytesIO()

    fig.savefig(
        output,
        format="png",
        dpi=180,
        bbox_inches="tight",
        facecolor="white",
    )

    plt.close(fig)

    output.seek(0)

    _add_chart_image(
        document,
        output,
        width=6.4,
    )


def _add_bullet_list(
    document: Document,
    items: list[str],
) -> None:
    """Render concise executive-summary bullet points."""

    if not items:
        paragraph = document.add_paragraph()

        run = paragraph.add_run("None identified from the supplied data.")

        run.font.name = "Arial"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor.from_string(MID_GREY)

        return

    for item in items:

        paragraph = document.add_paragraph(style="List Bullet")

        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(4)
        paragraph.paragraph_format.line_spacing = 1.1

        run = paragraph.add_run(str(item))

        run.font.name = "Arial"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor.from_string(DARK_GREY)


def _add_summary_subheading(
    document: Document,
    text: str,
) -> None:

    paragraph = document.add_paragraph()

    paragraph.paragraph_format.space_before = Pt(8)
    paragraph.paragraph_format.space_after = Pt(3)

    run = paragraph.add_run(text)

    run.bold = True
    run.font.name = "Arial"
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor.from_string(DARK_GREY)


def _add_executive_summary(
    document: Document,
    team_summary: dict,
) -> None:
    """
    Render the structured AI team assessment as a concise,
    visually scannable executive summary.
    """

    # ------------------------------------------------------------
    # Overall suitability + rating
    # ------------------------------------------------------------

    overall = team_summary.get("overall_suitability", {}) or {}

    rating = overall.get(
        "rating",
        "Assessment Unavailable",
    )

    points = overall.get("points", []) or []

    heading = document.add_paragraph()

    heading.paragraph_format.space_after = Pt(6)

    label_run = heading.add_run("Overall Team Suitability: ")

    label_run.bold = True
    label_run.font.name = "Arial"
    label_run.font.size = Pt(11)
    label_run.font.color.rgb = RGBColor.from_string(DARK_GREY)

    rating_run = heading.add_run(str(rating).upper())

    rating_run.bold = True
    rating_run.font.name = "Arial"
    rating_run.font.size = Pt(11)

    if rating == "Strong":
        rating_color = DELOITTE_GREEN

    elif rating == "Suitable with Considerations":
        rating_color = "C47F00"

    elif rating == "Requires Review":
        rating_color = "C00000"

    else:
        rating_color = MID_GREY

    rating_run.font.color.rgb = RGBColor.from_string(rating_color)

    _add_bullet_list(
        document,
        points,
    )

    # ------------------------------------------------------------
    # Key strengths
    # ------------------------------------------------------------

    _add_summary_subheading(
        document,
        "Key Strengths",
    )

    _add_bullet_list(
        document,
        team_summary.get(
            "key_strengths",
            [],
        )
        or [],
    )

    # ------------------------------------------------------------
    # Key risks
    # ------------------------------------------------------------

    _add_summary_subheading(
        document,
        "Key Risks",
    )

    _add_bullet_list(
        document,
        team_summary.get(
            "key_risks",
            [],
        )
        or [],
    )

    # ------------------------------------------------------------
    # Priority capability gaps
    # ------------------------------------------------------------

    _add_summary_subheading(
        document,
        "Priority Capability Gaps",
    )

    gaps = (
        team_summary.get(
            "priority_capability_gaps",
            [],
        )
        or []
    )

    if gaps:

        table = document.add_table(
            rows=1,
            cols=3,
        )

        table.style = "Table Grid"

        headers = [
            "Priority",
            "Capability",
            "Assessment",
        ]

        for index, header in enumerate(headers):

            cell = table.rows[0].cells[index]

            _set_cell_shading(
                cell,
                DARK_GREY,
            )

            _set_cell_text(
                cell,
                header,
                bold=True,
                color="FFFFFF",
                size=8,
            )

        priority_order = {
            "High": 0,
            "Medium": 1,
            "Low": 2,
        }

        sorted_gaps = sorted(
            gaps,
            key=lambda gap: priority_order.get(
                gap.get("priority", "Low"),
                3,
            ),
        )

        for gap in sorted_gaps:

            cells = table.add_row().cells

            priority = gap.get(
                "priority",
                "",
            )

            capability = gap.get(
                "capability",
                "",
            )

            insight = gap.get(
                "insight",
                "",
            )

            priority_color = {
                "High": "C00000",
                "Medium": "C47F00",
                "Low": MID_GREY,
            }.get(
                priority,
                MID_GREY,
            )

            _set_cell_text(
                cells[0],
                priority,
                bold=True,
                color=priority_color,
                size=8,
            )

            _set_cell_text(
                cells[1],
                capability,
                bold=True,
                size=8,
            )

            _set_cell_text(
                cells[2],
                insight,
                size=8,
            )

        document.add_paragraph()

    else:

        paragraph = document.add_paragraph()

        run = paragraph.add_run("No material priority capability gaps identified.")

        run.font.name = "Arial"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor.from_string(MID_GREY)

    # ------------------------------------------------------------
    # Management judgement
    # ------------------------------------------------------------

    _add_summary_subheading(
        document,
        "Management Judgement",
    )

    _add_bullet_list(
        document,
        team_summary.get(
            "management_judgement",
            [],
        )
        or [],
    )

    # ------------------------------------------------------------
    # Recommended actions
    # ------------------------------------------------------------

    _add_summary_subheading(
        document,
        "Recommended Actions",
    )

    actions = (
        team_summary.get(
            "recommended_actions",
            [],
        )
        or []
    )

    if not actions:

        paragraph = document.add_paragraph()

        run = paragraph.add_run("No additional actions identified.")

        run.font.name = "Arial"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor.from_string(MID_GREY)

    else:

        for index, action in enumerate(
            actions,
            start=1,
        ):

            paragraph = document.add_paragraph()

            paragraph.paragraph_format.space_after = Pt(4)
            paragraph.paragraph_format.line_spacing = 1.1

            number_run = paragraph.add_run(f"{index}. ")

            number_run.bold = True
            number_run.font.name = "Arial"
            number_run.font.size = Pt(9)
            number_run.font.color.rgb = RGBColor.from_string(DELOITTE_GREEN)

            action_run = paragraph.add_run(str(action))

            action_run.font.name = "Arial"
            action_run.font.size = Pt(9)
            action_run.font.color.rgb = RGBColor.from_string(DARK_GREY)


def _add_fit_summary(
    document: Document,
    entry: dict,
) -> None:
    table = document.add_table(rows=1, cols=4)
    table.style = "Table Grid"

    values = [
        (
            f"{round(entry['match_score'] * 100)}%",
            "Overall Match",
        ),
        (
            f"{entry['avg_fit']}/5",
            "Avg Fit",
        ),
        (
            str(entry["covered_count"]),
            "Skills Covered",
        ),
        (
            str(entry["gap_count"]),
            "Gaps to Address",
        ),
    ]

    for index, (value, label) in enumerate(values):
        cell = table.rows[0].cells[index]
        _set_cell_shading(cell, LIGHT_GREY)

        cell.text = ""

        paragraph = cell.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

        value_run = paragraph.add_run(value)
        value_run.bold = True
        value_run.font.name = "Arial"
        value_run.font.size = Pt(14)
        value_run.font.color.rgb = RGBColor.from_string(DELOITTE_GREEN)

        label_paragraph = cell.add_paragraph()
        label_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

        label_run = label_paragraph.add_run(label)
        label_run.font.name = "Arial"
        label_run.font.size = Pt(7)
        label_run.font.color.rgb = RGBColor.from_string(MID_GREY)

    document.add_paragraph()


def _add_capability_table(
    document: Document,
    fit_report: list[dict],
) -> None:
    table = document.add_table(rows=1, cols=4)
    table.style = "Table Grid"

    headers = [
        "Required Capability",
        "Weight",
        "Closest Employee Skill",
        "Fit",
    ]

    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        _set_cell_shading(cell, DARK_GREY)
        _set_cell_text(
            cell,
            header,
            bold=True,
            color="FFFFFF",
            size=8,
        )

    for fit in fit_report:
        cells = table.add_row().cells

        similarity = float(fit.get("similarity", 0.0))
        fit_score = min(5, max(1, int(similarity * 5 + 0.999999)))

        values = [
            fit.get("cap_name", ""),
            fit.get("weight", ""),
            fit.get("best_match_skill") or "No match found",
            f"{fit_score}/5",
        ]

        for index, value in enumerate(values):
            color = "C00000" if fit.get("is_gap") and index == 3 else DARK_GREY

            _set_cell_text(
                cells[index],
                value,
                color=color,
                size=8,
            )

    document.add_paragraph()


def build_team_report_docx(
    project: dict,
    entries: list[dict],
    team_summary: dict,
    worked_together_score: int | None = None,
    worked_together_count: int | None = None,
    rm_notes: str | None = None,
) -> BytesIO:
    """
    Build the final Team Capability Report and return it as an in-memory DOCX.
    """
    document = Document()

    section = document.sections[0]
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.7)
    section.right_margin = Inches(0.7)

    normal = document.styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(9)

    # ── Cover / project overview ──────────────────────────────────────────

    title = document.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(4)

    title_run = title.add_run(project.get("name", "Project"))
    title_run.bold = True
    title_run.font.name = "Arial"
    title_run.font.size = Pt(22)
    title_run.font.color.rgb = RGBColor.from_string(DARK_GREY)

    subtitle = document.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER

    subtitle_run = subtitle.add_run("TEAM CAPABILITY REPORT")
    subtitle_run.bold = True
    subtitle_run.font.name = "Arial"
    subtitle_run.font.size = Pt(11)
    subtitle_run.font.color.rgb = RGBColor.from_string(DELOITTE_GREEN)

    date_paragraph = document.add_paragraph()
    date_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

    date_run = date_paragraph.add_run(
        f"Generated {datetime.now().strftime('%d %B %Y')}"
    )
    date_run.font.name = "Arial"
    date_run.font.size = Pt(8)
    date_run.font.color.rgb = RGBColor.from_string(MID_GREY)

    _add_section_heading(document, "Project Overview")

    description = document.add_paragraph(
        project.get("description", "") or "No project description provided."
    )
    description.paragraph_format.space_after = Pt(10)
    description.paragraph_format.line_spacing = 1.15

    for run in description.runs:
        run.font.name = "Arial"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor.from_string(DARK_GREY)

    if project.get("client"):
        _add_small_label(
            document,
            "Client",
            str(project["client"]),
        )

    # ── Team overview ─────────────────────────────────────────────────────

    _add_section_heading(document, "Proposed Team")

    _add_team_overview_table(
        document,
        entries,
    )

    # ── Team capability radar ─────────────────────────────────────────────

    _add_section_heading(
        document,
        "Team Capability Match",
    )

    _add_team_capability_radar(
        document,
        entries,
    )

    # ── Role level distribution ───────────────────────────────────────────

    _add_section_heading(
        document,
        "Role Level Distribution",
    )

    _add_role_level_distribution(
        document,
        entries,
    )

    # ── Business Chemistry ─────────────────────────────────────────────────

    _add_section_heading(
        document,
        "Team Business Chemistry",
    )

    _add_business_chemistry(
        document,
        entries,
    )

    average_team_match = (
        round(sum(entry["match_score"] for entry in entries) / len(entries) * 100)
        if entries
        else 0
    )

    roles_with_gaps = sum(1 for entry in entries if entry["gap_count"] > 0)

    _add_team_metrics(
        document,
        average_team_match,
        roles_with_gaps,
        len(entries),
    )

    # ── Executive summary ────────────────────────────────────────────────

    _add_section_heading(document, "Executive Summary")

    _add_executive_summary(
        document,
        team_summary,
    )

    if (
        worked_together_score is not None
        or worked_together_count is not None
        or rm_notes
    ):
        _add_section_heading(document, "Resource Manager's Assessment")

        if worked_together_count is not None:
            _add_small_label(
                document,
                "Employees who have worked together before",
                f"{worked_together_count} of {len(entries)} team members",
            )
        elif worked_together_score is not None:
            _add_small_label(
                document,
                "Worked together before",
                f"{worked_together_score}/5",
            )

        if rm_notes:
            notes = document.add_paragraph(rm_notes)
            notes.paragraph_format.line_spacing = 1.15
            for run in notes.runs:
                run.font.name = "Arial"
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor.from_string(DARK_GREY)

    document.add_page_break()

    # ── Individual assignment profiles ───────────────────────────────────

    heading = document.add_paragraph()

    heading_run = heading.add_run("INDIVIDUAL ASSIGNMENT PROFILES")
    heading_run.bold = True
    heading_run.font.name = "Arial"
    heading_run.font.size = Pt(16)
    heading_run.font.color.rgb = RGBColor.from_string(DARK_GREY)

    for index, entry in enumerate(entries):
        employee = entry["employee"]

        if index > 0:
            document.add_page_break()

        _add_section_heading(
            document,
            entry["role_title"],
        )

        employee_name = document.add_paragraph()

        employee_name_run = employee_name.add_run(employee.get("name", ""))
        employee_name_run.bold = True
        employee_name_run.font.name = "Arial"
        employee_name_run.font.size = Pt(16)
        employee_name_run.font.color.rgb = RGBColor.from_string(DARK_GREY)

        employee_details = document.add_paragraph()

        detail_values = [
            employee.get("title"),
            employee.get("role_level"),
            employee.get("business_unit"),
            employee.get("location"),
        ]

        detail_run = employee_details.add_run(
            " | ".join(str(value) for value in detail_values if value)
        )
        detail_run.font.name = "Arial"
        detail_run.font.size = Pt(9)
        detail_run.font.color.rgb = RGBColor.from_string(MID_GREY)

        years = employee.get("years_experience")
        if years is not None:
            _add_small_label(
                document,
                "Experience",
                f"{years} years",
            )

        _add_fit_summary(
            document,
            entry,
        )

        # ── Individual capability radar ─────────────────────────────────

        _add_section_heading(
            document,
            "Capability Fit Profile",
        )

        _add_individual_capability_radar(
            document,
            entry["fit_report"],
        )

        _add_section_heading(
            document,
            "Profile",
        )

        profile = document.add_paragraph(
            employee.get("summary", "") or "No employee summary recorded."
        )

        profile.paragraph_format.line_spacing = 1.15

        # ── Detailed capability alignment ───────────────────────────────

        _add_section_heading(
            document,
            "Capability Alignment",
        )

        _add_capability_table(
            document,
            entry["fit_report"],
        )

        _add_section_heading(
            document,
            "Assignment Rationale",
        )

        rationale = document.add_paragraph(
            entry.get("rationale")
            or "AI-generated assignment rationale was unavailable for this export."
        )
        rationale.paragraph_format.line_spacing = 1.15

        _add_section_heading(
            document,
            "Relevant Experience",
        )

        _add_small_label(
            document,
            "Project experience",
            _clean_join(employee.get("project_experience", []) or []),
        )

        _add_small_label(
            document,
            "Industry experience",
            _clean_join(employee.get("industry_experience", []) or []),
        )

        _add_small_label(
            document,
            "Certifications",
            _clean_join(employee.get("certifications", []) or []),
        )

        if entry.get("member_note"):
            _add_small_label(
                document,
                "RM Notes",
                entry["member_note"],
            )

    # ── Methodology note ──────────────────────────────────────────────────

    document.add_page_break()

    _add_section_heading(
        document,
        "About This Report",
    )

    methodology = document.add_paragraph(
        "Role-match results are generated by comparing project capability "
        "requirements against recorded employee skills using the capability "
        "matching model. AI-generated assessments interpret the deterministic "
        "matching and capability-fit results and are intended to support "
        "staffing decisions alongside professional judgement and other "
        "relevant workforce information."
    )

    methodology.paragraph_format.line_spacing = 1.15

    attribution = document.add_paragraph(
        "This service uses the ESCO classification of the European Commission."
    )

    attribution.paragraph_format.space_before = Pt(10)

    for run in attribution.runs:
        run.font.name = "Arial"
        run.font.size = Pt(8)
        run.font.color.rgb = RGBColor.from_string(MID_GREY)

    output = BytesIO()
    document.save(output)
    output.seek(0)

    return output
