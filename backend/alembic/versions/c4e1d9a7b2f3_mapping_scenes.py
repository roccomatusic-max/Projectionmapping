"""mapping scenes and traced surfaces

Revision ID: c4e1d9a7b2f3
Revises: a7c3e19b5f42
Create Date: 2026-10-17 22:10:00.000000

A scene library (generated, people-reactive designs a cue can play), the
cue's link to it, and the building surfaces traced on each show's canvas.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'c4e1d9a7b2f3'
down_revision = 'a7c3e19b5f42'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'mapping_scenes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('layers', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    with op.batch_alter_table('mapping_cues', schema=None) as batch_op:
        batch_op.add_column(sa.Column('scene_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_mapping_cues_scene_id', 'mapping_scenes',
                                    ['scene_id'], ['id'], ondelete='SET NULL')
    with op.batch_alter_table('mapping_shows', schema=None) as batch_op:
        batch_op.add_column(sa.Column('surfaces', sa.JSON(), server_default='[]', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('mapping_shows', schema=None) as batch_op:
        batch_op.drop_column('surfaces')
    with op.batch_alter_table('mapping_cues', schema=None) as batch_op:
        batch_op.drop_constraint('fk_mapping_cues_scene_id', type_='foreignkey')
        batch_op.drop_column('scene_id')
    op.drop_table('mapping_scenes')
