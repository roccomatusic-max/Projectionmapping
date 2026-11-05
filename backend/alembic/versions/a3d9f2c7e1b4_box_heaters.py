"""box heaters

Revision ID: a3d9f2c7e1b4
Revises: f6a2c8e4b1d7
Create Date: 2026-10-26 16:30:00.000000

Heaters in projector boxes switched by smart plugs (never while their
projector is on, warmed up before the show), a minute-by-minute
history of each (inside, outside, on or off), and where the house is for
the outside temperature.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'a3d9f2c7e1b4'
down_revision = 'f6a2c8e4b1d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'heaters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('plug_kind', sa.String(length=16), nullable=False),
        sa.Column('plug_address', sa.String(length=255), nullable=False),
        sa.Column('plug_entity', sa.String(length=255), nullable=True),
        sa.Column('plug_secret_enc', sa.Text(), nullable=True),
        sa.Column('mode', sa.String(length=8), nullable=False),
        sa.Column('hold_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sensor_player_id', sa.Integer(), nullable=True),
        sa.Column('projector_id', sa.Integer(), nullable=True),
        sa.Column('on_below_c', sa.Float(), nullable=False),
        sa.Column('off_above_c', sa.Float(), nullable=False),
        sa.Column('max_inside_c', sa.Float(), nullable=False),
        sa.Column('outside_on_below_c', sa.Float(), nullable=False),
        sa.Column('outside_off_above_c', sa.Float(), nullable=False),
        sa.Column('max_minutes_per_hour', sa.Integer(), nullable=False),
        sa.Column('interlock', sa.Boolean(), nullable=False),
        sa.Column('warmup_minutes', sa.Integer(), nullable=False),
        sa.Column('is_on', sa.Boolean(), nullable=True),
        sa.Column('on_since', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rest_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_switched_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reason', sa.Text(), nullable=False, server_default=''),
        sa.Column('plug_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['sensor_player_id'], ['mapping_players.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['projector_id'], ['projectors.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_table(
        'heater_readings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('heater_id', sa.Integer(), nullable=False),
        sa.Column('inside_c', sa.Float(), nullable=True),
        sa.Column('inside_source', sa.String(length=16), nullable=True),
        sa.Column('outside_c', sa.Float(), nullable=True),
        sa.Column('is_on', sa.Boolean(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['heater_id'], ['heaters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_heater_readings_lookup', 'heater_readings', ['heater_id', 'recorded_at'])
    op.create_table(
        'weather_place',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('weather_place')
    op.drop_index('ix_heater_readings_lookup', table_name='heater_readings')
    op.drop_table('heater_readings')
    op.drop_table('heaters')
