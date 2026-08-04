"""Documents agent — turns an artifact into a real file in the user's account."""

from __future__ import annotations

from nova_a2a.agents._common import AgentSpec, skill

SPEC = AgentSpec(
    id="docs",
    name="Documents agent",
    description="Creates documents and spreadsheets in the user's connected drive.",
    skills=(
        skill(
            "docs.write",
            "Create a document",
            "Create a document from supplied content and return its link.",
            tags=("documents", "drive"),
            examples=("Generate a Google Doc with the interview key points",),
        ),
        skill(
            "sheets.write",
            "Create a spreadsheet",
            "Create a spreadsheet and append rows of tabular data.",
            tags=("spreadsheets", "drive"),
            examples=("Create a spreadsheet with last week's expenses",),
        ),
        skill(
            "drive.read",
            "Browse files",
            "List files in the user's connected drive.",
            tags=("drive",),
            examples=("What files did I add to Drive this week?",),
        ),
    ),
    tool_names=(
        "google_create_document",
        "google_create_spreadsheet",
        "google_append_sheet_rows",
        "google_list_drive_files",
        "microsoft_list_files",
    ),
    requires_any=("google", "microsoft"),
    instructions=(
        "Write the document from the content you are given in the task context. "
        "Never invent sections that the upstream research did not produce, and never "
        "start writing before that content is present — if it is missing, fail the "
        "task and say what you were waiting for. Always return the document link."
    ),
)
