"""output care

Revision ID: b8f3d6a1e4c9
Revises: c7e1a5d9f3b2
Create Date: 2026-11-09 23:40:00.000000

Keeping a picture on every projector: restart each mini PC's output at a
set time every day, and restart it during a show when it stops drawing.
Both are on from the start, the daily one at 7:00 in the morning.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'b8f3d6a1e4c9'
down_revision = 'c7e1a5d9f3b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'output_care',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('daily_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('daily_time', sa.String(length=5), nullable=False, server_default='07:00'),
        sa.Column('watchdog_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('last_daily_on', sa.String(length=10), nullable=True),
        sa.Column('last_daily_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_daily_note', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('output_care')
