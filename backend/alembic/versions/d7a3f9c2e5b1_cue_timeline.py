"""cue timeline

Revision ID: d7a3f9c2e5b1
Revises: b4e8d2a6c9f3
Create Date: 2026-10-27 16:00:00.000000

A cue's timeline from the show designer: videos, pictures, elements and
sounds that come and go at set times while the cue plays.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'd7a3f9c2e5b1'
down_revision = 'b4e8d2a6c9f3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('mapping_cues') as batch:
        batch.add_column(sa.Column('timeline', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('mapping_cues') as batch:
        batch.drop_column('timeline')
