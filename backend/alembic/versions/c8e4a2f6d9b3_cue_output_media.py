"""cue output media

Revision ID: c8e4a2f6d9b3
Revises: b5d2e8c4f1a7
Create Date: 2026-10-18 14:00:00.000000

A cue can give some projectors a picture of their own.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'c8e4a2f6d9b3'
down_revision = 'b5d2e8c4f1a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('mapping_cues') as batch:
        batch.add_column(sa.Column('output_media', sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    with op.batch_alter_table('mapping_cues') as batch:
        batch.drop_column('output_media')
