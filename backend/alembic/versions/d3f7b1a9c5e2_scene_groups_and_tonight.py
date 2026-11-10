"""scene groups and tonight's show

Revision ID: d3f7b1a9c5e2
Revises: c8e4a2f6d9b3
Create Date: 2026-10-24 17:30:00.000000

A scene group picks a scene for every projector at once; the show plan
says which group plays tonight and when the show starts and ends.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'd3f7b1a9c5e2'
down_revision = 'c8e4a2f6d9b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'mapping_scene_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('show_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('scene_id', sa.Integer(), nullable=True),
        sa.Column('output_scenes', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['show_id'], ['mapping_shows.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['scene_id'], ['mapping_scenes.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('show_id', 'name', name='uq_scene_group_name'),
    )
    op.create_index('ix_mapping_scene_groups_show_id', 'mapping_scene_groups', ['show_id'])
    op.create_table(
        'show_plan',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('show_id', sa.Integer(), nullable=True),
        sa.Column('group_id', sa.Integer(), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('start_at', sa.String(length=5), nullable=True),
        sa.Column('end_at', sa.String(length=5), nullable=True),
        sa.Column('days', sa.JSON(), nullable=False),
        sa.Column('power', sa.Boolean(), nullable=False),
        sa.Column('last_start_date', sa.String(length=10), nullable=True),
        sa.Column('last_end_date', sa.String(length=10), nullable=True),
        sa.Column('last_message', sa.Text(), nullable=False, server_default=''),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['show_id'], ['mapping_shows.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['group_id'], ['mapping_scene_groups.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('show_plan')
    op.drop_index('ix_mapping_scene_groups_show_id', table_name='mapping_scene_groups')
    op.drop_table('mapping_scene_groups')
