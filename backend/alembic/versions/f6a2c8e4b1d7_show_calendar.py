"""show calendar

Revision ID: f6a2c8e4b1d7
Revises: d3f7b1a9c5e2
Create Date: 2026-10-25 16:30:00.000000

Shows planned ahead on a calendar: a date, a run of dates or repeating
weekdays, each with a scene group and a start and end time. The show plan
remembers which show time it last started by a key, since a night can now
have more than one.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'f6a2c8e4b1d7'
down_revision = 'd3f7b1a9c5e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'show_calendar',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=8), nullable=False),
        sa.Column('title', sa.String(length=128), nullable=False, server_default=''),
        sa.Column('show_id', sa.Integer(), nullable=True),
        sa.Column('group_id', sa.Integer(), nullable=True),
        sa.Column('start_date', sa.String(length=10), nullable=False),
        sa.Column('end_date', sa.String(length=10), nullable=True),
        sa.Column('days', sa.JSON(), nullable=False),
        sa.Column('start_at', sa.String(length=5), nullable=True),
        sa.Column('end_at', sa.String(length=5), nullable=True),
        sa.Column('power', sa.Boolean(), nullable=False),
        sa.Column('note', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['show_id'], ['mapping_shows.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['group_id'], ['mapping_scene_groups.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_show_calendar_show_id', 'show_calendar', ['show_id'])
    with op.batch_alter_table('show_plan') as batch:
        batch.add_column(sa.Column('last_start_key', sa.String(length=64), nullable=True))
        batch.add_column(sa.Column('last_end_key', sa.String(length=64), nullable=True))
    # A night already started keeps counting as started after the upgrade.
    for key, night in (('last_start_key', 'last_start_date'), ('last_end_key', 'last_end_date')):
        op.execute(sa.text(f"UPDATE show_plan SET {key} = {night} || :suffix "
                           f"WHERE {night} IS NOT NULL").bindparams(suffix=':weekly'))

def downgrade() -> None:
    with op.batch_alter_table('show_plan') as batch:
        batch.drop_column('last_end_key')
        batch.drop_column('last_start_key')
    op.drop_index('ix_show_calendar_show_id', table_name='show_calendar')
    op.drop_table('show_calendar')
