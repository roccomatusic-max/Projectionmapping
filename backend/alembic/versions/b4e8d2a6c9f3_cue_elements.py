"""cue elements

Revision ID: b4e8d2a6c9f3
Revises: a9d4e7c2b6f1
Create Date: 2026-10-26 23:30:00.000000

Elements a cue carries on its own, and elements a show puts on every cue,
kept apart from the scenes so scene groups and playlists leave them be.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'b4e8d2a6c9f3'
down_revision = 'a9d4e7c2b6f1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('mapping_cues') as batch:
        batch.add_column(sa.Column('elements', sa.JSON(), nullable=False, server_default='[]'))
    with op.batch_alter_table('mapping_shows') as batch:
        batch.add_column(sa.Column('every_cue_elements', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    with op.batch_alter_table('mapping_shows') as batch:
        batch.drop_column('every_cue_elements')
    with op.batch_alter_table('mapping_cues') as batch:
        batch.drop_column('elements')
