"""cue output scenes

Revision ID: b5d2e8c4f1a7
Revises: e2b7c5d1a9f4
Create Date: 2026-10-18 03:40:00.000000

A cue can play a different scene on some projectors.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'b5d2e8c4f1a7'
down_revision = 'e2b7c5d1a9f4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('mapping_cues') as batch:
        batch.add_column(sa.Column('output_scenes', sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    with op.batch_alter_table('mapping_cues') as batch:
        batch.drop_column('output_scenes')
