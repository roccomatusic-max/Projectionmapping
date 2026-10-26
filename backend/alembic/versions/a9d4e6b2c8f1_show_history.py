"""show history

Revision ID: a9d4e6b2c8f1
Revises: f6a2c8e4b1d7
Create Date: 2026-10-26 16:30:00.000000

A row for every show time: when it started and ended, what played, the
problems it hit and the hottest projector readings, kept after the
temperature samples themselves are pruned. And one row of settings for the
energy report: the electricity price and each projector's watts.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'a9d4e6b2c8f1'
down_revision = 'f6a2c8e4b1d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'show_nights',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('night', sa.String(length=10), nullable=False),
        sa.Column('key', sa.String(length=64), nullable=True),
        sa.Column('title', sa.String(length=128), nullable=False, server_default=''),
        sa.Column('source', sa.String(length=16), nullable=False, server_default='hand'),
        sa.Column('show_id', sa.Integer(), nullable=True),
        sa.Column('show_name', sa.String(length=128), nullable=False, server_default=''),
        sa.Column('group_name', sa.String(length=128), nullable=True),
        sa.Column('planned_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('planned_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('started_by', sa.String(length=64), nullable=True),
        sa.Column('ended_by', sa.String(length=64), nullable=True),
        sa.Column('outcome', sa.String(length=16), nullable=False, server_default='running'),
        sa.Column('message', sa.Text(), nullable=False, server_default=''),
        sa.Column('timeline', sa.JSON(), nullable=False),
        sa.Column('problems', sa.JSON(), nullable=False),
        sa.Column('stats', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_show_nights_night', 'show_nights', ['night'])
    op.create_index('ix_show_nights_key', 'show_nights', ['key'])
    op.create_table(
        'history_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('price_per_kwh', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=8), nullable=False, server_default='$'),
        sa.Column('watts', sa.JSON(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('history_settings')
    op.drop_index('ix_show_nights_key', table_name='show_nights')
    op.drop_index('ix_show_nights_night', table_name='show_nights')
    op.drop_table('show_nights')
