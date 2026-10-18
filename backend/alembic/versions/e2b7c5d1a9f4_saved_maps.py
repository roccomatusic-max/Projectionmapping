"""saved maps

Revision ID: e2b7c5d1a9f4
Revises: c4e1d9a7b2f3
Create Date: 2026-10-18 00:40:00.000000

Maps saved from a show (outputs, calibration, traced house parts) so a
new show can start from them.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'e2b7c5d1a9f4'
down_revision = 'c4e1d9a7b2f3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'mapping_maps',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('canvas_width', sa.Integer(), nullable=False),
        sa.Column('canvas_height', sa.Integer(), nullable=False),
        sa.Column('camera_view', sa.JSON(), nullable=False),
        sa.Column('surfaces', sa.JSON(), nullable=False),
        sa.Column('outputs', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )


def downgrade() -> None:
    op.drop_table('mapping_maps')
