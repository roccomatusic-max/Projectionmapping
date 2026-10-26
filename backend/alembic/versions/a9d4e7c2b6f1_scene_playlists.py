"""scene playlists

Revision ID: a9d4e7c2b6f1
Revises: a9d4e6b2c8f1
Create Date: 2026-10-26 16:30:00.000000

Playlists of scene groups that take turns through the night at set times,
with a fade between them. The weekly show time and calendar entries can
play a playlist instead of a single scene group.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'a9d4e7c2b6f1'
down_revision = 'a9d4e6b2c8f1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'mapping_playlists',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('show_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('steps', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['show_id'], ['mapping_shows.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('show_id', 'name', name='uq_playlist_name'),
    )
    op.create_index('ix_mapping_playlists_show_id', 'mapping_playlists', ['show_id'])
    with op.batch_alter_table('show_plan') as batch:
        batch.add_column(sa.Column('playlist_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_show_plan_playlist_id', 'mapping_playlists',
                                 ['playlist_id'], ['id'], ondelete='SET NULL')
    with op.batch_alter_table('show_calendar') as batch:
        batch.add_column(sa.Column('playlist_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_show_calendar_playlist_id', 'mapping_playlists',
                                 ['playlist_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('show_calendar') as batch:
        batch.drop_constraint('fk_show_calendar_playlist_id', type_='foreignkey')
        batch.drop_column('playlist_id')
    with op.batch_alter_table('show_plan') as batch:
        batch.drop_constraint('fk_show_plan_playlist_id', type_='foreignkey')
        batch.drop_column('playlist_id')
    op.drop_index('ix_mapping_playlists_show_id', table_name='mapping_playlists')
    op.drop_table('mapping_playlists')
