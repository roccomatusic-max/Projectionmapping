"""spread stacked outputs

Revision ID: a7c3e19b5f42
Revises: 5d2e8a41c7b3
Create Date: 2026-10-17 21:20:00.000000

Outputs used to be created covering the whole canvas, so a show with
several of them had every output exactly on top of the others. Shows still
in that state (every output on the whole canvas, no blends set) are laid
out side by side, which is what new outputs now get. Shows whose outputs
were placed by hand are left alone.
"""
from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision = 'a7c3e19b5f42'
down_revision = '5d2e8a41c7b3'
branch_labels = None
depends_on = None

_FULL = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}


def _load(value, default):
    if value is None or value == "":
        return default
    if isinstance(value, dict | list):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def _covers_canvas(source) -> bool:
    if not isinstance(source, dict):
        return False
    try:
        return all(abs(float(source.get(k, _FULL[k])) - _FULL[k]) < 1e-4 for k in _FULL)
    except (TypeError, ValueError):
        return False


def _unblended(blend) -> bool:
    if not isinstance(blend, dict):
        return True
    return all(not (isinstance(edge, dict) and float(edge.get("width") or 0) > 0)
               for edge in blend.values())


def upgrade() -> None:
    conn = op.get_bind()
    outputs = sa.table(
        "mapping_outputs",
        sa.column("id", sa.Integer), sa.column("show_id", sa.Integer),
        sa.column("position", sa.Integer), sa.column("source", sa.JSON),
        sa.column("blend", sa.JSON),
    )
    rows = conn.execute(
        sa.select(outputs.c.id, outputs.c.show_id, outputs.c.source, outputs.c.blend)
        .order_by(outputs.c.show_id, outputs.c.position, outputs.c.id)
    ).all()
    shows: dict[int, list] = {}
    for row in rows:
        shows.setdefault(row.show_id, []).append(row)
    for items in shows.values():
        if len(items) < 2:
            continue
        if not all(_covers_canvas(_load(r.source, {})) and _unblended(_load(r.blend, {}))
                   for r in items):
            continue
        count = len(items)
        for i, row in enumerate(items):
            conn.execute(
                outputs.update().where(outputs.c.id == row.id)
                .values(source={"x": i / count, "y": 0.0, "w": 1 / count, "h": 1.0})
            )


def downgrade() -> None:
    # Layout only; nothing to undo in the schema.
    pass
